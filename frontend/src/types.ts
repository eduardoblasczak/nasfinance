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

/** Formato unico de erro devolvido pela API. */
export interface ApiError {
  status: number
  message: string
  details: string[]
  at: string
}
