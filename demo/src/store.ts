/**
 * O estado compartilhado da demonstração: um único Durable Object.
 *
 * Instância única de propósito — todo visitante vê o mesmo feed, e o custo
 * tem teto natural. Guarda os lançamentos em SQLite (o único armazenamento
 * que o plano gratuito aceita), mantém as conexões de tempo real abertas e
 * apaga sozinho, por alarme, o que os visitantes lançam.
 *
 * Cada rota repete o comportamento do backend Java — consulta por consulta no
 * caso do dashboard — porque o app que a consome é o app real, sem nenhum
 * ajuste para a demo além de esconder botões.
 *
 * **Leitura sai da memória, não do SQLite.** O plano gratuito cobra linhas
 * lidas (5 milhões por dia), e com o histórico de 13 meses cada consulta
 * agregada varria ~730 linhas: um único IP dentro do limite de leituras
 * esgotava a cota do dia em menos de uma hora — pelo dashboard de 3 anos, em
 * ~11 minutos. O histórico fictício é o mesmo o dia inteiro e só este objeto
 * escreve, então ele vive em memória (`history`), e do SQLite cada requisição
 * lê no máximo os lançamentos de visitante (teto de 30), e só depois de uma
 * escrita (`visitors`). O custo por requisição fica limitado pelo desenho, não
 * por IP. As agregações são as mesmas consultas do backend, em JavaScript.
 */
import { DurableObject } from 'cloudflare:workers'
import {
  ACCOUNTS,
  KIND_LABEL,
  UNCATEGORIZED,
  accountById,
  accountsByName,
  categoriesOrdered,
  categoryById,
} from './catalog'
import {
  HttpError,
  addDays,
  daysBetween,
  errorResponse,
  firstOfMonth,
  fromCents,
  isIsoDate,
  json,
  lastOfMonth,
  normalize,
  percent,
  toCents,
  today,
  type Account,
  type AccountBalance,
  type Cashflow,
  type CategorySlice,
  type CategoryTrends,
  type DailyPoint,
  type DashboardSummary,
  type Flow,
  type PageResponse,
  type PluggyAccount,
  type PluggyStatus,
  type RecurringExpenses,
  type Transaction,
  type TransactionEvent,
  type TransactionSource,
  clientKey,
  visitorTag,
} from './contract'
import type { Env } from './env'
import { VISITOR_HEADER, tooMany } from './fence'
import { generateHistory, recentStart, type SeedRow } from './seed'
import {
  addMonths,
  cashflow,
  cashflowWindow,
  categoryTrends,
  findRecurring,
  monthParam,
  rangeParam,
  recurringWindow,
  throughDay,
  toDateEnd,
  type CategoryMonthSum,
  type ExpenseLine,
} from './analytics'

/** Quanto um lançamento de visitante dura na tela. Ver LANDING_DEMO.md, 2.2. */
const VISITOR_TTL_MS = 10 * 60 * 1000
/** Quantos lançamentos de visitante cabem ao mesmo tempo. */
const VISITOR_CAP = 30
/** Abaixo do timeout de ociosidade da Cloudflare, como no backend real. */
const HEARTBEAT_MS = 25_000
/**
 * Limites exatos, contados aqui porque o objeto é instância única e vê toda
 * escrita. A borda (fence.ts) só barra rajada aproximada; estes valem sempre.
 */
const PER_IP_PER_MINUTE = 10
const PER_IP_PER_DAY = 100
const GLOBAL_PER_MINUTE = 120
/**
 * Conexões ao vivo. Cada uma custa uma escrita por evento e por heartbeat, e
 * nada impedia uma máquina de segurar milhares. Por cliente com folga: uma
 * sala inteira atrás do mesmo IP precisa caber.
 */
const MAX_STREAMS = 300
const MAX_STREAMS_PER_CLIENT = 10
/**
 * Vida máxima de uma conexão ao vivo. O servidor encerra e o EventSource,
 * se o navegador ainda estiver ali, reconecta sozinho em ~3 s — o visitante
 * não percebe. Garante que uma vaga presa volta mesmo quando a desconexão não
 * é avisada: medido no `wrangler dev`, nem `request.signal` nem a fila cheia
 * disparavam, e o IP ficava bloqueado indefinidamente.
 */
const STREAM_MAX_AGE_MS = 5 * 60 * 1000
/** `page` enorme gerava OFFSET inválido no SQLite. */
const MAX_PAGE = 10_000
/** Sobe quando a tabela muda: o dado é efêmero, então mudar = recriar. */
const SCHEMA_VERSION = '2'
/**
 * Sobe quando o gerador do histórico (seed.ts) muda. Vai junto da data no
 * `seed_date`: o objeto que já está no ar compara, vê a versão nova e regera
 * na primeira requisição — sem isso, o seed novo só apareceria à meia-noite.
 * A tabela não muda, então o esquema fica onde está.
 */
const SEED_VERSION = '3'
/** `DashboardResource.MAX_RANGE_DAYS`. */
const MAX_RANGE_DAYS = 366 * 3
const RECENT_LIMIT = 8

/** Uma linha da tabela `tx`, já com os dados do lançamento que ela talvez duplique. */
interface TxRow {
  id: number
  account_id: number
  category_id: number | null
  flow: Flow
  amount_cents: number
  description: string | null
  occurred_on: string
  source: TransactionSource
  notes: string | null
  created_at: string
  review_status: string
  review_reason: string | null
  duplicate_of_id: number | null
  visitor_key: string | null
  dup_date: string | null
  dup_description: string | null
  dup_source: string | null
  [key: string]: SqlStorageValue
}

const notIgnored = (row: TxRow) => row.review_status !== 'IGNORED'

/** `ORDER BY occurred_on DESC, id DESC`. */
const newestFirst = (a: TxRow, b: TxRow) =>
  a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : b.id - a.id

const encoder = new TextEncoder()

export class DemoStore extends DurableObject<Env> {
  private readonly sql: SqlStorage
  private readonly streams = new Set<WritableStreamDefaultWriter<Uint8Array>>()
  private readonly streamOwner = new Map<WritableStreamDefaultWriter<Uint8Array>, string>()
  private readonly streamsPerClient = new Map<string, number>()
  private heartbeat: number | null = null
  private readonly limits = new Limits()
  /** Versão e dia do histórico em memória; `null` até o primeiro uso. */
  private seedKey: string | null = null
  /** O histórico fictício do dia (sem visitantes), já com os campos da duplicata. */
  private history: TxRow[] = []
  private historyById = new Map<number, TxRow>()
  /** Saldo inicial efetivo por conta, em centavos; ver `loadHistory`. */
  private opening = new Map<number, number>()
  /** Lançamentos de visitante; `null` = reler do SQLite (no máximo 30 linhas). */
  private visitors: TxRow[] | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    ctx.blockConcurrencyWhile(async () => this.migrate())
  }

  // ================================================================ esquema

  private migrate() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    const version = this.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema'`).toArray()[0]
    if (version?.value !== SCHEMA_VERSION) {
      // Tudo aqui é refeito a partir do código: apagar não perde nada.
      this.sql.exec(`DROP TABLE IF EXISTS tx; DELETE FROM meta`)
      this.sql.exec(`INSERT INTO meta (key, value) VALUES ('schema', ?)`, SCHEMA_VERSION)
    }
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS tx (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id       INTEGER NOT NULL,
        category_id      INTEGER,
        flow             TEXT    NOT NULL,
        amount_cents     INTEGER NOT NULL,
        description      TEXT,
        occurred_on      TEXT    NOT NULL,
        source           TEXT    NOT NULL,
        notes            TEXT,
        created_at       TEXT    NOT NULL,
        review_status    TEXT    NOT NULL DEFAULT 'NONE',
        review_reason    TEXT,
        duplicate_of_id  INTEGER,
        -- 1 = lancado por um visitante: expira em VISITOR_TTL_MS.
        visitor          INTEGER NOT NULL DEFAULT 0,
        expires_at       INTEGER,
        -- Chave gerada pela landing de quem lancou; so serve para a landing
        -- destacar "voce". Nunca sai do objeto (ver demoFeed).
        visitor_key      TEXT
      );
      CREATE INDEX IF NOT EXISTS tx_occurred ON tx (occurred_on, id);
      CREATE INDEX IF NOT EXISTS tx_expires ON tx (visitor, expires_at);
    `)
  }

  /**
   * Refaz o histórico quando o dia vira. O histórico é relativo a hoje
   * (src/seed.ts): sem isto, um objeto que ficasse acordado da noite para o
   * dia mostraria "hoje" com os lançamentos de ontem.
   *
   * Acordado, o objeto já tem o histórico em memória e não lê nada. Ao
   * acordar, ele regera o histórico do dia — determinístico, sem ler o
   * SQLite — e só lê do `meta` a versão e os ids (2 linhas). Os ids ficam
   * guardados porque o AUTOINCREMENT não recomeça a cada dia, e o id é o que
   * o app usa para abrir um lançamento.
   */
  private ensureFresh() {
    const day = today()
    const key = `${SEED_VERSION}:${day}`
    if (this.seedKey === key) return

    const rows = generateHistory(day)
    const meta = new Map(
      this.sql
        .exec<{ key: string; value: string }>(`SELECT key, value FROM meta WHERE key IN ('seed_date', 'seed_ids')`)
        .toArray()
        .map((row) => [row.key, row.value]),
    )
    let ids = meta.get('seed_date') === key ? parseIds(meta.get('seed_ids'), rows.length) : null
    if (ids === null) {
      ids = this.reseed(rows, key)
      this.visitors = null
      // Os lançamentos de visitante foram junto: nada mais para expirar.
      void this.ctx.storage.deleteAlarm()
    }
    this.loadHistory(day, rows, ids)
    this.seedKey = key
  }

  /**
   * Regrava o histórico no SQLite, numa transação: ~730 inserts, uma vez por
   * dia (ou por versão nova do seed). Medido no `wrangler dev`: ver
   * LANDING_DEMO.md, 1.2.
   */
  private reseed(rows: SeedRow[], key: string): number[] {
    const ids: number[] = []
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM tx')
      for (const row of rows) {
        const duplicateOf = row.duplicateOfIndex === null ? null : ids[row.duplicateOfIndex]
        const inserted = this.sql
          .exec<{ id: number }>(
            `INSERT INTO tx (account_id, category_id, flow, amount_cents, description, occurred_on, source, notes,
                             created_at, review_status, review_reason, duplicate_of_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            row.accountId, row.categoryId, row.flow, row.cents, row.description, row.occurredOn, row.source,
            row.notes, `${row.occurredOn}T15:00:00Z`, row.reviewStatus, row.reviewReason, duplicateOf,
          )
          .one()
        ids.push(inserted.id)
      }
      this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_date', ?)`, key)
      this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_ids', ?)`, JSON.stringify(ids))
      // Chave da versão anterior desta mesma leva, que guardava o saldo inicial.
      this.sql.exec(`DELETE FROM meta WHERE key = 'opening'`)
    })
    return ids
  }

  /**
   * Monta o histórico em memória com as mesmas colunas que a consulta
   * `SELECT t.*, d.occurred_on AS dup_date, ...` devolvia, para `toDto` e as
   * agregações não saberem a diferença.
   *
   * Também calcula o saldo inicial efetivo. O histórico longo (13 meses, para
   * as Análises) não pode mexer no saldo das contas: o saldo inicial do
   * catálogo foi calibrado para a janela recente de ~3 meses, e 13 meses de
   * cartão sem pagamento de fatura dariam −R$ 15 mil. Então o inicial desconta
   * o líquido de tudo que vem antes de `recentStart` — a conta "abriu" 13
   * meses atrás com o saldo que, somado ao histórico antigo, chega ao mesmo
   * ponto de antes. A fórmula do saldo continua a do backend (inicial +
   * entradas − saídas); só o inicial muda, e ele só aparece no formulário de
   * conta, que a demo esconde.
   */
  private loadHistory(day: string, rows: SeedRow[], ids: number[]) {
    this.history = rows.map((row, i) => {
      const dup = row.duplicateOfIndex === null ? null : rows[row.duplicateOfIndex]
      return {
        id: ids[i],
        account_id: row.accountId,
        category_id: row.categoryId,
        flow: row.flow,
        amount_cents: row.cents,
        description: row.description,
        occurred_on: row.occurredOn,
        source: row.source,
        notes: row.notes,
        created_at: `${row.occurredOn}T15:00:00Z`,
        review_status: row.reviewStatus,
        review_reason: row.reviewReason,
        duplicate_of_id: row.duplicateOfIndex === null ? null : ids[row.duplicateOfIndex],
        visitor: 0,
        expires_at: null,
        visitor_key: null,
        dup_date: dup?.occurredOn ?? null,
        dup_description: dup?.description ?? null,
        dup_source: dup?.source ?? null,
      }
    })
    this.historyById = new Map(this.history.map((row) => [row.id, row]))

    const start = recentStart(day)
    this.opening = new Map(ACCOUNTS.map((account) => [account.id, account.openingCents]))
    for (const row of this.history) {
      if (row.occurred_on >= start || !notIgnored(row)) continue
      const signed = row.flow === 'INCOME' ? row.amount_cents : -row.amount_cents
      this.opening.set(row.account_id, (this.opening.get(row.account_id) ?? 0) - signed)
    }
  }

  private openingCents(accountId: number): number {
    return this.opening.get(accountId) ?? accountById.get(accountId)!.openingCents
  }

  /**
   * Os lançamentos de visitante, relidos só depois de uma escrita. O teto
   * (VISITOR_CAP) vale na gravação, então a leitura nunca passa de ~30 linhas,
   * pelo índice `tx_expires`.
   */
  private visitorRows(): TxRow[] {
    this.visitors ??= this.sql
      .exec<TxRow>(`SELECT * FROM tx WHERE visitor = 1`)
      .toArray()
      // Visitante nunca é duplicata de nada (o app não marca), como no LEFT JOIN de antes.
      .map((row) => ({ ...row, dup_date: null, dup_description: null, dup_source: null }))
    return this.visitors
  }

  /** Todos os lançamentos, inclusive ignorados: histórico + visitantes. */
  private allRows(): TxRow[] {
    return [...this.history, ...this.visitorRows()]
  }

  /** O que entra em qualquer total: tudo menos os ignorados. */
  private liveRows(): TxRow[] {
    return this.allRows().filter(notIgnored)
  }

  // ================================================================ rotas

  async fetch(request: Request): Promise<Response> {
    this.ensureFresh()
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')
    const method = request.method

    try {
      if (method === 'GET') {
        switch (path) {
          case '/api/v1/dashboard':
            return json(this.dashboard(url.searchParams))
          case '/api/v1/transactions':
            return json(this.search(url.searchParams))
          case '/api/v1/accounts':
            return json(this.accounts())
          case '/api/v1/categories':
            return json(this.categories(url.searchParams))
          case '/api/v1/review':
            return json(this.reviewQueue())
          case '/api/v1/review/count':
            return json({ pending: this.reviewQueue().length })
          case '/api/v1/pluggy/status':
            return json(this.pluggyStatus())
          case '/api/v1/pluggy/accounts':
            return json(this.pluggyAccounts())
          case '/api/v1/quick-entry/options':
            return json(this.options())
          case '/api/v1/events/stream':
            return this.openStream(clientKey(request.headers.get('CF-Connecting-IP')), request.signal)
          case '/api/v1/demo/feed':
            return json(this.demoFeed(request.headers.get(VISITOR_HEADER)))
          case '/api/v1/analytics/categories':
            return json(this.analyticsCategories(url.searchParams))
          case '/api/v1/analytics/recurring':
            return json(this.analyticsRecurring(url.searchParams))
          case '/api/v1/analytics/cashflow':
            return json(this.analyticsCashflow(url.searchParams))
        }
        const one = path.match(/^\/api\/v1\/transactions\/(\d+)$/)
        if (one) return json(this.findById(Number(one[1])))
        throw new HttpError(404, 'Recurso nao encontrado')
      }

      if (method === 'POST' && (path === '/api/v1/transactions' || path === '/api/v1/quick-entry')) {
        const rejected = this.limits.check(clientKey(request.headers.get('CF-Connecting-IP')))
        if (rejected) return rejected
        const visitor = request.headers.get(VISITOR_HEADER)
        const created =
          path === '/api/v1/quick-entry' ? await this.quickEntry(request, visitor) : await this.createManual(request, visitor)
        return json(created, 201)
      }

      // Toda outra escrita: editar, excluir, revisar, configurar, sincronizar.
      // Decidir algo aqui mudaria a demo para todos os visitantes.
      throw new HttpError(403, 'Somente leitura na demonstracao', [
        'Na demonstracao so lancamentos novos gravam: POST /api/v1/quick-entry ou POST /api/v1/transactions.',
      ])
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.message, error.details)
      throw error
    }
  }

  // ================================================================ leitura

  private toDto(row: TxRow): Transaction {
    const account = accountById.get(row.account_id)!
    const category = row.category_id === null ? undefined : categoryById.get(row.category_id)
    return {
      id: row.id,
      accountId: account.id,
      accountName: account.name,
      accountColor: account.color,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      categoryIcon: null,
      flow: row.flow,
      amount: fromCents(row.amount_cents),
      description: row.description,
      occurredOn: row.occurred_on,
      source: row.source,
      notes: row.notes,
      createdAt: row.created_at,
      reviewStatus: row.review_status,
      reviewReason: row.review_reason,
      duplicateOfId: row.duplicate_of_id,
      duplicateOfDate: row.dup_date,
      duplicateOfDescription: row.dup_description,
      duplicateOfSource: row.dup_source,
    }
  }

  private findById(id: number): Transaction {
    const row = this.historyById.get(id) ?? this.visitorRows().find((candidate) => candidate.id === id)
    if (!row) throw new HttpError(404, `Transacao ${id} nao encontrada`)
    return this.toDto(row)
  }

  /** `TransactionService.search` + `Transaction.search`. */
  private search(params: URLSearchParams): PageResponse<Transaction> {
    const from = dateParam(params, 'from')
    const to = dateParam(params, 'to')
    const accountId = params.get('accountId')
    const categoryId = params.get('categoryId')
    const flow = flowParam(params)

    const matches = this.liveRows().filter(
      (row) =>
        (!from || row.occurred_on >= from) &&
        (!to || row.occurred_on <= to) &&
        (!accountId || row.account_id === Number(accountId)) &&
        (!categoryId || row.category_id === Number(categoryId)) &&
        (!flow || row.flow === flow),
    )

    const page = Math.min(Math.max(intParam(params, 'page', 0), 0), MAX_PAGE)
    const size = Math.min(Math.max(intParam(params, 'size', 50), 1), 200)
    const items = matches
      .sort(newestFirst)
      .slice(page * size, page * size + size)
      .map((row) => this.toDto(row))
    const total = matches.length

    return { items, page, size, total, totalPages: Math.ceil(total / size) }
  }

  /** `ReviewService.pending`: decidido não volta; sem categoria do banco entra. */
  private reviewQueue(): Transaction[] {
    return this.liveRows()
      .filter((row) => row.review_status === 'PENDING' || (row.category_id === null && row.source === 'AGGREGATOR'))
      .sort(newestFirst)
      .map((row) => this.toDto(row))
  }

  /**
   * Só da demo: os lançamentos de visitantes, para o feed ao vivo da landing,
   * e quais deles são de quem pergunta. As chaves dos outros nunca saem daqui —
   * só o "é seu ou não".
   */
  private demoFeed(visitor: string | null): { items: Transaction[]; mine: number[] } {
    const rows = [...this.visitorRows()].sort((a, b) => b.id - a.id).slice(0, VISITOR_CAP)
    return {
      items: rows.map((row) => this.toDto(row)),
      mine: visitor ? rows.filter((row) => row.visitor_key === visitor).map((row) => row.id) : [],
    }
  }

  /** Soma por conta e direção, fora os ignorados; com período, só dentro dele. */
  private sumByAccount(from?: string, to?: string): Map<number, { expense: number; income: number }> {
    const result = new Map<number, { expense: number; income: number }>()
    for (const row of this.liveRows()) {
      if (from && to && (row.occurred_on < from || row.occurred_on > to)) continue
      const pair = result.get(row.account_id) ?? { expense: 0, income: 0 }
      if (row.flow === 'EXPENSE') pair.expense += row.amount_cents
      else pair.income += row.amount_cents
      result.set(row.account_id, pair)
    }
    return result
  }

  /** Saldo inicial + entradas − saídas de todo o histórico, como o `AccountService`. */
  private balances(): Map<number, number> {
    const allTime = this.sumByAccount()
    return new Map(
      ACCOUNTS.map((account) => {
        const sums = allTime.get(account.id) ?? { expense: 0, income: 0 }
        return [account.id, this.openingCents(account.id) + sums.income - sums.expense]
      }),
    )
  }

  private accounts(): Account[] {
    const balances = this.balances()
    return accountsByName.map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      kindLabel: KIND_LABEL[account.kind],
      color: account.color,
      openingBalance: fromCents(this.openingCents(account.id)),
      currentBalance: fromCents(balances.get(account.id)!),
      archived: false,
    }))
  }

  private categories(params: URLSearchParams) {
    return categoriesOrdered(flowParam(params)).map((category) => ({
      id: category.id,
      name: category.name,
      flow: category.flow,
      color: category.color,
      icon: null,
      monthlyBudget: category.budgetCents === null ? null : fromCents(category.budgetCents),
      archived: false,
    }))
  }

  // ================================================================ dashboard

  /** `DashboardResource.summary` + `DashboardService.summary`, consulta por consulta. */
  private dashboard(params: URLSearchParams): DashboardSummary {
    const now = today()
    const from = dateParam(params, 'from') ?? firstOfMonth(now)
    const to = dateParam(params, 'to') ?? lastOfMonth(from)

    if (to < from) {
      throw new HttpError(422, 'Periodo invalido', [`A data final (${to}) e anterior a inicial (${from})`])
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new HttpError(422, 'Periodo muito longo', [`O intervalo maximo e de ${MAX_RANGE_DAYS} dias`])
    }

    const totals = this.totals(from, to)
    const days = daysBetween(from, to) + 1
    const previousTo = addDays(from, -1)
    const previous = this.totals(addDays(previousTo, -(days - 1)), previousTo)

    return {
      periodStart: from,
      periodEnd: to,
      totalExpense: fromCents(totals.expense),
      totalIncome: fromCents(totals.income),
      balance: fromCents(totals.income - totals.expense),
      previousExpense: fromCents(previous.expense),
      comparisonPct: previous.expense === 0 ? null : percent(totals.expense - previous.expense, previous.expense),
      transactionCount: totals.count,
      expenseByCategory: this.expenseByCategory(from, to),
      accountBalances: this.accountBalances(from, to),
      dailySeries: this.dailySeries(from, to),
      recentTransactions: this.liveRows()
        .sort(newestFirst)
        .slice(0, RECENT_LIMIT)
        .map((row) => this.toDto(row)),
    }
  }

  /** Lançamentos não ignorados do período, inclusive nas pontas (`BETWEEN`). */
  private inPeriod(from: string, to: string): TxRow[] {
    return this.liveRows().filter((row) => row.occurred_on >= from && row.occurred_on <= to)
  }

  private totals(from: string, to: string) {
    const result = { expense: 0, income: 0, count: 0 }
    for (const row of this.inPeriod(from, to)) {
      result.count++
      if (row.flow === 'EXPENSE') result.expense += row.amount_cents
      else result.income += row.amount_cents
    }
    return result
  }

  private expenseByCategory(from: string, to: string): CategorySlice[] {
    const groups = new Map<number | null, { cents: number; n: number }>()
    for (const row of this.inPeriod(from, to)) {
      if (row.flow !== 'EXPENSE') continue
      const group = groups.get(row.category_id) ?? { cents: 0, n: 0 }
      group.cents += row.amount_cents
      group.n++
      groups.set(row.category_id, group)
    }
    // ORDER BY cents DESC; no empate, a ordem do GROUP BY do SQLite (id, nulo primeiro).
    return [...groups]
      .sort(([idA, a], [idB, b]) => b.cents - a.cents || (idA ?? -1) - (idB ?? -1))
      .map(([categoryId, group]) => {
        const category = categoryId === null ? undefined : categoryById.get(categoryId)
        const budget = category?.budgetCents ?? null
        return {
          categoryId: category?.id ?? null,
          categoryName: category?.name ?? UNCATEGORIZED.name,
          color: category?.color ?? UNCATEGORIZED.color,
          icon: null,
          total: fromCents(group.cents),
          budget: budget === null ? null : fromCents(budget),
          budgetUsedPct: budget ? percent(group.cents, budget) : null,
          transactionCount: group.n,
        }
      })
  }

  private accountBalances(from: string, to: string): AccountBalance[] {
    const balances = this.balances()
    const period = this.sumByAccount(from, to)
    return accountsByName.map((account) => {
      const inPeriod = period.get(account.id) ?? { expense: 0, income: 0 }
      return {
        accountId: account.id,
        accountName: account.name,
        kind: account.kind,
        color: account.color,
        balance: fromCents(balances.get(account.id)!),
        periodExpense: fromCents(inPeriod.expense),
        periodIncome: fromCents(inPeriod.income),
      }
    })
  }

  private dailySeries(from: string, to: string): DailyPoint[] {
    const byDate = new Map<string, { expense: number; income: number }>()
    for (const row of this.inPeriod(from, to)) {
      const pair = byDate.get(row.occurred_on) ?? { expense: 0, income: 0 }
      if (row.flow === 'EXPENSE') pair.expense += row.amount_cents
      else pair.income += row.amount_cents
      byDate.set(row.occurred_on, pair)
    }
    const series: DailyPoint[] = []
    let cumulative = 0
    // Pelo número de dias, já limitado, e não comparando datas como texto —
    // ver `isIsoDate`. Um laço que depende só de um contador sempre termina.
    const days = daysBetween(from, to) + 1
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i)
      const pair = byDate.get(date) ?? { expense: 0, income: 0 }
      cumulative += pair.expense
      series.push({ date, expense: fromCents(pair.expense), income: fromCents(pair.income), cumulativeExpense: fromCents(cumulative) })
    }
    return series
  }

  // ================================================================ análises

  /**
   * `AnalyticsService.categories`: o mesmo agrupamento por categoria e mês. A
   * soma "até a data" usa o dia do mês <= throughDay, que num mês mais curto
   * já pega o mês inteiro — o mesmo limite de `toDateEnd`.
   */
  private analyticsCategories(params: URLSearchParams): CategoryTrends {
    const now = today()
    const month = monthParam(params, 'month', now.slice(0, 7))
    const baseline = rangeParam(params, 'baseline', 6, 1, 12)
    const through = throughDay(month, now)
    const groups = new Map<string, CategoryMonthSum>()
    for (const row of this.inPeriod(`${addMonths(month, -baseline)}-01`, toDateEnd(month, through))) {
      if (row.flow !== 'EXPENSE') continue
      const rowMonth = row.occurred_on.slice(0, 7)
      const key = `${row.category_id}|${rowMonth}`
      const sum = groups.get(key) ?? { categoryId: row.category_id, month: rowMonth, fullCents: 0, toDateCents: 0 }
      sum.fullCents += row.amount_cents
      if (Number(row.occurred_on.slice(8, 10)) <= through) sum.toDateCents += row.amount_cents
      groups.set(key, sum)
    }
    return categoryTrends(month, now, baseline, [...groups.values()])
  }

  /**
   * `AnalyticsService.recurring`: só os campos que a regra usa; o
   * agrupamento pela descrição normalizada é feito em `findRecurring`.
   */
  private analyticsRecurring(params: URLSearchParams): RecurringExpenses {
    const months = rangeParam(params, 'months', 6, 3, 12)
    const now = today()
    const [from, to] = recurringWindow(now, months)
    const lines = this.inPeriod(from, to)
      .filter((row) => row.flow === 'EXPENSE')
      .map<ExpenseLine>((row) => ({
        id: row.id,
        description: row.description,
        accountId: row.account_id,
        categoryId: row.category_id,
        occurredOn: row.occurred_on,
        cents: row.amount_cents,
      }))
    return findRecurring(months, lines, now)
  }

  /** `AnalyticsService.cashflow`: no máximo duas somas por mês. */
  private analyticsCashflow(params: URLSearchParams): Cashflow {
    const months = rangeParam(params, 'months', 12, 3, 24)
    const now = today()
    const [from, to] = cashflowWindow(now, months)
    const income = new Map<string, number>()
    const expense = new Map<string, number>()
    for (const row of this.inPeriod(from, to)) {
      const target = row.flow === 'EXPENSE' ? expense : income
      const month = row.occurred_on.slice(0, 7)
      target.set(month, (target.get(month) ?? 0) + row.amount_cents)
    }
    return cashflow(from.slice(0, 7), now.slice(0, 7), income, expense)
  }

  // ================================================================ Open Finance (fictício)

  /**
   * A demo não fala com a Pluggy. O status diz "atualizado há 3 h" e uma
   * execução de hoje às 06:00, para a faixa de frescor do app aparecer no
   * estado normal.
   */
  private pluggyStatus(): PluggyStatus {
    const now = Date.now()
    const todayRun = Date.parse(`${today()}T09:00:00Z`) // 06:00 em Brasília
    return {
      enabled: true,
      configured: true,
      itemStatus: 'UPDATED',
      itemLastUpdate: new Date(now - 3 * 3_600_000).toISOString(),
      lastRunAt: new Date(todayRun <= now ? todayRun : todayRun - 86_400_000).toISOString(),
      lastRunStatus: 'SUCCESS',
      lastRunError: null,
      linkedAccounts: 2,
    }
  }

  private pluggyAccounts(): PluggyAccount[] {
    const balances = this.balances()
    return [
      {
        pluggyAccountId: 'demo-conta', name: 'BANCO DIGITAL S.A.', type: 'BANK', subtype: 'CHECKING_ACCOUNT',
        balance: fromCents(balances.get(1)!), linkId: 1, accountId: 1, accountName: accountById.get(1)!.name,
      },
      {
        // No cartão, a Pluggy informa o valor devido como positivo.
        pluggyAccountId: 'demo-cartao', name: 'CARTAO PLATINUM', type: 'CREDIT', subtype: 'CREDIT_CARD',
        balance: fromCents(Math.abs(balances.get(2)!)), linkId: 2, accountId: 2, accountName: accountById.get(2)!.name,
      },
    ]
  }

  private options() {
    return {
      accounts: accountsByName.map((account) => account.name),
      expenseCategories: categoriesOrdered('EXPENSE').map((category) => category.name),
      incomeCategories: categoriesOrdered('INCOME').map((category) => category.name),
    }
  }

  // ================================================================ escrita

  /** `POST /api/v1/transactions` — o + do próprio app. */
  private async createManual(request: Request, visitor: string | null): Promise<Transaction> {
    const body = await readBody(request)
    const violations: string[] = []
    if (body.accountId == null) violations.push('accountId: A conta e obrigatoria')
    if (body.flow == null) violations.push('flow: Informe se e despesa (EXPENSE) ou receita (INCOME)')
    violations.push(...amountViolations(body.amount))
    if (typeof body.description === 'string' && body.description.length > 200) {
      violations.push('description: A descricao deve ter no maximo 200 caracteres')
    }
    if (violations.length) throw new HttpError(400, 'Dados invalidos na requisicao', violations)

    const flow = parseFlow(body.flow)
    const account = accountById.get(Number(body.accountId))
    if (!account) throw new HttpError(404, `Conta ${body.accountId} nao encontrada`)

    let categoryId: number | null = null
    if (body.categoryId != null) {
      const category = categoryById.get(Number(body.categoryId))
      if (!category) throw new HttpError(404, `Categoria ${body.categoryId} nao encontrada`)
      if (category.flow !== flow) {
        throw new HttpError(422, 'A categoria nao corresponde ao tipo do lancamento', [
          `A categoria '${category.name}' e de ${category.flow}, mas o lancamento e de ${flow}`,
        ])
      }
      categoryId = category.id
    }

    return this.insertVisitorRow({
      accountId: account.id,
      categoryId,
      flow,
      cents: toCents(Number(body.amount)),
      description: trimToNull(body.description),
      occurredOn: occurredOnOrToday(body.occurredOn),
      source: 'MANUAL',
      notes: trimToNull(body.notes),
      visitor,
    })
  }

  /** `POST /api/v1/quick-entry` — o contrato do Atalho do iPhone. */
  private async quickEntry(request: Request, visitor: string | null): Promise<Transaction> {
    const body = await readBody(request)
    const violations = amountViolations(body.amount)
    if (typeof body.category === 'string' && body.category.length > 60) violations.push('category: size must be between 0 and 60')
    if (typeof body.account === 'string' && body.account.length > 80) violations.push('account: size must be between 0 and 80')
    if (typeof body.description === 'string' && body.description.length > 200) violations.push('description: size must be between 0 and 200')
    if (violations.length) throw new HttpError(400, 'Dados invalidos na requisicao', violations)

    // Despesa é o padrão: o Atalho normalmente é disparado ao gastar.
    const flow = body.flow == null ? 'EXPENSE' : parseFlow(body.flow)

    const accountName = typeof body.account === 'string' ? body.account : ''
    const availableAccounts = `Contas disponiveis: ${accountsByName.map((a) => a.name).join(', ')}`
    if (!accountName.trim()) throw new HttpError(422, 'Informe a conta de origem', [availableAccounts])
    const account = ACCOUNTS.find((candidate) => normalize(candidate.name) === normalize(accountName))
    if (!account) throw new HttpError(422, `Conta '${accountName}' nao encontrada`, [availableAccounts])

    let categoryId: number | null = null
    const categoryName = typeof body.category === 'string' ? body.category : ''
    if (categoryName.trim()) {
      const category = categoriesOrdered(flow).find((candidate) => normalize(candidate.name) === normalize(categoryName))
      if (!category) {
        throw new HttpError(422, `Categoria '${categoryName}' nao encontrada para ${flow}`, [
          `Categorias disponiveis: ${categoriesOrdered(flow).map((c) => c.name).join(', ')}`,
        ])
      }
      categoryId = category.id
    }

    return this.insertVisitorRow({
      accountId: account.id,
      categoryId,
      flow,
      cents: toCents(Number(body.amount)),
      description: trimToNull(body.description),
      occurredOn: occurredOnOrToday(body.occurredOn),
      source: 'SHORTCUT',
      notes: null,
      visitor,
    })
  }

  /** Grava, avisa todo mundo que está olhando e agenda a expiração. */
  private async insertVisitorRow(row: {
    accountId: number
    categoryId: number | null
    flow: Flow
    cents: number
    description: string | null
    occurredOn: string
    source: TransactionSource
    notes: string | null
    visitor: string | null
  }): Promise<Transaction> {
    const now = Date.now()
    const { id } = this.sql
      .exec<{ id: number }>(
        `INSERT INTO tx (account_id, category_id, flow, amount_cents, description, occurred_on, source, notes,
                         created_at, visitor, expires_at, visitor_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING id`,
        row.accountId, row.categoryId, row.flow, row.cents, row.description, row.occurredOn, row.source, row.notes,
        new Date(now).toISOString(), now + VISITOR_TTL_MS, row.visitor,
      )
      .one()

    this.visitors = null
    const dto = this.findById(id)
    this.broadcast({
      type: 'CREATED',
      transaction: dto,
      transactionId: id,
      at: new Date().toISOString(),
      // Só da demo; o app real ignora o campo. Ver `visitorTag`.
      ...(row.visitor ? { visitorTag: await visitorTag(row.visitor, id) } : {}),
    })

    // Teto: o mais antigo sai primeiro, avisando quem está olhando.
    const overflow = [...this.visitorRows()].sort((a, b) => b.id - a.id).slice(VISITOR_CAP)
    for (const old of overflow) this.remove(old.id)

    await this.scheduleExpiry()
    return dto
  }

  private remove(id: number) {
    this.sql.exec('DELETE FROM tx WHERE id = ?', id)
    // Atualiza a cópia em memória em vez de reler: tirar uma linha não muda as outras.
    this.visitors = this.visitors?.filter((row) => row.id !== id) ?? null
    this.broadcast({ type: 'DELETED', transaction: null, transactionId: id, at: new Date().toISOString() })
  }

  // ================================================================ expiração

  private async scheduleExpiry() {
    const pending = this.visitorRows().map((row) => Number(row.expires_at))
    const next = pending.length === 0 ? null : Math.min(...pending)
    if (next === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(next)
  }

  async alarm() {
    this.ensureFresh()
    const now = Date.now()
    const expired = this.visitorRows().filter((row) => Number(row.expires_at) <= now)
    for (const row of expired) this.remove(row.id)
    await this.scheduleExpiry()
  }

  // ================================================================ tempo real

  /**
   * SSE no mesmo formato do `EventStreamResource`: uma linha `data:` com o
   * `TransactionEvent` em JSON. O hook `useEventStream` do app não sabe que
   * está falando com um espelho.
   */
  private openStream(client: string, signal: AbortSignal): Response {
    if (this.streams.size >= MAX_STREAMS) {
      return tooMany('Muitas conexoes ao vivo agora. Tente de novo em instantes.', 30, 'objeto')
    }
    const mine = this.streamsPerClient.get(client) ?? 0
    if (mine >= MAX_STREAMS_PER_CLIENT) {
      return tooMany(`Limite da demonstracao: ${MAX_STREAMS_PER_CLIENT} conexoes ao vivo por IP.`, 30, 'objeto')
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    this.streams.add(writer)
    this.streamOwner.set(writer, client)
    this.streamsPerClient.set(client, mine + 1)
    // Um comentário SSE logo de saída faz o `onopen` do navegador disparar
    // na hora, em vez de esperar o primeiro heartbeat.
    // `retry` diz ao navegador quanto esperar para reconectar quando o
    // servidor encerra a conexão (ver STREAM_MAX_AGE_MS).
    writer.write(encoder.encode(': conectado\nretry: 3000\n\n')).catch(() => this.dropStream(writer))
    setTimeout(() => {
      this.dropStream(writer)
      writer.close().catch(() => {})
    }, STREAM_MAX_AGE_MS)
    // Desconectou: libera a vaga na hora. Sem isto, a vaga só voltava quando
    // uma escrita falhasse — e escrita para quem foi embora nem sempre falha;
    // às vezes só fica esperando. Medido: o IP seguia bloqueado 40 s depois de
    // fechar as conexões. Ver também a fila cheia em `broadcast`.
    signal.addEventListener('abort', () => this.dropStream(writer), { once: true })
    this.startHeartbeat()
    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  private broadcast(event: TransactionEvent & { visitorTag?: string }) {
    const frame = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
    for (const writer of this.streams) {
      // Rede de segurança que não depende de aviso de desconexão: quem está
      // vivo lê cada mensagem na hora, então a fila de escrita cheia no
      // heartbeat seguinte significa conexão morta. Pior caso: ~2 heartbeats.
      if ((writer.desiredSize ?? 1) <= 0) {
        this.dropStream(writer)
        writer.abort().catch(() => {})
        continue
      }
      // Escrita que falha = navegador que foi embora.
      writer.write(frame).catch(() => this.dropStream(writer))
    }
  }

  private dropStream(writer: WritableStreamDefaultWriter<Uint8Array>) {
    if (!this.streams.delete(writer)) return
    const client = this.streamOwner.get(writer)
    this.streamOwner.delete(writer)
    if (client === undefined) return
    const left = (this.streamsPerClient.get(client) ?? 1) - 1
    if (left <= 0) this.streamsPerClient.delete(client)
    else this.streamsPerClient.set(client, left)
  }

  private startHeartbeat() {
    if (this.heartbeat !== null) return
    this.heartbeat = setInterval(() => {
      if (this.streams.size === 0) {
        // Ninguém olhando: o objeto pode dormir.
        clearInterval(this.heartbeat)
        this.heartbeat = null
        return
      }
      this.broadcast({ type: 'HEARTBEAT', transaction: null, transactionId: null, at: new Date().toISOString() })
    }, HEARTBEAT_MS)
  }
}

// ================================================================ limites

/**
 * Janelas deslizantes em memória. IP nunca vai para o SQLite: vive só aqui,
 * durante a janela, e some com o objeto quando ele dorme. O preço disso é o
 * limite diário recomeçar se o objeto for despejado — aceitável numa demo, e
 * a borda (fence.ts) segue barrando rajadas.
 */
class Limits {
  private readonly minute = new Map<string, number[]>()
  private global: number[] = []
  private day = ''
  private readonly daily = new Map<string, number>()

  /** Devolve a resposta 429, ou `null` se a escrita pode seguir. */
  check(ip: string, now = Date.now()): Response | null {
    const windowStart = now - 60_000
    const currentDay = today()
    if (currentDay !== this.day) {
      this.day = currentDay
      this.daily.clear()
    }

    this.global = this.global.filter((t) => t > windowStart)
    if (this.global.length >= GLOBAL_PER_MINUTE) {
      return tooMany(`Limite da demonstracao: ${GLOBAL_PER_MINUTE} lancamentos por minuto no total. Tente de novo em instantes.`, (this.global[0] - windowStart) / 1000, 'objeto')
    }

    const recent = (this.minute.get(ip) ?? []).filter((t) => t > windowStart)
    if (recent.length >= PER_IP_PER_MINUTE) {
      this.minute.set(ip, recent)
      return tooMany(`Limite da demonstracao: ${PER_IP_PER_MINUTE} lancamentos por minuto.`, (recent[0] - windowStart) / 1000, 'objeto')
    }

    const used = this.daily.get(ip) ?? 0
    if (used >= PER_IP_PER_DAY) {
      const midnight = Date.parse(`${addDays(currentDay, 1)}T03:00:00Z`) // 00:00 em Brasília
      return tooMany(`Limite da demonstracao: ${PER_IP_PER_DAY} lancamentos por dia. Volte amanha.`, (midnight - now) / 1000, 'objeto')
    }

    recent.push(now)
    this.minute.set(ip, recent)
    this.global.push(now)
    this.daily.set(ip, used + 1)
    // Não deixa o mapa crescer com IP que já saiu da janela.
    if (this.minute.size > 1_000) {
      for (const [key, times] of this.minute) if (times.every((t) => t <= windowStart)) this.minute.delete(key)
    }
    return null
  }
}

// ================================================================ validação

// O corpo chega como JSON livre; cada campo é conferido antes de usar.
type Body = Record<string, unknown>

async function readBody(request: Request): Promise<Body> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HttpError(400, 'Dados invalidos na requisicao', ['corpo: JSON invalido'])
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Dados invalidos na requisicao', ['corpo: esperado um objeto JSON'])
  }
  return body as Body
}

/** As três regras de valor do backend: obrigatório, maior que zero, 2 casas. */
function amountViolations(raw: unknown): string[] {
  if (raw == null) return ['amount: O valor e obrigatorio']
  const amount = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  if (!Number.isFinite(amount)) return ['amount: Valor invalido: maximo 2 casas decimais']
  const violations: string[] = []
  if (amount < 0.01) violations.push('amount: O valor deve ser maior que zero')
  const cents = amount * 100
  if (Math.abs(cents - Math.round(cents)) > 1e-6 || Math.abs(amount) >= 1e12) {
    violations.push('amount: Valor invalido: maximo 2 casas decimais')
  }
  return violations
}

function parseFlow(raw: unknown): Flow {
  if (raw === 'EXPENSE' || raw === 'INCOME') return raw
  throw new HttpError(400, 'Dados invalidos na requisicao', ['flow: use EXPENSE ou INCOME'])
}

function occurredOnOrToday(raw: unknown): string {
  if (raw == null || raw === '') return today()
  if (typeof raw === 'string' && isIsoDate(raw)) return raw
  throw new HttpError(400, 'Dados invalidos na requisicao', ['occurredOn: use o formato AAAA-MM-DD'])
}

/** Os ids do histórico guardados no `meta`; `null` se faltarem ou não baterem com o seed. */
function parseIds(raw: string | undefined, expected: number): number[] | null {
  if (!raw) return null
  try {
    const ids: unknown = JSON.parse(raw)
    if (Array.isArray(ids) && ids.length === expected && ids.every((id) => Number.isInteger(id))) return ids as number[]
  } catch {
    // meta corrompido: regera
  }
  return null
}

function trimToNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function dateParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)
  if (value === null || value === '') return null
  if (!isIsoDate(value)) throw new HttpError(400, 'Parametro invalido', [`${name}: data invalida (use AAAA-MM-DD, entre 2000 e 2100)`])
  return value
}

function flowParam(params: URLSearchParams): Flow | null {
  const value = params.get('flow')
  if (value === null || value === '') return null
  if (value === 'EXPENSE' || value === 'INCOME') return value
  throw new HttpError(400, 'Parametro invalido', ['flow: use EXPENSE ou INCOME'])
}

function intParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = Number(params.get(name))
  return params.get(name) === null || !Number.isFinite(value) ? fallback : Math.trunc(value)
}
