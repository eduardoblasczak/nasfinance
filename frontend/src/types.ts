/**
 * Tipos que espelham os DTOs do backend.
 *
 * Sao mantidos a mao de proposito: gerar a partir do OpenAPI adicionaria um
 * passo de build para um contrato pequeno e estavel. Se a API crescer muito,
 * vale trocar por geracao automatica.
 */

export type Flow = 'EXPENSE' | 'INCOME'

export type AccountKind =
  | 'CHECKING'
  | 'SAVINGS'
  | 'CREDIT_CARD'
  | 'MEAL_VOUCHER'
  | 'CASH'
  | 'INVESTMENT'
  | 'OTHER'

export type TransactionSource = 'MANUAL' | 'SHORTCUT' | 'IMPORT' | 'AGGREGATOR'

export interface Account {
  id: number
  name: string
  kind: AccountKind
  kindLabel: string
  color: string
  openingBalance: number
  currentBalance: number
  archived: boolean
}

export interface Category {
  id: number
  name: string
  flow: Flow
  color: string
  icon: string | null
  monthlyBudget: number | null
  archived: boolean
}

export interface Transaction {
  id: number
  accountId: number
  accountName: string
  accountColor: string
  categoryId: number | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  flow: Flow
  amount: number
  description: string | null
  occurredOn: string
  source: TransactionSource
  notes: string | null
  createdAt: string

  /** `NONE` | `PENDING` | `DISMISSED` | `IGNORED` — ver a fila de revisão. */
  reviewStatus: string | null
  /** `POSSIBLE_DUPLICATE` | `POSSIBLE_TRANSFER` — nulo quando não há suspeita. */
  reviewReason: string | null
  duplicateOfId: number | null
  duplicateOfDate: string | null
  duplicateOfDescription: string | null
  duplicateOfSource: string | null
}

export interface CategorySlice {
  categoryId: number | null
  categoryName: string
  color: string
  icon: string | null
  total: number
  budget: number | null
  budgetUsedPct: number | null
  transactionCount: number
}

export interface DailyPoint {
  date: string
  expense: number
  income: number
  cumulativeExpense: number
}

export interface AccountBalance {
  accountId: number
  accountName: string
  kind: AccountKind
  color: string
  balance: number
  periodExpense: number
  periodIncome: number
}

export interface DashboardSummary {
  periodStart: string
  periodEnd: string
  totalExpense: number
  totalIncome: number
  balance: number
  previousExpense: number
  comparisonPct: number | null
  transactionCount: number
  expenseByCategory: CategorySlice[]
  accountBalances: AccountBalance[]
  dailySeries: DailyPoint[]
  recentTransactions: Transaction[]
}

export interface PageResponse<T> {
  items: T[]
  page: number
  size: number
  total: number
  totalPages: number
}

export interface TransactionRequest {
  accountId: number
  categoryId: number | null
  flow: Flow
  amount: number
  description: string | null
  occurredOn: string | null
  notes: string | null
}

/** Evento recebido pelo canal SSE. */
export interface TransactionEvent {
  type: 'CREATED' | 'UPDATED' | 'DELETED' | 'HEARTBEAT'
  transaction: Transaction | null
  transactionId: number | null
  at: string
}

/**
 * Uma conta do lado da Pluggy, com o vinculo que ela tem (ou nao) aqui.
 * `linkId` nulo significa "ainda nao vinculada".
 */
export interface PluggyAccount {
  pluggyAccountId: string
  name: string
  type: string
  subtype: string | null
  balance: number | null
  linkId: number | null
  accountId: number | null
  accountName: string | null
}

/** Estado da integracao com a Pluggy, para a tela de configuracao. */
export interface PluggyStatus {
  enabled: boolean
  configured: boolean
  itemStatus: string | null
  itemLastUpdate: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunError: string | null
  linkedAccounts: number
}

/**
 * Resultado de uma execucao da sincronizacao.
 *
 * O endpoint devolve 200 mesmo quando a sincronizacao falha: o desfecho vem
 * em `status`. Assim a tela distingue "a Pluggy esta fora" de "o servidor
 * caiu", em vez de mostrar erro de servidor para as duas coisas.
 */
export interface PluggySyncRun {
  id: number
  startedAt: string
  finishedAt: string | null
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED'
  error: string | null
  imported: number
  skipped: number
  flagged: number
  windowFrom: string | null
  windowTo: string | null
}

/** Formato unico de erro devolvido pela API. */
export interface ApiError {
  status: number
  message: string
  details: string[]
  at: string
}

// ------------------------------------------------------------ análises
// Contrato da página de Análises (ver ANALYTICS.md). Todo valor é positivo:
// a direção vem do nome do campo (income/expense), nunca do sinal.

/** Total de um mês, `month` em `YYYY-MM`. */
export interface MonthTotal {
  month: string
  total: number
}

/** Uma categoria no mês de referência contra a média dos meses anteriores. */
export interface CategoryTrendRow {
  categoryId: number | null
  categoryName: string
  color: string
  icon: string | null
  /** Gasto no mês de referência até `throughDay`. */
  current: number
  /** Média dos meses de base, contando só do dia 1 a `throughDay` de cada um. */
  averageToDate: number
  /** Média dos meses de base inteiros. */
  averageFullMonth: number
  /** (current − averageToDate) / averageToDate × 100; nulo sem base (média zero). */
  deltaPct: number | null
  /** Meses de base, do mais antigo ao mais novo, seguidos do mês de referência. */
  monthly: MonthTotal[]
}

export interface CategoryTrends {
  /** Mês de referência, `YYYY-MM`. */
  month: string
  /** Último dia considerado no mês de referência (hoje, se for o mês corrente). */
  throughDay: number
  daysInMonth: number
  baselineMonths: number
  totalCurrent: number
  totalAverageToDate: number
  rows: CategoryTrendRow[]
}

/** Uma cobrança que se repete em meses diferentes com valor parecido. */
export interface RecurringExpense {
  /** Chave estável da série (descrição normalizada + conta). */
  key: string
  /** Descrição como aparece no lançamento mais recente. */
  label: string
  categoryId: number | null
  categoryName: string | null
  categoryColor: string | null
  accountName: string
  averageAmount: number
  lastAmount: number
  lastDate: string
  /** Em quantos meses distintos da janela ela apareceu. */
  monthsSeen: number
  /** Dia do mês mais comum da cobrança. */
  typicalDay: number
  /** Próxima data esperada (typicalDay no mês seguinte ao da última cobrança). */
  nextExpected: string
}

export interface RecurringExpenses {
  windowMonths: number
  /** Soma de `averageAmount` de todos os itens: o custo fixo mensal estimado. */
  monthlyTotal: number
  items: RecurringExpense[]
}

export interface CashflowMonth {
  month: string
  income: number
  expense: number
  /** income − expense; pode ser negativo. */
  net: number
  /** Mês corrente, ainda em andamento. */
  partial: boolean
}

export interface Cashflow {
  months: CashflowMonth[]
  totalIncome: number
  totalExpense: number
  totalNet: number
  /** Média de `net` só dos meses fechados (sem o parcial); nulo se não houver nenhum. */
  averageNet: number | null
}
