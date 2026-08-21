/**
 * Formatacao para o padrao brasileiro.
 *
 * Os formatadores do Intl sao criados uma vez no modulo, nao a cada chamada:
 * construir um Intl.NumberFormat e caro, e uma tabela de transacoes chama isso
 * dezenas de vezes por render.
 */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const dayMonthFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
})

const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
})

/** R$ 1.234,56 */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

/** R$ 1,2 mil — para rotulos de eixo, onde o valor completo nao cabe. */
export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value)
}

/**
 * Converte "2026-08-21" em Date sem deslocamento de fuso.
 *
 * `new Date('2026-08-21')` interpreta a string como UTC meia-noite; num fuso
 * negativo como o do Brasil isso volta um dia (20/08). Construir a data pelos
 * componentes evita o problema, porque o construtor usa o fuso local.
 */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** 21/08 */
export function formatDayMonth(iso: string): string {
  return dayMonthFormatter.format(parseIsoDate(iso))
}

/** 21/08/2026 */
export function formatDate(iso: string): string {
  return fullDateFormatter.format(parseIsoDate(iso))
}

/** "agosto de 2026", com a inicial maiuscula */
export function formatMonthYear(iso: string): string {
  const label = monthYearFormatter.format(parseIsoDate(iso))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** +12,5% / -8,3% — sempre com sinal explicito. */
export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1).replace('.', ',')}%`
}

/** Data de hoje em ISO (yyyy-mm-dd), no fuso local. */
export function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Primeiro dia do mes corrente em ISO. */
export function firstDayOfMonthIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}-01`
}

/** Ultimo dia do mes corrente em ISO. */
export function lastDayOfMonthIso(): string {
  const now = new Date()
  // Dia 0 do mes seguinte = ultimo dia do mes atual
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const month = String(last.getMonth() + 1).padStart(2, '0')
  return `${last.getFullYear()}-${month}-${String(last.getDate()).padStart(2, '0')}`
}
