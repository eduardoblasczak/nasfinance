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

const monthNameFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long' })

/** "novembro" — so o nome do mes, em minuscula, para usar no meio da frase. */
export function formatMonthName(iso: string): string {
  return monthNameFormatter.format(parseIsoDate(iso))
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

/**
 * Hoje em ISO no fuso de Sao Paulo, independente do fuso do aparelho.
 *
 * O "Hoje" de uma lista de lancamentos e o dia do usuario no Brasil; um
 * notebook em viagem com relogio em outro fuso nao pode mudar o rotulo.
 * en-CA porque e o locale que o Intl formata como yyyy-mm-dd.
 */
const saoPauloIsoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayIsoInSaoPaulo(now: Date = new Date()): string {
  return saoPauloIsoFormatter.format(now)
}

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const monthShortFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

/**
 * "out." — o mês curto de um `YYYY-MM` (ou de uma data ISO), para eixo de
 * gráfico. Sem o ano: o eixo é uma sequência contínua, e o ano completo
 * aparece na leitura do mês escolhido.
 */
export function formatMonthShort(month: string): string {
  return monthShortFormatter.format(parseIsoDate(`${month.slice(0, 7)}-01`))
}

/** "Outubro de 2026" a partir de `YYYY-MM`. */
export function formatMonthLong(month: string): string {
  return formatMonthYear(`${month.slice(0, 7)}-01`)
}

/** "12 nov." — dia e mês curto, para data prevista numa linha de lista. */
export function formatDayMonthShort(iso: string): string {
  const date = parseIsoDate(iso)
  return `${date.getDate()} ${monthShortFormatter.format(date)}`
}

/**
 * "Hoje", "Ontem", "seg., 13 out." — e o ano so quando nao e o corrente.
 *
 * Montado a mao porque o Intl em pt-BR escreve "seg., 13 de out.", e o "de"
 * alonga o rotulo sem dizer nada a mais.
 */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const today = todayIsoInSaoPaulo(now)
  if (iso === today) return 'Hoje'

  const date = parseIsoDate(iso)
  const yesterday = parseIsoDate(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.getTime() === yesterday.getTime()) return 'Ontem'

  const weekday = weekdayFormatter.format(date)
  const month = monthShortFormatter.format(date)
  const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date.getDate()} ${month}`
  return iso.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${iso.slice(0, 4)}`
}

/**
 * Origem de um lancamento em portugues de gente.
 *
 * O enum (`AGGREGATOR`, `SHORTCUT`) e vocabulario da API; na tela ele vira o
 * nome que o usuario reconhece. Valor desconhecido cai num rotulo neutro em
 * vez de vazar o enum cru.
 */
export function sourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'AGGREGATOR':
      return 'Open Finance'
    case 'SHORTCUT':
      return 'Atalho do iPhone'
    case 'IMPORT':
      return 'Importação'
    case 'MANUAL':
      return 'Manual'
    default:
      return 'Outra origem'
  }
}

/**
 * "1.234,56", "1234,56" e "1234.56" viram 1234.56.
 *
 * Com virgula, ela e o decimal e os pontos sao milhar (pt-BR). Sem virgula,
 * o ponto e o decimal — quem cola um valor de outro lugar costuma trazer
 * assim. Tratar o ponto sempre como milhar transformaria 10.50 em 1050.
 */
export function parseDecimal(text: string): number {
  const clean = text.trim().replace(/\s|R\$/g, '')
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  return Number(normalized)
}
