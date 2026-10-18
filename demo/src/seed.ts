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
 * o "este mês" da demo vazio em dezembro. A janela vai do primeiro dia de três
 * meses atrás até hoje — o suficiente para "este mês", "mês passado",
 * "últimos 90 dias" e para a comparação com o período anterior.
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

export function generateHistory(todayIso: string): SeedRow[] {
  const rows: SeedRow[] = []
  const start = firstOfMonth(addDays(firstOfMonth(todayIso), -80))

  const add = (row: Omit<SeedRow, 'notes' | 'reviewStatus' | 'reviewReason' | 'duplicateOfIndex'> & Partial<SeedRow>) => {
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
      add({ accountId: CARTAO, categoryId: ASSINATURAS, flow: 'EXPENSE', cents: 44_90, description: 'NETFLIX.COM', occurredOn: day, source: 'AGGREGATOR' })
    }
    if (dayOfMonth === 10) {
      add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: 1_850_00, description: 'Aluguel', occurredOn: day, source: 'MANUAL' })
      add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: 612_00, description: 'Condomínio', occurredOn: day, source: 'MANUAL' })
    }
    if (dayOfMonth === 12) {
      add({ accountId: CARTAO, categoryId: ASSINATURAS, flow: 'EXPENSE', cents: 21_90, description: 'SPOTIFY', occurredOn: day, source: 'AGGREGATOR' })
      add({ accountId: CORRENTE, categoryId: MORADIA, flow: 'EXPENSE', cents: between(138, 212), description: 'DEBITO AUT ENERGIA ELETRICA', occurredOn: day, source: 'AGGREGATOR' })
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

  addReviewQueue(add, todayIso)
  return rows
}

/**
 * A fila de revisão, com um exemplo de cada motivo que existe no app real:
 * sem categoria, possível transferência (pagamento de fatura visto na conta) e
 * possível duplicata (o mesmo gasto lançado pelo Atalho e importado do banco).
 */
function addReviewQueue(add: (row: Omit<SeedRow, 'notes' | 'reviewStatus' | 'reviewReason' | 'duplicateOfIndex'> & Partial<SeedRow>) => number, todayIso: string) {
  add({
    accountId: CORRENTE, categoryId: null, flow: 'EXPENSE', cents: 120_00, description: 'PIX ENVIADO MARIA S',
    occurredOn: addDays(todayIso, -1), source: 'AGGREGATOR', notes: 'Pluggy id=demo-pix | categoria sugerida: Transfer - PIX',
  })
  add({
    accountId: CORRENTE, categoryId: null, flow: 'EXPENSE', cents: 1_480_35, description: 'PAGAMENTO FATURA CARTAO',
    occurredOn: addDays(todayIso, -2), source: 'AGGREGATOR', reviewStatus: 'PENDING', reviewReason: 'POSSIBLE_TRANSFER',
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
