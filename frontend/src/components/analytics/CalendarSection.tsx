import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Money } from '@/components/ui/Money'
import { card } from '@/components/ui/styles'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { useReveal, useWidth } from '@/hooks/useMotion'
import { useResource } from '@/hooks/useResource'
import { getSpendingCalendar } from '@/lib/api'
import { formatCurrency, formatDayLabel, formatDayMonthShort, formatMonthShort, parseIsoDate } from '@/lib/format'
import type { CalendarDay, SpendingCalendar } from '@/types'
import { CountUpMoney, EmptyCard, SectionError, SectionHeader, Skeleton, StaleNotice, WindowPicker, monthsLabel } from './common'

export const CALENDAR_WINDOWS = [3, 6, 12] as const

/** Semana começando na segunda, como no calendário brasileiro de parede. */
const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const WEEKDAYS_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

/** Coluna dos nomes dos dias, à esquerda da grade. */
const LABEL = 30
/** Altura da linha dos meses, acima de cada faixa. */
const MONTH_ROW = 18
/** Espaço entre quadradinhos. */
const GAP = 3
/**
 * Passo mínimo e máximo de um quadradinho. Abaixo de 13 px o dia vira poeira
 * (12 meses numa tela de 375 dariam 5 px); aí a grade quebra em faixas, como
 * texto que quebra linha, em vez de encolher. Acima de 22, três meses no
 * desktop virariam azulejos.
 */
const MIN_PITCH = 13
const MAX_PITCH = 22

interface Props {
  months: number
  onMonthsChange: (months: number) => void
}

/** Segunda = 0 … domingo = 6. */
const weekdayOf = (iso: string) => (parseIsoDate(iso).getDay() + 6) % 7

/**
 * Calendário de calor: cada dia um quadradinho, mais claro quanto mais saiu.
 *
 * A escala é por quartis dos dias com gasto, e não linear até o maior dia:
 * o dia do aluguel valeria 20 vezes um dia comum e deixaria o resto do
 * calendário apagado. Em quartis, cada tom tem um quarto dos dias com gasto,
 * e o padrão (fim de semana, dia do mercado) aparece. Branco, e não verde ou
 * vermelho: gasto não é bom nem ruim aqui, só mais ou menos.
 *
 * A média por dia da semana sai dos mesmos dados, aqui na tela (não há rota
 * própria): mudar a janela muda as duas juntas.
 */
export function CalendarSection({ months, onMonthsChange }: Props) {
  const titleId = useId()
  const { data, loading, refreshing, error, reload } = useResource(String(months), () => getSpendingCalendar({ months }))

  return (
    <section aria-labelledby={titleId}>
      <SectionHeader
        id={titleId}
        title="Calendário de gastos"
        support={`Quanto saiu em cada dia ${monthsLabel(months)}, e o dia da semana que mais pesa.`}
      >
        <WindowPicker label="Meses no calendário" value={months} options={CALENDAR_WINDOWS} onChange={onMonthsChange} />
      </SectionHeader>
      {loading ? (
        <div
          aria-busy="true"
          aria-label="Carregando o calendário"
          className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]"
        >
          <Skeleton className="h-[22rem]" rows={2} />
          <Skeleton className="h-[16rem]" rows={1} />
        </div>
      ) : !data ? (
        <SectionError what="O calendário" error={error} onRetry={reload} />
      ) : (
        <div aria-busy={refreshing} className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
          <StaleNotice error={error} />
          {/* Chave pela janela: o dia escolhido é um índice e apontaria para
              outra data ao trocar 3 → 12 meses. */}
          <CalendarBody key={data.from} data={data} />
        </div>
      )}
    </section>
  )
}

function CalendarBody({ data }: { data: SpendingCalendar }) {
  const { hidden } = useMoneyVisibility()
  const [ref, revealed] = useReveal<HTMLDivElement>()
  const days = data.days
  const total = days.reduce((sum, day) => sum + day.expense, 0)

  if (days.length === 0 || total === 0) {
    return (
      <EmptyCard title="Nenhum gasto no período">
        Os dias se acendem aqui conforme as despesas chegam — pelo Atalho do iPhone, pela sincronização ou à mão.
      </EmptyCard>
    )
  }

  return (
    <div ref={ref} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-start">
      <HeatmapCard days={days} total={total} revealed={revealed} hidden={hidden} />
      <WeekdayCard days={days} revealed={revealed} hidden={hidden} />
    </div>
  )
}

/** Quartis dos dias com gasto: os limites entre os tons 1–2, 2–3 e 3–4. */
function quartiles(days: CalendarDay[]): [number, number, number] {
  const values = days
    .filter((day) => day.expense > 0)
    .map((day) => day.expense)
    .sort((a, b) => a - b)
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 0
  return [at(0.25), at(0.5), at(0.75)]
}

const LEVEL_CLASS = ['fill-white/[0.06]', 'fill-fg/20', 'fill-fg/40', 'fill-fg/65', 'fill-fg/95']

function HeatmapCard({
  days,
  total,
  revealed,
  hidden,
}: {
  days: CalendarDay[]
  total: number
  revealed: boolean
  hidden: boolean
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const summaryId = useId()
  const index = picked ?? days.length - 1
  const day = days[index]
  const empty = days.filter((item) => item.expense === 0).length
  const peak = days.reduce((best, item) => (item.expense > best.expense ? item : best), days[0])

  const valueText = hidden
    ? `${formatDayLabel(day.date)}: valor oculto`
    : `${formatDayLabel(day.date)}: ${day.expense === 0 ? 'nenhum gasto' : `${formatCurrency(day.expense)} em ${day.count} ${day.count === 1 ? 'lançamento' : 'lançamentos'}`}`

  return (
    <div className={`${card} px-5 pt-5 pb-4`}>
      <p className="text-[0.9375rem] text-dim">Média por dia</p>
      <CountUpMoney
        value={total / days.length}
        active={revealed}
        className="mt-1 block text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg"
      />
      <p className="mt-1 text-[0.875rem] text-faint">
        {empty} de {days.length} dias sem gasto
        {!hidden && peak.expense > 0 && (
          <>
            {' '}
            · maior dia: {formatDayMonthShort(peak.date)}, <Money value={peak.expense} />
          </>
        )}
      </p>

      <p id={summaryId} className="sr-only">
        {hidden
          ? 'Calendário oculto junto com os valores.'
          : 'Um quadrado por dia, mais claro quanto mais saiu. Setas para os lados mudam de semana; para cima e para baixo, de dia.'}
      </p>

      {hidden ? (
        // O desenho dos tons já conta em que dias se gasta mais: oculto, sai
        // inteiro, como o gráfico do fluxo de caixa.
        <div className="mt-4 flex h-[11rem] items-center justify-center rounded-[var(--radius-inset)] bg-surface-2">
          <p className="text-[0.9375rem] text-faint">Valores ocultos</p>
        </div>
      ) : (
        <>
          <Heatmap
            days={days}
            index={index}
            onSelect={setPicked}
            revealed={revealed}
            describedBy={summaryId}
            valueText={valueText}
          />
          <div aria-hidden="true" className="mt-2 flex items-center justify-end gap-1 text-[0.75rem] text-faint">
            menos
            <svg viewBox="0 0 64 10" className="mx-1 h-2.5 w-16">
              {LEVEL_CLASS.map((level, i) => (
                <rect key={level} x={i * 13} width="10" height="10" rx="2" className={level} />
              ))}
            </svg>
            mais
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-inset)] bg-surface-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[0.875rem] font-semibold text-fg">{formatDayLabel(day.date)}</p>
          <p className="text-[0.8125rem] text-faint">
            {day.count === 0 ? 'Nenhum gasto' : `${day.count} ${day.count === 1 ? 'lançamento' : 'lançamentos'}`}
          </p>
        </div>
        <Money value={day.expense} className="shrink-0 text-[1.0625rem] font-semibold text-fg" />
      </div>
    </div>
  )
}

interface HeatmapProps {
  days: CalendarDay[]
  index: number
  onSelect: (index: number) => void
  revealed: boolean
  describedBy: string
  valueText: string
}

/**
 * A grade em SVG à mão. Colunas são semanas, linhas são dias da semana. Não
 * cabendo, quebra em faixas (ver MIN_PITCH).
 *
 * Um quadradinho de 15 px não é alvo de toque: a grade inteira é um controle
 * só (role="slider", como o gráfico do fluxo de caixa), e o dedo escolhe o
 * dia mais perto de onde encostou e arrasta por cima dos outros.
 */
function Heatmap({ days, index, onSelect, revealed, describedBy, valueText }: HeatmapProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const offset = weekdayOf(days[0].date)
  const columns = Math.ceil((offset + days.length) / 7)
  const room = Math.max(width - LABEL, 0)
  const fit = Math.max(1, Math.floor(room / MIN_PITCH))
  const bands = Math.ceil(columns / fit)
  // Faixas equilibradas: 53 semanas em 3 faixas viram 18+18+17, e não 21+21+11.
  const perBand = Math.ceil(columns / bands)
  const pitch = Math.min(MAX_PITCH, room / perBand)
  const size = Math.max(pitch - GAP, 1)
  const bandHeight = MONTH_ROW + 7 * pitch
  const bandGap = 12
  const height = bands * bandHeight + (bands - 1) * bandGap
  const [q1, q2, q3] = quartiles(days)
  const level = (value: number) => (value <= 0 ? 0 : value <= q1 ? 1 : value <= q2 ? 2 : value <= q3 ? 3 : 4)

  const place = (i: number) => {
    const position = offset + i
    const column = Math.floor(position / 7)
    const band = Math.floor(column / perBand)
    return {
      x: LABEL + (column % perBand) * pitch,
      y: band * (bandHeight + bandGap) + MONTH_ROW + (position % 7) * pitch,
      column,
      band,
    }
  }

  // Rótulo de mês na coluna do dia 1º; pulado se encostaria no anterior.
  const monthLabels: { x: number; y: number; text: string }[] = []
  let lastX = -Infinity
  let lastBand = -1
  days.forEach((day, i) => {
    if (i !== 0 && !day.date.endsWith('-01')) return
    const { x, band } = place(i)
    if (band === lastBand && x - lastX < 28) return
    monthLabels.push({ x, y: band * (bandHeight + bandGap) + 12, text: formatMonthShort(day.date).replace('.', '') })
    lastX = x
    lastBand = band
  })

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    if (pitch <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - rect.left - LABEL
    const py = event.clientY - rect.top
    const band = Math.max(0, Math.min(bands - 1, Math.floor(py / (bandHeight + bandGap))))
    const row = Math.max(0, Math.min(6, Math.floor((py - band * (bandHeight + bandGap) - MONTH_ROW) / pitch)))
    const column = band * perBand + Math.max(0, Math.min(perBand - 1, Math.floor(px / pitch)))
    onSelect(Math.max(0, Math.min(days.length - 1, column * 7 + row - offset)))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: index - 7,
      ArrowRight: index + 7,
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: days.length - 1,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    onSelect(Math.max(0, Math.min(days.length - 1, moves[event.key])))
  }

  const chosen = place(index)

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Dia no calendário de gastos"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={days.length - 1}
      aria-valuenow={index}
      aria-valuetext={valueText}
      aria-describedby={describedBy}
      onPointerDown={pick}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse' || event.buttons > 0) pick(event)
      }}
      onKeyDown={onKeyDown}
      // pan-y: arrastar de lado escolhe o dia; na vertical, a página rola.
      className="mt-4 cursor-crosshair touch-pan-y rounded-[var(--radius-inset)] select-none"
      style={{ minHeight: width > 0 ? height : '11rem' }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          className="block overflow-visible"
        >
          {Array.from({ length: bands }, (_, band) =>
            [0, 2, 4].map((row) => (
              <text
                key={`${band}-${row}`}
                x={0}
                y={band * (bandHeight + bandGap) + MONTH_ROW + row * pitch + size / 2 + 4}
                className="fill-faint text-[11px]"
              >
                {WEEKDAYS_SHORT[row]}
              </text>
            )),
          )}
          {monthLabels.map((label) => (
            <text key={`${label.x}-${label.y}`} x={label.x} y={label.y} className="fill-faint text-[11px]">
              {label.text}
            </text>
          ))}
          {revealed &&
            days.map((day, i) => {
              const { x, y, column } = place(i)
              return (
                <rect
                  key={day.date}
                  x={x}
                  y={y}
                  width={size}
                  height={size}
                  rx={Math.min(3, size / 4)}
                  className={`fade-in ${LEVEL_CLASS[level(day.expense)]}`}
                  // Acende da semana mais antiga para a mais nova, como a
                  // leitura do calendário; teto de ~500 ms no total.
                  style={{ animationDelay: `${Math.min(column * 10, 500)}ms` }}
                />
              )
            })}
          {/* O dia escolhido: contorno no acento, que anda por transform. */}
          <rect
            x={-1.5}
            y={-1.5}
            width={size + 3}
            height={size + 3}
            rx={Math.min(4, size / 3)}
            className="fill-none stroke-accent transition-transform duration-150"
            strokeWidth={2}
            style={{ transform: `translate(${chosen.x}px, ${chosen.y}px)` }}
          />
        </svg>
      )}
    </div>
  )
}

/**
 * Média por dia da semana: soma de cada dia da semana ÷ quantas vezes ele
 * aparece na janela, contando os dias sem gasto — senão o domingo em que
 * nada saiu sumiria da conta e o domingo pareceria caro.
 */
function WeekdayCard({ days, revealed, hidden }: { days: CalendarDay[]; revealed: boolean; hidden: boolean }) {
  const sums = Array(7).fill(0) as number[]
  const counts = Array(7).fill(0) as number[]
  for (const day of days) {
    const weekday = weekdayOf(day.date)
    sums[weekday] += day.expense
    counts[weekday] += 1
  }
  const averages = sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0))
  const top = averages.indexOf(Math.max(...averages))
  const others = averages.filter((_, i) => i !== top && counts[i] > 0)
  const othersAverage = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0
  const max = Math.max(1, ...averages)

  return (
    <div className={`${card} px-5 pt-5 pb-4`}>
      <p className="text-[0.9375rem] text-dim">Por dia da semana</p>
      {hidden ? (
        <>
          <p className="mt-1 text-[1.25rem] leading-tight font-bold text-fg">Comparação oculta</p>
          <div className="mt-4 flex h-[9rem] items-center justify-center rounded-[var(--radius-inset)] bg-surface-2">
            <p className="text-[0.9375rem] text-faint">Valores ocultos</p>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-[1.25rem] leading-tight font-bold text-fg">{WEEKDAYS_LONG[top]} é o seu dia mais caro</p>
          <p className="mt-1 text-[0.875rem] text-faint">
            <Money value={averages[top]} className="text-dim" /> em média, contra <Money value={othersAverage} /> nos outros dias.
          </p>
          <div aria-hidden="true" className="mt-4 flex h-[9rem] items-end gap-2">
            {averages.map((average, i) => (
              <span key={WEEKDAYS_SHORT[i]} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="relative w-full flex-1">
                  <span
                    className={`scale-y absolute inset-x-0 bottom-0 mx-auto h-full max-w-8 rounded-t-[4px] ${i === top ? 'bg-fg' : 'bg-white/25'}`}
                    style={{
                      // Dia com algum gasto nunca some de vez (ver Sparkline).
                      transform: `scaleY(${revealed ? (average > 0 ? Math.max(average / max, 0.04) : 0) : 0})`,
                      transitionDelay: `${100 + i * 40}ms`,
                    }}
                  />
                </span>
                <span className={`text-[0.75rem] leading-none ${i === top ? 'font-semibold text-fg' : 'text-faint'}`}>
                  {WEEKDAYS_SHORT[i]}
                </span>
              </span>
            ))}
          </div>
          <ol className="sr-only">
            {averages.map((average, i) => (
              <li key={WEEKDAYS_LONG[i]}>
                {WEEKDAYS_LONG[i]}: {formatCurrency(average)} em média
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
