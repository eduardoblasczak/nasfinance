/**
 * Regras da página de Análises — o gêmeo do `AnalyticsRules` do backend.
 *
 * Mesma semântica, regra por regra (ver ANALYTICS.md): mudou lá, muda aqui.
 * Puras e sem SQL; o `DemoStore` agrega no SQLite e entrega as linhas já
 * reduzidas. Dinheiro em centavos inteiros até a borda, como no resto da demo.
 */
import { UNCATEGORIZED, accountById, categoryById } from './catalog'
import {
  HttpError,
  addDays,
  fromCents,
  lastOfMonth,
  type Cashflow,
  type CashflowMonth,
  type CategoryTrendRow,
  type CategoryTrends,
  type MonthTotal,
  type RecurringExpense,
  type RecurringExpenses,
} from './contract'

/** Mínimo de meses distintos e variação máxima (desvio padrão / média). */
const MIN_MONTHS = 3
/** No máximo 1,5 lançamento por mês visto (3/2, comparado em inteiros). */
const MAX_PER_MONTH = { num: 3, den: 2 }
/** Sem cobrança há mais que isto, a série parou. */
const STALE_AFTER_DAYS = 45
/** 0,25² como fração exata: a conta de estabilidade é feita em inteiros. */
const MAX_VARIATION_SQ = { num: 1n, den: 16n }

// ---------------------------------------------------------------- meses

/** `YYYY-MM` deslocado de `n` meses (negativo volta). */
export function addMonths(month: string, n: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export function daysInMonth(month: string): number {
  return Number(lastOfMonth(`${month}-01`).slice(8, 10))
}

/** De `from` a `to`, inclusive, em ordem. Por contador: sempre termina. */
export function monthsBetween(from: string, to: string): string[] {
  const count = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1
  return Array.from({ length: Math.max(0, count) }, (_, i) => addMonths(from, i))
}

/** Hoje se `month` é o corrente; senão, o último dia do mês. */
export function throughDay(month: string, todayIso: string): number {
  return todayIso.slice(0, 7) === month ? Number(todayIso.slice(8, 10)) : daysInMonth(month)
}

/** Dia `throughDay`, limitado ao tamanho do mês. */
export function toDateEnd(month: string, through: number): string {
  return `${month}-${String(Math.min(through, daysInMonth(month))).padStart(2, '0')}`
}

// ---------------------------------------------------------------- dinheiro

/** HALF_UP do BigDecimal: o meio se afasta do zero (Math.round puxa −2,5 para −2). */
function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

/** Média em centavos, HALF_UP. */
export function averageCents(sumCents: number, count: number): number {
  return roundHalfUp(sumCents / count)
}

/** Razão em 4 casas (HALF_UP) e depois ×100, como o `DashboardService`. */
export function percentChange(baseCents: number, currentCents: number): number | null {
  if (baseCents === 0) return null
  return roundHalfUp(((currentCents - baseCents) / baseCents) * 10_000) / 100
}

// ---------------------------------------------------------------- parâmetros

const INTEGER = /^\d{1,3}$/
const MONTH = /^\d{4}-\d{2}$/
const MIN_MONTH = '2000-01'

function invalid(detail: string): HttpError {
  return new HttpError(400, 'Parametro invalido', [detail])
}

/** `AnalyticsResource.parseInt`: vazio vale como ausente; fora da faixa é 400. */
export function rangeParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name)
  if (raw === null || raw.trim() === '') return fallback
  const value = raw.trim()
  const parsed = INTEGER.test(value) ? Number(value) : Number.NaN
  if (!(parsed >= min && parsed <= max)) throw invalid(`${name}: use um numero inteiro entre ${min} e ${max}`)
  return parsed
}

/** `AnalyticsResource.parseMonth`: `YYYY-MM`, de 2000-01 até o mês corrente. */
export function monthParam(params: URLSearchParams, name: string, current: string): string {
  const raw = params.get(name)
  if (raw === null || raw.trim() === '') return current
  const value = raw.trim()
  const monthOfYear = Number(value.slice(5, 7))
  if (!MONTH.test(value) || monthOfYear < 1 || monthOfYear > 12) {
    throw invalid(`${name}: use o formato AAAA-MM (ex.: 2026-10)`)
  }
  if (value > current) throw invalid(`${name}: o mes ${value} ainda nao comecou`)
  if (value < MIN_MONTH) throw invalid(`${name}: use um mes a partir de ${MIN_MONTH}`)
  return value
}

// ---------------------------------------------------------------- categorias

export interface CategoryMonthSum {
  categoryId: number | null
  month: string
  fullCents: number
  toDateCents: number
}

/**
 * `AnalyticsRules.categoryTrends`: a média divide sempre por `baseline`. A
 * janela "até a data" só vale no mês corrente; mês fechado compara com os
 * meses de base inteiros.
 */
export function categoryTrends(month: string, todayIso: string, baseline: number, sums: CategoryMonthSum[]): CategoryTrends {
  const through = throughDay(month, todayIso)
  const inProgress = todayIso.slice(0, 7) === month
  const baseMonths = monthsBetween(addMonths(month, -baseline), addMonths(month, -1))
  const byCategory = new Map<number | null, { full: Map<string, number>; toDate: Map<string, number> }>()
  for (const sum of sums) {
    const acc = byCategory.get(sum.categoryId) ?? { full: new Map(), toDate: new Map() }
    acc.full.set(sum.month, (acc.full.get(sum.month) ?? 0) + sum.fullCents)
    acc.toDate.set(sum.month, (acc.toDate.get(sum.month) ?? 0) + sum.toDateCents)
    byCategory.set(sum.categoryId, acc)
  }

  const rows: (CategoryTrendRow & { sort: [number, number] })[] = []
  let totalCurrent = 0
  let totalAverageToDate = 0
  for (const [categoryId, acc] of byCategory) {
    let baseFull = 0
    let baseToDate = 0
    const monthly: MonthTotal[] = baseMonths.map((base) => {
      const full = acc.full.get(base) ?? 0
      baseFull += full
      baseToDate += acc.toDate.get(base) ?? 0
      return { month: base, total: fromCents(full) }
    })
    const current = acc.toDate.get(month) ?? 0
    monthly.push({ month, total: fromCents(current) })
    if (current === 0 && baseFull === 0) continue

    const averageFullMonth = averageCents(baseFull, baseline)
    const averageToDate = inProgress ? averageCents(baseToDate, baseline) : averageFullMonth
    const category = categoryId === null ? undefined : categoryById.get(categoryId)
    rows.push({
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? UNCATEGORIZED.name,
      color: category?.color ?? UNCATEGORIZED.color,
      icon: null,
      current: fromCents(current),
      averageToDate: fromCents(averageToDate),
      averageFullMonth: fromCents(averageFullMonth),
      deltaPct: percentChange(averageToDate, current),
      monthly,
      sort: [current, averageFullMonth],
    })
    totalCurrent += current
    totalAverageToDate += averageToDate
  }

  rows.sort((a, b) => b.sort[0] - a.sort[0] || b.sort[1] - a.sort[1] || compareText(a.categoryName, b.categoryName))
  return {
    month,
    throughDay: through,
    daysInMonth: daysInMonth(month),
    baselineMonths: baseline,
    totalCurrent: fromCents(totalCurrent),
    totalAverageToDate: fromCents(totalAverageToDate),
    rows: rows.map(({ sort: _sort, ...row }) => row),
  }
}

// ---------------------------------------------------------------- recorrência

export interface ExpenseLine {
  id: number
  description: string | null
  accountId: number
  categoryId: number | null
  occurredOn: string
  cents: number
}

/**
 * `AnalyticsRules.normalizeDescription`: minúsculas, sem acento, sem dígito e
 * pontuação (viram espaço), espaços colapsados.
 */
export function normalizeDescription(value: string | null | undefined): string {
  if (value == null) return ''
  return value.trim().normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim()
}

/** Conta + descrição normalizada; sem texto, o nome da categoria. */
export function seriesKey(accountId: number, description: string | null, categoryName: string | null): string {
  const text = normalizeDescription(description) || normalizeDescription(categoryName) || normalizeDescription(UNCATEGORIZED.name)
  return `${accountId}:${text}`
}

/** `n·S2 − S1² ≤ v²·S1²`, em inteiros: sem raiz, sem arredondamento no limite. */
export function isStable(cents: number[]): boolean {
  if (cents.length === 0) return false
  const n = BigInt(cents.length)
  let s1 = 0n
  let s2 = 0n
  for (const value of cents) {
    const v = BigInt(value)
    s1 += v
    s2 += v * v
  }
  if (s1 <= 0n) return false
  return (n * s2 - s1 * s1) * MAX_VARIATION_SQ.den <= MAX_VARIATION_SQ.num * s1 * s1
}

export function isRecurring(monthlyCents: number[]): boolean {
  return monthlyCents.length >= MIN_MONTHS && isStable(monthlyCents)
}

/**
 * `AnalyticsRules.isCharge`: cobrança, não hábito. Seis Uber por mês têm o
 * maior do mês estável, mas são 6 lançamentos por mês visto; uma mensalidade
 * cobrada em dobro num mês só fica abaixo de 1,5.
 */
export function isCharge(entries: number, monthsSeen: number): boolean {
  return entries * MAX_PER_MONTH.den <= monthsSeen * MAX_PER_MONTH.num
}

/** `AnalyticsRules.isStale`: 45 dias ainda conta; 46, a série parou. */
export function isStale(lastDate: string, todayIso: string): boolean {
  return lastDate < addDays(todayIso, -STALE_AFTER_DAYS)
}

/** Dia mais comum; empate fica com o menor. */
export function typicalDay(dates: string[]): number {
  const counts = new Map<number, number>()
  for (const date of dates) {
    const day = Number(date.slice(8, 10))
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  let best = 1
  let bestCount = 0
  for (const day of [...counts.keys()].sort((a, b) => a - b)) {
    if (counts.get(day)! > bestCount) {
      best = day
      bestCount = counts.get(day)!
    }
  }
  return best
}

/** `typicalDay` no mês seguinte ao da última cobrança, limitado ao tamanho do mês. */
export function nextExpected(lastDate: string, day: number): string {
  return toDateEnd(addMonths(lastDate.slice(0, 7), 1), day)
}

const chronological = (a: ExpenseLine, b: ExpenseLine) => compareText(a.occurredOn, b.occurredOn) || a.id - b.id

/** `AnalyticsRules.findRecurring`: no máximo um lançamento por mês, o maior. */
export function findRecurring(windowMonths: number, lines: ExpenseLine[], todayIso: string): RecurringExpenses {
  const series = new Map<string, ExpenseLine[]>()
  for (const line of lines) {
    const categoryName = line.categoryId === null ? null : (categoryById.get(line.categoryId)?.name ?? null)
    const key = seriesKey(line.accountId, line.description, categoryName)
    const list = series.get(key) ?? []
    list.push(line)
    series.set(key, list)
  }

  const items: (RecurringExpense & { averageCents: number })[] = []
  for (const [key, list] of series) {
    const perMonth = new Map<string, ExpenseLine>()
    for (const line of list) {
      const month = line.occurredOn.slice(0, 7)
      const kept = perMonth.get(month)
      // No mesmo mês, fica o de maior valor; empate, o mais recente.
      if (!kept || line.cents > kept.cents || (line.cents === kept.cents && chronological(line, kept) > 0)) {
        perMonth.set(month, line)
      }
    }
    const kept = [...perMonth.values()]
    const amounts = kept.map((line) => line.cents)
    if (!isRecurring(amounts) || !isCharge(list.length, perMonth.size)) continue

    const latest = list.reduce((a, b) => (chronological(a, b) >= 0 ? a : b))
    // Assinatura cancelada não é custo deste mês: fora de items e do total.
    if (isStale(latest.occurredOn, todayIso)) continue
    const category = latest.categoryId === null ? undefined : categoryById.get(latest.categoryId)
    const average = averageCents(amounts.reduce((a, b) => a + b, 0), amounts.length)
    const day = typicalDay(kept.map((line) => line.occurredOn))
    items.push({
      key,
      label: latest.description?.trim() || category?.name || UNCATEGORIZED.name,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      accountName: accountById.get(latest.accountId)!.name,
      averageAmount: fromCents(average),
      lastAmount: fromCents(latest.cents),
      lastDate: latest.occurredOn,
      monthsSeen: perMonth.size,
      typicalDay: day,
      nextExpected: nextExpected(latest.occurredOn, day),
      averageCents: average,
    })
  }

  items.sort((a, b) => b.averageCents - a.averageCents || compareText(a.label, b.label) || compareText(a.key, b.key))
  return {
    windowMonths,
    monthlyTotal: fromCents(items.reduce((sum, item) => sum + item.averageCents, 0)),
    items: items.map(({ averageCents: _cents, ...item }) => item),
  }
}

// ---------------------------------------------------------------- fluxo de caixa

/** `AnalyticsRules.cashflow`: série contínua, zeros nos meses parados. */
export function cashflow(from: string, current: string, income: Map<string, number>, expense: Map<string, number>): Cashflow {
  const months: CashflowMonth[] = []
  let totalIncome = 0
  let totalExpense = 0
  let closedNet = 0
  let closed = 0
  for (const month of monthsBetween(from, current)) {
    const inCents = income.get(month) ?? 0
    const outCents = expense.get(month) ?? 0
    const partial = month === current
    months.push({ month, income: fromCents(inCents), expense: fromCents(outCents), net: fromCents(inCents - outCents), partial })
    totalIncome += inCents
    totalExpense += outCents
    if (!partial) {
      closedNet += inCents - outCents
      closed++
    }
  }
  return {
    months,
    totalIncome: fromCents(totalIncome),
    totalExpense: fromCents(totalExpense),
    totalNet: fromCents(totalIncome - totalExpense),
    averageNet: closed === 0 ? null : fromCents(averageCents(closedNet, closed)),
  }
}

// ---------------------------------------------------------------- janelas

/** Janela da recorrência: `months` meses fechados mais o corrente, inteiro. */
export function recurringWindow(todayIso: string, months: number): [string, string] {
  return [`${addMonths(todayIso.slice(0, 7), -months)}-01`, lastOfMonth(todayIso)]
}

/** Janela do fluxo de caixa: o corrente e os `months − 1` anteriores. */
export function cashflowWindow(todayIso: string, months: number): [string, string] {
  return [`${addMonths(todayIso.slice(0, 7), -(months - 1))}-01`, lastOfMonth(todayIso)]
}

/** Comparação de texto do Java (`String.compareTo`), sem a localidade do `localeCompare`. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
