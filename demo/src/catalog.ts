/**
 * Contas e categorias fictícias da demonstração.
 *
 * Fixas no código, e não no banco do Durable Object: na demo ninguém cria,
 * edita nem arquiva conta ou categoria (o app em modo demo esconde essas
 * ações, e a API responde 403). Os nomes são a lista que o visitante usa no
 * `POST /api/v1/quick-entry`.
 *
 * As cores são as da paleta de séries do app (`--color-series-*` em
 * index.css), já validadas contra o fundo escuro.
 */
import type { AccountKind, Flow } from './contract'

export interface DemoAccount {
  id: number
  name: string
  kind: AccountKind
  color: string
  openingCents: number
}

export interface DemoCategory {
  id: number
  name: string
  flow: Flow
  color: string
  budgetCents: number | null
}

/** Os rótulos do enum `AccountKind` do backend — sem acento, como lá. */
export const KIND_LABEL: Record<AccountKind, string> = {
  CHECKING: 'Conta Corrente',
  SAVINGS: 'Poupanca',
  CREDIT_CARD: 'Cartao de Credito',
  MEAL_VOUCHER: 'Vale Refeicao',
  CASH: 'Dinheiro',
  INVESTMENT: 'Investimento',
  OTHER: 'Outros',
}

export const ACCOUNTS: DemoAccount[] = [
  { id: 1, name: 'Conta Corrente', kind: 'CHECKING', color: '#3987e5', openingCents: 1_200_00 },
  { id: 2, name: 'Cartão de Crédito', kind: 'CREDIT_CARD', color: '#d95926', openingCents: 0 },
  { id: 3, name: 'Vale Refeição', kind: 'MEAL_VOUCHER', color: '#199e70', openingCents: 0 },
  { id: 4, name: 'Poupança', kind: 'SAVINGS', color: '#9085e9', openingCents: 8_000_00 },
]

export const CATEGORIES: DemoCategory[] = [
  { id: 1, name: 'Mercado', flow: 'EXPENSE', color: '#199e70', budgetCents: 1_200_00 },
  { id: 2, name: 'Restaurantes', flow: 'EXPENSE', color: '#d95926', budgetCents: 600_00 },
  { id: 3, name: 'Transporte', flow: 'EXPENSE', color: '#3987e5', budgetCents: 450_00 },
  { id: 4, name: 'Moradia', flow: 'EXPENSE', color: '#9085e9', budgetCents: null },
  { id: 5, name: 'Saúde', flow: 'EXPENSE', color: '#e66767', budgetCents: 700_00 },
  { id: 6, name: 'Lazer', flow: 'EXPENSE', color: '#d55181', budgetCents: 400_00 },
  { id: 7, name: 'Assinaturas', flow: 'EXPENSE', color: '#c98500', budgetCents: 150_00 },
  { id: 8, name: 'Educação', flow: 'EXPENSE', color: '#008300', budgetCents: null },
  { id: 9, name: 'Salário', flow: 'INCOME', color: '#199e70', budgetCents: null },
  { id: 10, name: 'Freelance', flow: 'INCOME', color: '#3987e5', budgetCents: null },
  { id: 11, name: 'Rendimentos', flow: 'INCOME', color: '#9085e9', budgetCents: null },
  { id: 12, name: 'Benefícios', flow: 'INCOME', color: '#c98500', budgetCents: null },
]

export const accountById = new Map(ACCOUNTS.map((account) => [account.id, account]))
export const categoryById = new Map(CATEGORIES.map((category) => [category.id, category]))

/**
 * Ordem do backend: `ORDER BY name` em Postgres com collation C, que compara
 * bytes. A comparação simples de string do JavaScript dá o mesmo resultado
 * para estes nomes.
 */
const byName = <T extends { name: string }>(a: T, b: T) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

export const accountsByName = [...ACCOUNTS].sort(byName)

/** `listActive(flow)`: com flow, por nome; sem, por flow e depois nome. */
export function categoriesOrdered(flow: Flow | null): DemoCategory[] {
  return CATEGORIES.filter((category) => flow === null || category.flow === flow).sort(
    (a, b) => (a.flow < b.flow ? -1 : a.flow > b.flow ? 1 : byName(a, b)),
  )
}

/** Categoria de lançamento sem categoria, como o `DashboardService` a devolve. */
export const UNCATEGORIZED = { name: 'Sem categoria', color: '#94A3B8' }
