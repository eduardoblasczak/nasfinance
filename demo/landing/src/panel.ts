/**
 * "O mês inteiro num número": um pedaço da primeira tela do app, com os
 * números da demonstração.
 *
 * Uma leitura só: GET /api/v1/dashboard quando a seção aparece, nunca
 * repetida na visita, nem em erro (a leitura passa pelo limite por IP do
 * Worker). Depois disso, o painel acompanha o canal ao vivo sem perguntar
 * nada ao servidor: lançamento que chega soma, lançamento que expira
 * subtrai. A conta é a do `DashboardService` (e do espelho em demo/src),
 * em centavos inteiros, como lá.
 *
 * Quais lançamentos a leitura já contou: os ids são AUTOINCREMENT e nenhum
 * lançamento tem data futura, então o maior id de `recentTransactions` é o
 * último que entrou nos totais. Evento com id maior é novo; com id menor ou
 * igual, já está na conta.
 */
import type { DashboardSummary, Transaction } from '../../../frontend/src/types'
import { formatCompactCurrency, formatCurrency, formatMonthYear, formatPercent } from '../../../frontend/src/lib/format'
// Teto de cada categoria e a cor de "Sem categoria": o mesmo catálogo que o
// Worker serve, para uma categoria que aparece ao vivo vir com o teto certo.
import { CATEGORIES, UNCATEGORIZED } from '../../src/catalog'
import { onLive, snapshot, type LiveEvent } from './feed'
import { MOTION, ease, reduced, tween } from './motion'

/** Cinco categorias e a cauda em "Outras": cabe na altura reservada. */
const TOP = 5
const SVG_NS = 'http://www.w3.org/2000/svg'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  dash: $<HTMLDivElement>('dash'),
  period: $<HTMLParagraphElement>('dash-period'),
  balance: $<HTMLParagraphElement>('dash-balance'),
  income: $<HTMLParagraphElement>('dash-income'),
  expense: $<HTMLParagraphElement>('dash-expense'),
  delta: $<HTMLParagraphElement>('dash-delta'),
  chart: $<HTMLDivElement>('dash-chart'),
  categories: $<HTMLUListElement>('dash-categories'),
  donut: $<HTMLDivElement>('dash-donut'),
  readout: $<HTMLParagraphElement>('dash-readout'),
  status: $<HTMLParagraphElement>('dash-status'),
}

interface Slice {
  name: string
  color: string
  totalCents: number
  budgetCents: number | null
}

interface Model {
  periodStart: string
  periodEnd: string
  incomeCents: number
  expenseCents: number
  previousExpenseCents: number
  slices: Slice[]
  /** Gasto de cada dia do período, na ordem; o acumulado sai daqui. */
  days: { date: string; expenseCents: number }[]
}

const toCents = (value: number) => Math.round(value * 100)

/** `percent` do espelho: razão arredondada em 4 casas, vezes 100. */
const percent = (part: number, whole: number) => Math.round((part / whole) * 10_000) / 100

const budgetOf = new Map(CATEGORIES.map((category) => [category.name, category.budgetCents]))

let model: Model | null = null
let includedUpTo = 0
/** Lançamentos de visitante já somados, com o valor para subtrair na saída. */
const counted = new Map<number, Transaction>()
/** Eventos que chegaram com a leitura a caminho: decididos quando ela voltar. */
let pending: LiveEvent[] | null = null

// ============================================================ dinheiro

/** O desenho do Money do app: sinal e cor juntos, centavos menores. */
function money(target: HTMLElement, cents: number, sign: '+' | '-' | 'none', negative = false) {
  const formatted = formatCurrency(Math.abs(cents) / 100)
  const comma = formatted.lastIndexOf(',')
  const small = document.createElement('span')
  small.className = 'text-[0.82em]'
  small.textContent = formatted.slice(comma)
  const prefix = sign === '-' ? '− ' : sign === '+' ? '+ ' : ''
  target.replaceChildren(`${prefix}${formatted.slice(0, comma)}`, small)
  target.classList.add('tabular', 'whitespace-nowrap')
  target.classList.toggle('text-accent', sign === '+' && !negative)
  target.classList.toggle('text-negative', negative)
}

/** Número que sobe (na chegada) ou anda (numa atualização) até o valor novo. */
const shown = new Map<HTMLElement, number>()
const running = new Map<HTMLElement, () => void>()
function animateMoney(target: HTMLElement, cents: number, draw: (value: number) => void, duration: number) {
  running.get(target)?.()
  const from = shown.get(target) ?? 0
  shown.set(target, cents)
  running.set(target, tween(from, cents, duration, (value) => draw(Math.round(value))))
}

// ============================================================ desenho

function renderTotals(duration: number) {
  if (!model) return
  const balance = model.incomeCents - model.expenseCents
  animateMoney(els.balance, balance, (value) => money(els.balance, value, value < 0 ? '-' : 'none', value < 0), duration)
  animateMoney(els.income, model.incomeCents, (value) => money(els.income, value, '+'), duration)
  animateMoney(els.expense, model.expenseCents, (value) => money(els.expense, value, '-'), duration)

  // Variação contra o período anterior, como no card "Saiu" do app: subir é
  // ruim (vermelho, ↑), cair é bom (verde, ↓), e a seta acompanha a cor.
  els.delta.replaceChildren()
  if (model.previousExpenseCents === 0) return
  const delta = percent(model.expenseCents - model.previousExpenseCents, model.previousExpenseCents)
  const flat = Math.abs(delta) < 0.05
  els.delta.className = `mt-0.5 min-h-[1.25rem] text-[0.8125rem] tabular ${flat ? 'text-faint' : delta > 0 ? 'text-negative' : 'text-accent'}`
  const vs = document.createElement('span')
  vs.className = 'text-faint'
  vs.textContent = ' vs. anterior'
  els.delta.append(`${flat ? '→' : delta > 0 ? '↑' : '↓'} ${formatPercent(delta)}`, vs)
}

// ---- categorias: rosca + legenda que filtra ----

let selected: string | null = null
const shownRatio = new Map<string, number>()

function rowsOf(current: Model): Slice[] {
  const sorted = [...current.slices].filter((slice) => slice.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents)
  const rows = sorted.slice(0, TOP)
  const tail = sorted.slice(TOP)
  if (tail.length > 0) {
    // A cauda vira uma fatia só, como no app: seis cores parecidas não
    // respondem "em que gastei mais?".
    rows.push({
      name: `Outras (${tail.length})`,
      color: 'var(--color-faint)',
      totalCents: tail.reduce((sum, slice) => sum + slice.totalCents, 0),
      budgetCents: null,
    })
  }
  return rows
}

/** O centro da rosca: o total do mês, ou a categoria escolhida. */
function renderCenter(rows: Slice[]) {
  const donut = els.donut
  const value = donut.querySelector<HTMLElement>('[data-center-value]')
  const label = donut.querySelector<HTMLElement>('[data-center-label]')
  if (!model || !value || !label) return
  const slice = rows.find((row) => row.name === selected)
  const total = model.expenseCents
  money(value, slice ? slice.totalCents : total, 'none')
  label.textContent = slice
    ? `${slice.name} · ${total ? Math.round((slice.totalCents / total) * 100) : 0}% do mês`
    : 'saiu no mês'
  donut.toggleAttribute('data-selected', Boolean(slice))
  els.categories.toggleAttribute('data-selected', Boolean(slice))
  for (const segment of donut.querySelectorAll<SVGCircleElement>('.donut-seg')) {
    segment.classList.toggle('is-on', segment.dataset.name === selected)
  }
  for (const button of els.categories.querySelectorAll<HTMLButtonElement>('.legend-row')) {
    button.setAttribute('aria-pressed', String(button.dataset.name === selected))
  }
}

function choose(name: string, rows: Slice[]) {
  selected = selected === name ? null : name
  renderCenter(rows)
}

function renderSlices(first: boolean) {
  if (!model) return
  const rows = rowsOf(model)
  if (rows.length === 0) {
    const li = document.createElement('li')
    li.className = 'py-10 text-center text-[0.9375rem] text-faint'
    li.textContent = 'Nenhuma despesa neste período.'
    els.categories.replaceChildren(li)
    els.donut.replaceChildren()
    return
  }
  if (selected && !rows.some((row) => row.name === selected)) selected = null
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0)
  const max = Math.max(...rows.map((row) => row.totalCents))
  const animate = !reduced()

  // Rosca: cada fatia é um círculo girado até o seu começo, desenhado com
  // stroke-dasharray. Na entrada, as fatias crescem em sequência
  // (stroke-dashoffset); numa atualização ao vivo, a mudança é instantânea.
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const root = svg('svg', { viewBox: '0 0 176 176', class: 'size-full' })
  root.append(svg('circle', { cx: 88, cy: 88, r: radius, fill: 'none', stroke: 'rgb(255 255 255 / 0.05)', 'stroke-width': 18 }))
  let start = 0
  rows.forEach((row, index) => {
    const length = (row.totalCents / total) * circumference
    const visible = Math.max(length - 2, 0.5)
    const segment = svg('circle', {
      cx: 88,
      cy: 88,
      r: radius,
      class: 'donut-seg',
      stroke: row.color,
      'stroke-dasharray': `${visible} ${circumference}`,
      transform: `rotate(${(start / circumference) * 360 - 90} 88 88)`,
    })
    segment.dataset.name = row.name
    segment.addEventListener('click', () => choose(row.name, rows))
    root.append(segment)
    if (first && animate) {
      segment.animate([{ strokeDashoffset: visible }, { strokeDashoffset: 0 }], {
        duration: MOTION.slow,
        delay: index * 90,
        easing: ease(),
        fill: 'backwards',
      })
    }
    start += length
  })
  const center = document.createElement('div')
  center.className = 'pointer-events-none absolute inset-0 grid place-content-center text-center'
  const value = document.createElement('p')
  value.dataset.centerValue = ''
  value.className = 'text-[1.125rem] font-semibold text-fg'
  const label = document.createElement('p')
  label.dataset.centerLabel = ''
  label.className = 'mx-auto mt-0.5 max-w-[7.5rem] text-[0.75rem] leading-tight text-faint'
  center.append(value, label)
  els.donut.replaceChildren(root, center)

  // Legenda: cada linha é um botão que destaca a categoria na rosca.
  els.categories.replaceChildren(
    ...rows.map((row, index) => {
      const li = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.name = row.name
      button.className = 'legend-row press block min-h-11 w-full rounded-[var(--radius-inset)] px-2.5 py-2 text-left'
      button.addEventListener('click', () => choose(row.name, rows))

      const top = document.createElement('span')
      top.className = 'flex items-center gap-2.5'
      const dot = document.createElement('span')
      dot.className = 'size-2.5 shrink-0 rounded-full'
      dot.style.setProperty('background-color', row.color)
      const name = document.createElement('span')
      name.className = 'min-w-0 flex-1 truncate text-[0.9375rem] text-fg'
      name.textContent = row.name
      const amount = document.createElement('span')
      amount.className = 'shrink-0 text-[0.9375rem] font-semibold'
      money(amount, row.totalCents, 'none')
      top.append(dot, name, amount)

      const bottom = document.createElement('span')
      bottom.className = 'mt-1.5 ml-5 flex items-center gap-3'
      const track = document.createElement('span')
      track.className = 'h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]'
      const bar = document.createElement('span')
      bar.className = 'bar-fill block h-full rounded-full'
      bar.style.setProperty('background-color', row.color)
      const ratio = row.totalCents / max
      bar.style.setProperty('transform', `scaleX(${ratio})`)
      if (animate) {
        bar.animate([{ transform: `scaleX(${first ? 0 : (shownRatio.get(row.name) ?? 0)})` }, { transform: `scaleX(${ratio})` }], {
          duration: first ? MOTION.flight : MOTION.slow,
          delay: first ? index * 60 : 0,
          easing: ease(),
          fill: 'backwards',
        })
      }
      shownRatio.set(row.name, ratio)
      track.append(bar)
      bottom.append(track)
      if (row.budgetCents) {
        // Acima do teto, cor E palavra: não depende só do vermelho.
        const used = percent(row.totalCents, row.budgetCents)
        const over = used > 100
        const budget = document.createElement('span')
        budget.className = `shrink-0 text-[0.75rem] tabular ${over ? 'font-semibold text-negative' : 'text-faint'}`
        budget.textContent = over ? `${Math.round(used - 100)}% acima do teto` : `${Math.round(used)}% do teto`
        bottom.append(budget)
      }
      button.append(top, bottom)
      li.append(button)
      return li
    }),
  )
  renderCenter(rows)
}

// ---- ritmo de gasto: curva que se desenha, cursor que segue o dedo ----

/** Hoje no fuso do app: é até aqui que a curva vai. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  return node
}

interface Geometry {
  xs: number[]
  ys: number[]
  daily: number[]
  cumulative: number[]
  dates: string[]
  cursor: SVGGElement
  tip: HTMLElement
  width: number
}
let geometry: Geometry | null = null
let cursorIndex = -1

const dayLabel = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`

/** Mostra o dia `index` no cursor, na etiqueta e na linha de leitura. */
function point(index: number, announce: boolean) {
  if (!geometry || geometry.xs.length === 0) return
  const { xs, ys, daily, cumulative, dates, cursor, tip, width } = geometry
  cursorIndex = Math.max(0, Math.min(xs.length - 1, index))
  const x = xs[cursorIndex]
  const y = ys[cursorIndex]
  cursor.setAttribute('transform', `translate(${x} 0)`)
  cursor.querySelector('circle')?.setAttribute('cy', String(y))
  const dayText = `${dayLabel(dates[cursorIndex])} · ${formatCurrency(daily[cursorIndex] / 100)} no dia`
  tip.textContent = dayText
  // A etiqueta fica dentro do gráfico: perto da borda, ela vira para dentro.
  const tipWidth = tip.offsetWidth
  const left = Math.min(Math.max(x - tipWidth / 2, 0), width - tipWidth)
  tip.style.setProperty('transform', `translate(${left}px, ${Math.max(y - 34, 0)}px)`)
  const line = `${dayText}, ${formatCurrency(cumulative[cursorIndex] / 100)} no mês`
  if (announce) els.readout.textContent = line
}

function renderChart(reveal: boolean) {
  if (!model) return
  const width = els.chart.clientWidth
  const height = els.chart.clientHeight
  if (width === 0 || height === 0) return

  const until = today()
  let running = 0
  const daily: number[] = []
  const cumulative: number[] = []
  const dates: string[] = []
  for (const day of model.days) {
    if (day.date > until) break
    running += day.expenseCents
    daily.push(day.expenseCents)
    cumulative.push(running)
    dates.push(day.date)
  }
  const total = model.days.length
  const max = Math.max(...cumulative, 1)
  const top = 22
  const bottom = 22
  const x = (index: number) => (total <= 1 ? 0 : (index / (total - 1)) * (width - 8) + 4)
  const y = (cents: number) => top + (1 - cents / max) * (height - top - bottom)
  const xs = cumulative.map((_, index) => x(index))
  const ys = cumulative.map((cents) => y(cents))

  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true' })
  for (const level of [0, 0.5, 1]) {
    const lineY = y(max * level)
    root.append(svg('line', { x1: 0, x2: width, y1: lineY, y2: lineY, class: 'chart-grid' }))
  }
  const maxLabel = svg('text', { x: 0, y: top - 8, class: 'chart-label' })
  maxLabel.textContent = formatCompactCurrency(max / 100)
  root.append(maxLabel)

  const tip = document.createElement('p')
  tip.className = 'chart-tip tabular'
  const cursor = svg('g', { class: 'chart-cursor' })
  cursor.append(svg('line', { x1: 0, x2: 0, y1: top, y2: height - bottom }), svg('circle', { cx: 0, cy: 0, r: 4.5, fill: 'var(--color-fg)' }))

  if (xs.length > 0) {
    const last = xs.length - 1
    const line = xs.map((px, index) => `${index === 0 ? 'M' : 'L'}${px.toFixed(1)} ${ys[index].toFixed(1)}`).join('')
    const area = svg('path', { d: `${line}L${xs[last].toFixed(1)} ${y(0).toFixed(1)}L${xs[0].toFixed(1)} ${y(0).toFixed(1)}Z`, class: 'chart-area' })
    const stroke = svg('path', { d: line, class: 'chart-line' })
    const halo = svg('circle', { cx: xs[last], cy: ys[last], r: 8, fill: 'var(--color-accent)', 'fill-opacity': 0.25, class: 'chart-today' })
    const dot = svg('circle', { cx: xs[last], cy: ys[last], r: 4, fill: 'var(--color-accent)' })
    root.append(area, stroke, halo, dot, cursor)

    const labels: [number, string, string][] = [
      [0, String(Number(model.days[0].date.slice(8))), 'start'],
      [total - 1, String(Number(model.days[total - 1].date.slice(8))), 'end'],
    ]
    if (last > 2 && last < total - 3) labels.push([last, 'hoje', 'middle'])
    for (const [index, text, anchor] of labels) {
      const label = svg('text', { x: x(index), y: height - 4, 'text-anchor': anchor, class: 'chart-label' })
      label.textContent = text
      root.append(label)
    }

    if (!reduced()) {
      if (reveal) {
        // A curva se desenha (stroke-dashoffset), a área acende depois, e o
        // ponto de hoje aparece no fim.
        const length = stroke.getTotalLength()
        stroke.setAttribute('stroke-dasharray', String(length))
        stroke.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: MOTION.flight, easing: ease() })
        area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.slow, delay: MOTION.base, easing: ease(), fill: 'backwards' })
        for (const node of [halo, dot]) {
          node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, delay: MOTION.flight - MOTION.fast, fill: 'backwards' })
        }
      } else {
        // Atualização ao vivo: o ponto de hoje pulsa onde o valor mudou.
        halo.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.4)', opacity: 0 }], {
          duration: MOTION.flight,
          easing: ease(),
        })
      }
    }
  } else {
    root.append(cursor)
  }

  els.chart.replaceChildren(root, tip)
  geometry = { xs, ys, daily, cumulative, dates, cursor, tip, width }
  if (cursorIndex >= 0 && els.chart.classList.contains('is-scrubbing')) point(cursorIndex, false)
  els.chart.setAttribute('aria-label', `Gasto acumulado no mês: ${formatCurrency((cumulative.at(-1) ?? 0) / 100)} até hoje. Use as setas para ver cada dia.`)
}

/** Toque, mouse e teclado no gráfico. Tudo calculado na hora, sem trabalho por quadro. */
function bindChart() {
  const chart = els.chart
  // Arrastar só anuncia ao leitor de tela no toque inicial: anunciar a cada dia
  // cruzado enfileira dezenas de falas. E o movimento vira no máximo um desenho
  // por quadro, porque cada um escreve e mede a etiqueta.
  const fromPointer = (event: PointerEvent, announce: boolean) => {
    if (!geometry || geometry.xs.length === 0) return
    const left = chart.getBoundingClientRect().left
    const px = event.clientX - left
    let nearest = 0
    for (let i = 1; i < geometry.xs.length; i++) {
      if (Math.abs(geometry.xs[i] - px) < Math.abs(geometry.xs[nearest] - px)) nearest = i
    }
    chart.classList.add('is-scrubbing')
    point(nearest, announce)
  }
  let frame = 0
  let pending: PointerEvent | null = null
  chart.addEventListener('pointermove', (event) => {
    pending = event
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (pending) fromPointer(pending, false)
      pending = null
    })
  })
  chart.addEventListener('pointerdown', (event) => fromPointer(event, true))
  chart.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && document.activeElement !== chart) chart.classList.remove('is-scrubbing')
  })
  chart.addEventListener('focus', () => {
    if (!geometry || geometry.xs.length === 0) return
    chart.classList.add('is-scrubbing')
    point(cursorIndex >= 0 ? cursorIndex : geometry.xs.length - 1, true)
  })
  chart.addEventListener('blur', () => chart.classList.remove('is-scrubbing'))
  chart.addEventListener('keydown', (event) => {
    if (!geometry) return
    const moves: Record<string, number> = { ArrowLeft: cursorIndex - 1, ArrowRight: cursorIndex + 1, Home: 0, End: geometry.xs.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    chart.classList.add('is-scrubbing')
    point(moves[event.key], true)
  })
}

function render(first: boolean) {
  renderTotals(first ? MOTION.flight : MOTION.slow)
  renderSlices(first)
  renderChart(first)
}

// ============================================================ ao vivo

/** Soma (ou subtrai) um lançamento nos totais, como o DashboardService faria. */
function apply(transaction: Transaction, direction: 1 | -1) {
  if (!model || transaction.occurredOn < model.periodStart || transaction.occurredOn > model.periodEnd) return false
  const cents = toCents(transaction.amount) * direction
  if (transaction.flow === 'INCOME') {
    model.incomeCents += cents
    return true
  }
  model.expenseCents += cents
  const name = transaction.categoryName ?? UNCATEGORIZED.name
  let slice = model.slices.find((candidate) => candidate.name === name)
  if (!slice) {
    slice = {
      name,
      color: transaction.categoryColor ?? UNCATEGORIZED.color,
      totalCents: 0,
      budgetCents: budgetOf.get(name) ?? null,
    }
    model.slices.push(slice)
  }
  slice.totalCents += cents
  const day = model.days.find((candidate) => candidate.date === transaction.occurredOn)
  if (day) day.expenseCents += cents
  return true
}

function handle(event: LiveEvent): boolean {
  if (event.type === 'CREATED') {
    const transaction = event.transaction
    if (transaction.id <= includedUpTo || counted.has(transaction.id)) return false
    counted.set(transaction.id, transaction)
    return apply(transaction, 1)
  }
  const transaction = counted.get(event.id)
  if (!transaction) return false
  counted.delete(event.id)
  return apply(transaction, -1)
}

onLive((event) => {
  if (pending) {
    pending.push(event)
    return
  }
  if (model && handle(event)) render(false)
})

// ============================================================ leitura

function fromSummary(summary: DashboardSummary): Model {
  return {
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
    incomeCents: toCents(summary.totalIncome),
    expenseCents: toCents(summary.totalExpense),
    previousExpenseCents: toCents(summary.previousExpense),
    slices: summary.expenseByCategory.map((slice) => ({
      name: slice.categoryName,
      color: slice.color,
      totalCents: toCents(slice.total),
      budgetCents: slice.budget === null ? null : toCents(slice.budget),
    })),
    days: summary.dailySeries.map((point) => ({ date: point.date, expenseCents: toCents(point.expense) })),
  }
}

async function load() {
  pending = []
  els.status.textContent = 'Buscando os números da demonstração…'
  try {
    const response = await fetch('/api/v1/dashboard')
    if (!response.ok) throw new Error(String(response.status))
    const summary = (await response.json()) as DashboardSummary
    model = fromSummary(summary)
    includedUpTo = Math.max(0, ...summary.recentTransactions.map((transaction) => transaction.id))
    // O que o feed já mostra e a leitura contou: precisa estar aqui para,
    // quando expirar, sair dos totais também.
    for (const transaction of snapshot()) if (transaction.id <= includedUpTo) counted.set(transaction.id, transaction)
    for (const event of pending) handle(event)
    pending = null

    els.period.textContent = `Saldo · ${formatMonthYear(summary.periodStart).toLowerCase()}`
    els.dash.setAttribute('aria-busy', 'false')
    render(true)
    new ResizeObserver(() => renderChart(false)).observe(els.chart)
    els.status.textContent = 'Números da demonstração, agora. Mudam sozinhos quando chega lançamento no feed.'
  } catch {
    pending = null
    els.dash.setAttribute('aria-busy', 'false')
    for (const target of [els.balance, els.income, els.expense]) target.textContent = '—'
    els.chart.replaceChildren()
    els.categories.replaceChildren()
    els.donut.replaceChildren()
    // Sem segunda tentativa: a leitura é uma por visita, e o app tem os
    // mesmos números.
    els.status.textContent = 'Não deu para buscar os números agora. O botão Abrir o painel leva ao app, que tem os mesmos.'
  }
}

export function startPanel() {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    void load()
  })
  observer.observe(els.dash)
  bindChart()
}
