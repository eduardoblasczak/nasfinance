/**
 * Histórico fictício, gerado a partir de hoje.
 *
 * Equilibrado como o de uma pessoa comum, porque o dashboard mostra o saldo de
 * cada conta e um recrutador repara: mercado e combustível no débito ou PIX,
 * assinaturas e delivery no cartão, almoço no vale — que recebe crédito todo
 * mês. A primeira versão punha quase tudo no cartão e mostrava −R$ 11 mil nele
 * e saldo negativo no vale.
 *
 * Gerado e não gravado com datas fixas: um histórico de outubro/2026 deixaria
 * o "este mês" da demo vazio em dezembro. A janela vai do primeiro dia de 13
 * meses atrás até hoje: 13 meses fechados mais o corrente, o que a página de
 * Análises pede (fluxo de caixa de 12 meses, base de até 12 meses por
 * categoria, recorrência em até 12 meses fechados — ver ANALYTICS.md).
 *
 * Saldos: o histórico longo não muda o saldo das contas. Antes dele a janela
 * era de ~3 meses, e o saldo inicial de cada conta (catalog.ts) foi calibrado
 * para ela; o objeto desconta do saldo inicial o líquido do que vem antes de
 * `recentStart` (ver `DemoStore.ensureFresh`). Sem isso, 13 meses de cartão
 * sem pagamento de fatura (o app não tem transferência) mostrariam −R$ 15 mil.
 *
 * Custo: ~60 linhas por mês, ~830 no total (~90 delas cópias do banco já
 * ignoradas, ver `addBankConfirmations`), regravadas uma vez por dia. A
 * leitura não volta ao SQLite: o objeto guarda o histórico em memória e, ao
 * acordar, chama este gerador de novo — por isso ele precisa ser
 * determinístico por dia (ver `DemoStore.ensureFresh`). As variações sazonais
 * (luz no verão, IPVA em janeiro, férias, 13º, Natal) usam só o mês do
 * calendário, nunca a distância até hoje.
 *
 * Determinístico por dia: o sorteio de cada dia usa a própria data como
 * semente. O dia 05/10 sai igual hoje e amanhã; quando o tempo passa, o
 * histórico só anda nas pontas. Dois visitantes no mesmo dia veem o mesmo app.
 *
 * As fontes misturam MANUAL, SHORTCUT (o Atalho) e AGGREGATOR (Open Finance),
 * com descrições no estilo de cada uma — curtas no Atalho, em caixa alta e
 * truncadas no extrato do banco —, porque é isso que o app real mostra.
 */
import { addDays, firstOfMonth, toCents, type Flow, type TransactionSource } from './contract'

export interface SeedRow {
  accountId: number
  categoryId: number | null
  flow: Flow
  cents: number
  description: string
  occurredOn: string
  source: TransactionSource
  notes: string | null
  reviewStatus: 'NONE' | 'PENDING' | 'IGNORED'
  reviewReason: 'POSSIBLE_DUPLICATE' | 'POSSIBLE_TRANSFER' | null
  /** Índice, nesta mesma lista, do lançamento que este talvez duplique. */
  duplicateOfIndex: number | null
}

// Ids do catálogo (src/catalog.ts), nomeados para o gerador ler como frase.
const CORRENTE = 1
const CARTAO = 2
const VALE = 3
const POUPANCA = 4
const MERCADO = 1
const RESTAURANTES = 2
const TRANSPORTE = 3
const MORADIA = 4
const SAUDE = 5
const LAZER = 6
const ASSINATURAS = 7
const EDUCACAO = 8
const SALARIO = 9
const FREELANCE = 10
const RENDIMENTOS = 11
const BENEFICIOS = 12

/** mulberry32: pequeno, rápido e bom o bastante para dado de demonstração. */
function rng(seedText: string): () => number {
  let seed = 2166136261
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Add = (row: Omit<SeedRow, 'notes' | 'reviewStatus' | 'reviewReason' | 'duplicateOfIndex'> & Partial<SeedRow>) => number

/**
 * Início da janela "recente", a única que existia antes do histórico longo: o
 * primeiro dia de três meses atrás. O saldo inicial das contas (catalog.ts)
 * vale para esta data — ver o comentário do topo.
 */
export function recentStart(todayIso: string): string {
  return firstOfMonth(addDays(firstOfMonth(todayIso), -80))
}

/** Primeiro dia do histórico: o mês 13 meses antes do corrente. */
export function historyStart(todayIso: string): string {
  let month = firstOfMonth(todayIso)
  for (let i = 0; i < 13; i++) month = firstOfMonth(addDays(month, -1))
  return month
}

export function generateHistory(todayIso: string): SeedRow[] {
  const rows: SeedRow[] = []
  const start = historyStart(todayIso)

  const add: Add = (row) => {
    rows.push({ notes: null, reviewStatus: 'NONE', reviewReason: null, duplicateOfIndex: null, ...row })
    return rows.length - 1
  }

  for (let day = start; day <= todayIso; day = addDays(day, 1)) {
    const random = rng(`nasfinance-demo:${day}`)
    const between = (min: number, max: number) => toCents(min + random() * (max - min))
    const pick = <T,>(options: T[]) => options[Math.floor(random() * options.length)]
    const dayOfMonth = Number(day.slice(8, 10))
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() // 0 = domingo
    const weekend = weekday === 0 || weekday === 6
    const monthOfYear = Number(day.slice(5, 7))
    const summer = monthOfYear === 12 || monthOfYear <= 3

    // ---- fixos do mês ----
    if (dayOfMonth === 1) {
      add({ accountId: VALE, categoryId: BENEFICIOS, flow: 'INCOME', cents: 650_00, description: 'Crédito do vale-refeição', occurredOn: day, source: 'MANUAL' })
    }
    if (dayOfMonth === 3) {
      add({ accountId: POUPANCA, categoryId: RENDIMENTOS, flow: 'INCOME', cents: between(38, 64), description: 'RENDIMENTO POUPANCA', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 5) {
      add({ accountId: CORRENTE, categoryId: SALARIO, flow: 'INCOME', cents: 5_900_00, description: 'PIX RECEBIDO ACME TECNOLOGIA LTDA', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 6) {
      add({ accountId: CARTAO, categoryId: SAUDE, flow: 'EXPENSE', cents: 109_90, description: 'SMARTFIT*MENSALIDADE', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 7) {
      add({ accountId: CORRENTE, categoryId: SAUDE, flow: 'EXPENSE', cents: 486_30, description: 'DEBITO AUT PLANO DE SAUDE', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 8) {
      // Reajuste em junho/2026: a série continua a mesma, só a média muda.
      add({ accountId: CARTAO, categoryId: ASSINATURAS, flow: 'EXPENSE', cents: day < '2026-06-01' ? 39_90 : 44_90, description: 'NETFLIX.COM', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 10) {
      add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: 1_850_00, description: 'Aluguel', occurredOn: day, source: 'MANUAL' })
      add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: 612_00, description: 'Condomínio', occurredOn: day, source: 'MANUAL' })
    }
    if (dayOfMonth === 12) {
      add({ accountId: CARTAO, categoryId: ASSINATURAS, flow: 'EXPENSE', cents: 21_90, description: 'SPOTIFY', occurredOn: day, source: 'AGGREGATOR' })
      // Ar-condicionado: a luz sobe no verão, e a série continua recorrente.
      add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: summer ? between(205, 268) : between(138, 212), description: 'DEBITO AUT ENERGIA ELETRICA', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 15) {
      add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: 119_90, description: 'DEBITO AUT INTERNET FIBRA', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 20) {
      add({ accountId: CARTAO, categoryId: EDUCACAO, flow: 'EXPENSE', cents: 89_00, description: 'CURSO ONLINE*ASSINATURA', occurredOn: day, source: 'AGGREGATOR' })
    }
    // Um trabalho extra por mês, em dia sorteado pelo próprio mês.
    if (dayOfMonth === 14 + Math.floor(rng(`freelance:${day.slice(0, 7)}`)() * 10)) {
      add({ accountId: CORRENTE, categoryId: FREELANCE, flow: 'INCOME', cents: between(900, 1_800), description: 'Projeto freelance', occurredOn: day, source: 'MANUAL' })
    }

    addSeasonal(add, day, dayOfMonth, monthOfYear)

    // ---- variáveis do dia ----
    if (!weekend && random() < 0.6) {
      add({ accountId: VALE, categoryId: RESTAURANTES, flow: 'EXPENSE', cents: between(22, 58), description: pick(['Almoço', 'Restaurante por quilo', 'Café', 'Lanche']), occurredOn: day, source: 'SHORTCUT' })
    }
    if (weekend && random() < 0.45) {
      add({ accountId: CARTAO, categoryId: RESTAURANTES, flow: 'EXPENSE', cents: between(48, 160), description: pick(['IFD*PIZZARIA BELLA', 'IFD*SUSHI DA ESQUINA', 'BAR DO ZE', 'HAMBURGUERIA 101']), occurredOn: day, source: 'AGGREGATOR' })
    }
    if (random() < 0.17) {
      add({ accountId: CORRENTE, categoryId: MERCADO, flow: 'EXPENSE', cents: between(68, 390), description: pick(['COMPRA DEBITO SUPERMERCADO BOM PRECO', 'PIX ENVIADO ATACADAO', 'COMPRA DEBITO HORTIFRUTI']), occurredOn: day, source: 'AGGREGATOR' })
    }
    if (random() < 0.3) {
      add({ accountId: CARTAO, categoryId: TRANSPORTE, flow: 'EXPENSE', cents: between(14, 46), description: pick(['UBER *TRIP', '99APP *CORRIDA']), occurredOn: day, source: 'AGGREGATOR' })
    }
    if (random() < 0.05) {
      add({ accountId: CORRENTE, categoryId: TRANSPORTE, flow: 'EXPENSE', cents: between(180, 260), description: 'COMPRA DEBITO POSTO COMBUSTIVEL', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (weekend && random() < 0.3) {
      add({ accountId: CORRENTE, categoryId: LAZER, flow: 'EXPENSE', cents: between(36, 180), description: pick(['Cinema', 'Show', 'Livraria', 'Parque']), occurredOn: day, source: 'SHORTCUT' })
    }
    if (random() < 0.04) {
      add({ accountId: CARTAO, categoryId: SAUDE, flow: 'EXPENSE', cents: between(24, 96), description: 'DROGARIA SAO PAULO', occurredOn: day, source: 'AGGREGATOR' })
    }
  }

  // "Hoje" nunca fica vazio: é o primeiro grupo que a lista mostra.
  if (!rows.some((row) => row.occurredOn === todayIso)) {
    add({ accountId: VALE, categoryId: RESTAURANTES, flow: 'EXPENSE', cents: 8_50, description: 'Café', occurredOn: todayIso, source: 'SHORTCUT' })
  }

  addBankConfirmations(rows, add, todayIso)
  addReviewQueue(add, todayIso)
  return rows
}

/** Contas que o Open Finance da demo enxerga (ver `DemoStore.pluggyAccounts`): o vale não tem extrato. */
const LINKED_ACCOUNTS = new Set([CORRENTE, CARTAO])

/** Como o extrato escreve o que a pessoa lançou à mão; o resto vira "COMPRA <DESCRIÇÃO>". */
const BANK_TEXT: Record<string, string> = {
  Aluguel: 'PIX ENVIADO IMOBILIARIA LAR',
  'Condomínio': 'PAGTO BOLETO CONDOMINIO ED SOL',
  Diarista: 'PIX ENVIADO JOANA M',
  Cinema: 'COMPRA DEBITO CINEMARK',
  Show: 'COMPRA DEBITO TICKETMASTER',
  Livraria: 'COMPRA DEBITO LIVRARIA DA VILA',
  Parque: 'COMPRA DEBITO PARQUE IBIRA',
  'Presentes de Natal': 'MERCADOLIVRE*PRESENTES',
}

/**
 * A cópia do banco de cada despesa lançada à mão (tela ou Atalho) numa conta
 * ligada ao Open Finance, um dia depois, como o extrato traz de verdade —
 * para a análise "portas de entrada" ter o que confirmar.
 *
 * O estado segue o fluxo real da fila de revisão (ReviewService): a cópia
 * chega PENDING como POSSIBLE_DUPLICATE apontando para o manual; resolvida com
 * "Não contar", vira IGNORED e mantém o vínculo. Aqui, tudo que o banco trouxe
 * há mais de um dia já foi resolvido assim; o que chegou hoje ou ontem ainda
 * espera na fila. IGNORED não entra em total nenhum, então os saldos, o
 * dashboard e as outras análises não mudam. Sem categoria, como toda
 * importação da Pluggy (a categoria dela é só sugestão, no `notes`).
 *
 * O vale fica de fora: a tela de Open Finance da demo só mostra corrente e
 * cartão ligados, então os almoços do Atalho seguem sem confirmação — e a
 * porcentagem confirmada fica realista, longe de 100%. (A duplicata do
 * "Padaria" na fila, mais antiga que esta regra, é a exceção.)
 */
function addBankConfirmations(rows: SeedRow[], add: Add, todayIso: string) {
  const manual = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.flow === 'EXPENSE' && (row.source === 'MANUAL' || row.source === 'SHORTCUT') && LINKED_ACCOUNTS.has(row.accountId))
  for (const { row, index } of manual) {
    const posted = addDays(row.occurredOn, 1)
    if (posted > todayIso) continue // o banco ainda não trouxe
    const pending = posted >= addDays(todayIso, -1)
    add({
      accountId: row.accountId,
      categoryId: null,
      flow: 'EXPENSE',
      cents: row.cents,
      description: BANK_TEXT[row.description] ?? `COMPRA ${row.description.normalize('NFD').replace(/\p{M}+/gu, '').toUpperCase()}`,
      occurredOn: posted,
      source: 'AGGREGATOR',
      notes: 'Pluggy id=demo-extrato | categoria sugerida: Shopping',
      reviewStatus: pending ? 'PENDING' : 'IGNORED',
      reviewReason: 'POSSIBLE_DUPLICATE',
      duplicateOfIndex: index,
    })
  }
}

/**
 * Cobranças fixas que vieram com o histórico longo, e as variações sazonais
 * que dão assunto à página de Análises: Lazer acima da média em dezembro e
 * janeiro, um mês de férias no vermelho, o 13º no fluxo de caixa.
 *
 * Sorteio próprio (semente `extra:`), separado do sorteio do dia: assim os
 * lançamentos que já existiam mantêm os mesmos valores.
 */
function addSeasonal(add: Add, day: string, dayOfMonth: number, monthOfYear: number) {
  const random = rng(`nasfinance-demo:extra:${day}`)
  const between = (min: number, max: number) => toCents(min + random() * (max - min))
  const monthIndex = Number(day.slice(0, 4)) * 12 + monthOfYear

  // ---- fixas ----
  if (dayOfMonth === 1) {
    // Acima do teto de Educação (R$ 250) desde o dia 1: o "ritmo do teto" tem
    // um OVER em todo dia do mês, inclusive no começo, quando nada mais estourou.
    add({ accountId: CARTAO, categoryId: EDUCACAO, flow: 'EXPENSE', cents: 289_00, description: 'ESCOLA DE IDIOMAS*MENSALIDADE', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (dayOfMonth === 18) {
    add({ accountId: CARTAO, categoryId: ASSINATURAS, flow: 'EXPENSE', cents: 54_99, description: 'TIM*CELULAR POS', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (dayOfMonth === 22) {
    add({ accountId: CARTAO, categoryId: ASSINATURAS, flow: 'EXPENSE', cents: 19_90, description: 'AMAZON PRIME BR', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (dayOfMonth === 25) {
    add({ accountId: CORRENTE, categoryId: TRANSPORTE, flow: 'EXPENSE', cents: 189_40, description: 'DEBITO AUT SEGURO AUTO', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (dayOfMonth === 28) {
    // Lançada à mão, com um extra de fim de ano em dezembro. Meia diária a
    // mais, e não o dobro: com o dobro, a série de 12 meses passa de 0,25 de
    // variação e some da recorrência.
    add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: monthOfYear === 12 ? 330_00 : 220_00, description: 'Diarista', occurredOn: day, source: 'MANUAL' })
  }

  // ---- sazonais ----
  if (monthOfYear === 1 && dayOfMonth === 9) {
    add({ accountId: CARTAO, categoryId: LAZER, flow: 'EXPENSE', cents: between(1_650, 2_100), description: 'LATAM AIR*PASSAGEM', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (monthOfYear === 1 && dayOfMonth === 15) {
    add({ accountId: CORRENTE, categoryId: TRANSPORTE, flow: 'EXPENSE', cents: between(1_320, 1_480), description: 'PAGAMENTO IPVA', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (monthOfYear === 1 && dayOfMonth === 20) {
    add({ accountId: CARTAO, categoryId: LAZER, flow: 'EXPENSE', cents: between(1_100, 1_400), description: 'BOOKING.COM HOTEL', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (monthOfYear === 2 && dayOfMonth === 3) {
    add({ accountId: CARTAO, categoryId: EDUCACAO, flow: 'EXPENSE', cents: between(380, 460), description: 'LIVRARIA CULTURA', occurredOn: day, source: 'AGGREGATOR' })
  }
  if (monthOfYear === 12 && (dayOfMonth === 14 || dayOfMonth === 21)) {
    add({ accountId: CARTAO, categoryId: LAZER, flow: 'EXPENSE', cents: between(240, 520), description: 'Presentes de Natal', occurredOn: day, source: 'SHORTCUT' })
  }
  // Dentista de quatro em quatro meses: Saúde oscila em torno da média.
  if (monthIndex % 4 === 0 && dayOfMonth === 16) {
    add({ accountId: CORRENTE, categoryId: SAUDE, flow: 'EXPENSE', cents: between(280, 420), description: 'PIX ENVIADO CLINICA ODONTO', occurredOn: day, source: 'AGGREGATOR' })
  }
  // 13º salário em duas parcelas.
  if ((monthOfYear === 11 && dayOfMonth === 30) || (monthOfYear === 12 && dayOfMonth === 18)) {
    add({ accountId: CORRENTE, categoryId: SALARIO, flow: 'INCOME', cents: 2_950_00, description: 'PIX RECEBIDO ACME 13 SALARIO', occurredOn: day, source: 'AGGREGATOR' })
  }
}

/**
 * A fila de revisão, com um exemplo de cada motivo que existe no app real:
 * sem categoria, possível transferência (pagamento de fatura visto na conta) e
 * possível duplicata (o mesmo gasto lançado pelo Atalho e importado do banco).
 */
function addReviewQueue(add: Add, todayIso: string) {
  add({
    accountId: CORRENTE, categoryId: null, flow: 'EXPENSE', cents: 120_00, description: 'PIX ENVIADO MARIA S',
    occurredOn: addDays(todayIso, -1), source: 'AGGREGATOR', notes: 'Pluggy id=demo-pix | categoria sugerida: Transfer - PIX',
  })
  add({
    accountId: CORRENTE, categoryId: null, flow: 'EXPENSE', cents: 1_480_35, description: 'PAGAMENTO FATURA CARTAO',
    occurredOn: addDays(todayIso, -2), source: 'AGGREGATOR', reviewStatus: 'PENDING', reviewReason: 'POSSIBLE_TRANSFER',
  })
  // Uma duplicata pendente garantida numa conta ligada, qualquer que seja o
  // sorteio dos últimos dias (ver `addBankConfirmations`).
  const pharmacy = add({
    accountId: CORRENTE, categoryId: SAUDE, flow: 'EXPENSE', cents: 42_90, description: 'Farmácia',
    occurredOn: addDays(todayIso, -2), source: 'SHORTCUT',
  })
  add({
    accountId: CORRENTE, categoryId: null, flow: 'EXPENSE', cents: 42_90, description: 'COMPRA DEBITO DROGASIL',
    occurredOn: addDays(todayIso, -1), source: 'AGGREGATOR', notes: 'Pluggy id=demo-farmacia | categoria sugerida: Pharmacy',
    reviewStatus: 'PENDING', reviewReason: 'POSSIBLE_DUPLICATE', duplicateOfIndex: pharmacy,
  })
  const original = add({
    accountId: VALE, categoryId: RESTAURANTES, flow: 'EXPENSE', cents: 18_50, description: 'Padaria',
    occurredOn: addDays(todayIso, -3), source: 'SHORTCUT',
  })
  add({
    accountId: VALE, categoryId: RESTAURANTES, flow: 'EXPENSE', cents: 18_50, description: 'PANIFICADORA PAO QUENTE',
    occurredOn: addDays(todayIso, -3), source: 'AGGREGATOR', reviewStatus: 'PENDING', reviewReason: 'POSSIBLE_DUPLICATE',
    duplicateOfIndex: original,
  })
}
