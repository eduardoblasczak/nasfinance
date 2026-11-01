import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Money } from '@/components/ui/Money'
import { Segmented } from '@/components/ui/Segmented'
import { card } from '@/components/ui/styles'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { useReveal, useWidth } from '@/hooks/useMotion'
import { useResource } from '@/hooks/useResource'
import { getCashflow } from '@/lib/api'
import { formatCompactCurrency, formatCurrency, formatMonthLong, formatMonthShort } from '@/lib/format'
import { MOTION, ease, reducedMotion } from '@/lib/motion'
import type { Cashflow, CashflowMonth } from '@/types'
import { CountUpMoney, SectionError, SectionHeader, Skeleton } from './common'

const RANGES = [
  { value: '6', label: '6' },
  { value: '12', label: '12' },
  { value: '24', label: '24' },
] as const

interface Props {
  months: number
  onMonthsChange: (months: number) => void
}

/**
 * Entrou × saiu, mês a mês, com a linha do que sobrou.
 *
 * FORMA: barras lado a lado para entrada e saída (comparar duas magnitudes no
 * mesmo mês) e uma linha para a sobra, na MESMA escala — a sobra é a
 * diferença entre as duas barras, e um segundo eixo faria o cruzamento
 * parecer significativo quando ele só dependeria da escala escolhida.
 *
 * Desenhado à mão em SVG, sem o Recharts: são retângulos e um caminho, e à
 * mão dá para ter o que a biblioteca não dá — a linha que se desenha com a
 * curva da casa, o cursor por toque, mouse e teclado (role="slider"), e
 * nenhum dos ~360 kB do chunk de gráficos nesta tela.
 */
export function CashflowSection({ months, onMonthsChange }: Props) {
  const titleId = useId()
  const { data, loading, refreshing, error, reload } = useResource(String(months), () => getCashflow({ months }))

  return (
    <section aria-labelledby={titleId}>
      <SectionHeader
        id={titleId}
        title={`${data?.months.length ?? months} meses: entrou × saiu`}
        support="Quanto entrou e saiu em cada mês, e a linha do que sobrou."
      >
        <div className="flex items-center gap-2 text-[0.9375rem] text-dim">
          <span aria-hidden="true">Últimos</span>
          <Segmented
            label="Quantos meses mostrar"
            value={String(months) as '6' | '12' | '24'}
            options={RANGES}
            onChange={(value) => onMonthsChange(Number(value))}
          />
          <span aria-hidden="true">meses</span>
        </div>
      </SectionHeader>

      {loading ? (
        <Skeleton className="h-[30rem]" rows={3} />
      ) : !data ? (
        <SectionError what="O fluxo de caixa" error={error} onRetry={reload} />
      ) : (
        <div aria-busy={refreshing} className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
          {error && (
            <p role="alert" className="mb-3 rounded-[var(--radius-inset)] bg-negative/12 px-4 py-3 text-[0.9375rem] text-fg">
              Não deu para atualizar; os números abaixo são da leitura anterior. {error}
            </p>
          )}
          {/* A chave pelo tamanho zera o cursor ao trocar 12 → 24: o índice
              escolhido apontaria para outro mês. */}
          <CashflowBody key={data.months.length} data={data} />
        </div>
      )}
    </section>
  )
}

function CashflowBody({ data }: { data: Cashflow }) {
  const { hidden } = useMoneyVisibility()
  const [ref, revealed] = useReveal<HTMLDivElement>()
  const [picked, setPicked] = useState<number | null>(null)
  const summaryId = useId()

  const months = data.months
  // Sem escolha, o cursor fica no mês mais recente: é o que se quer ver primeiro.
  const index = picked === null ? months.length - 1 : Math.min(picked, months.length - 1)
  const current = months[index]
  const closed = months.filter((month) => !month.partial).length
  const empty = months.every((month) => month.income === 0 && month.expense === 0)

  if (empty) {
    return (
      <div className={`${card} px-6 py-10 text-center`}>
        <p className="text-[1.0625rem] font-semibold text-fg">Nenhuma entrada ou saída no período</p>
        <p className="mx-auto mt-2 max-w-[24rem] text-[0.9375rem] text-dim">
          Os meses aparecem aqui conforme os lançamentos chegam — pelo Atalho do iPhone, pela sincronização ou à mão.
        </p>
      </div>
    )
  }

  const valueText = (month: CashflowMonth) =>
    hidden
      ? `${formatMonthLong(month.month)}${month.partial ? ', em andamento' : ''}: valores ocultos`
      : `${formatMonthLong(month.month)}${month.partial ? ', em andamento' : ''}: entrou ${formatCurrency(month.income)}, saiu ${formatCurrency(month.expense)}, ${month.net < 0 ? `faltou ${formatCurrency(-month.net)}` : `sobrou ${formatCurrency(month.net)}`}`

  return (
    <div ref={ref} className={`${card} px-5 pt-5 pb-4`}>
      <p className="text-[0.9375rem] text-dim">Sobra média por mês</p>
      {data.averageNet === null ? (
        <p className="mt-1 text-[1.25rem] font-semibold text-faint">Ainda sem mês fechado</p>
      ) : (
        <CountUpMoney
          value={data.averageNet}
          active={revealed}
          sign="auto"
          className="mt-1 block text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg"
        />
      )}
      <p className="mt-1 text-[0.875rem] text-faint">
        {closed > 0 ? `Nos ${closed} meses fechados; o mês atual fica de fora.` : 'A média começa no primeiro mês fechado.'}
      </p>

      <Legend hidden={hidden} />

      <p id={summaryId} className="sr-only">
        {hidden
          ? 'Gráfico oculto junto com os valores.'
          : `Em ${months.length} meses, entrou ${formatCurrency(data.totalIncome)} e saiu ${formatCurrency(data.totalExpense)}. Use as setas para percorrer os meses.`}
      </p>

      {hidden ? (
        // A forma das barras já conta quanto entra e sai em proporção: com os
        // valores ocultos, o gráfico sai inteiro, na mesma altura.
        <div className="mt-3 flex h-[13rem] items-center justify-center rounded-[var(--radius-inset)] bg-surface-2">
          <p className="text-[0.9375rem] text-faint">Valores ocultos</p>
        </div>
      ) : (
        <CashflowChart
          months={months}
          index={index}
          onSelect={setPicked}
          revealed={revealed}
          interacting={picked !== null}
          describedBy={summaryId}
          valueText={valueText(current)}
        />
      )}

      <Readout month={current} />
    </div>
  )
}

function Legend({ hidden }: { hidden: boolean }) {
  if (hidden) return null
  return (
    <div aria-hidden="true" className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-faint">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-accent" />
        Entrou
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-faint" />
        Saiu
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 16 10" className="h-2.5 w-4">
          <path d="M1 7 L8 3 L15 5" className="fill-none stroke-fg" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Sobra
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 10 10" className="size-2.5 rounded-[3px]">
          <rect width="10" height="10" className="fill-white/10" />
          <path d="M-2 4 L4 -2 M-2 10 L10 -2 M4 12 L12 4" className="stroke-dim" strokeWidth="1.6" />
        </svg>
        Em andamento
      </span>
    </div>
  )
}

/** O mês sob o cursor, em três linhas: o que o gráfico mostra, em número. */
function Readout({ month }: { month: CashflowMonth }) {
  const { hidden } = useMoneyVisibility()
  // Oculto, o rótulo também fica neutro: "Faltou" já contaria que o mês
  // fechou no vermelho.
  const netLabel = hidden ? 'Saldo do mês' : month.net < 0 ? 'Faltou' : 'Sobrou'
  return (
    <div className="mt-3 rounded-[var(--radius-inset)] bg-surface-2 px-4 py-3">
      <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-fg">
        {formatMonthLong(month.month)}
        {month.partial && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.75rem] font-medium text-dim">em andamento</span>
        )}
      </p>
      <dl className="mt-2 space-y-1 text-[0.9375rem]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-faint">Entrou</dt>
          <dd>
            <Money value={month.income} sign="+" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-faint">Saiu</dt>
          <dd>
            <Money value={month.expense} sign="-" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-separator pt-1">
          <dt className="text-faint">{netLabel}</dt>
          <dd className="font-semibold">
            <Money value={month.net} sign={month.net < 0 ? '-' : 'none'} negative={month.net < 0} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

// ============================================================ gráfico

const HEIGHT = 208
const PAD_TOP = 12
const PAD_BOTTOM = 24
/** Coluna dos rótulos de valor, à direita (como no Ritmo de gasto). */
const AXIS = 60

/** Passo "redondo" (1, 2, 2,5, 5 × 10ⁿ): rótulo de eixo em R$ 2,5 mil, nunca R$ 2.347. */
function niceStep(range: number, count: number): number {
  const raw = range / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

interface ChartProps {
  months: CashflowMonth[]
  index: number
  onSelect: (index: number) => void
  revealed: boolean
  /** A pessoa já escolheu um mês: os outros esmaecem para o escolhido saltar. */
  interacting: boolean
  describedBy: string
  valueText: string
}

function CashflowChart({ months, index, onSelect, revealed, interacting, describedBy, valueText }: ChartProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const lineRef = useRef<SVGPathElement>(null)
  const patternId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const count = months.length
  // Muda quando os números mudam, não quando a largura muda: girar o celular
  // redesenha o gráfico no lugar, sem repetir a entrada.
  const dataKey = months.map((month) => `${month.month}:${month.income}:${month.expense}`).join('|')

  // ---- escala ----
  const top = Math.max(1, ...months.flatMap((month) => [month.income, month.expense, month.net]))
  const bottom = Math.min(0, ...months.map((month) => month.net))
  const step = niceStep(top - bottom, 3)
  const domainTop = Math.ceil(top / step) * step
  const domainBottom = Math.floor(bottom / step) * step
  const ticks: number[] = []
  for (let value = domainBottom; value <= domainTop + step / 2; value += step) ticks.push(value)

  const plotWidth = Math.max(width - AXIS, 0)
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const band = count > 0 ? plotWidth / count : 0
  const y = (value: number) => PAD_TOP + ((domainTop - value) / (domainTop - domainBottom)) * plotHeight
  const groupWidth = Math.min(band * 0.68, 30)
  const gap = band > 16 ? 2 : 1
  const barWidth = Math.max((groupWidth - gap) / 2, 1)
  const center = (i: number) => i * band + band / 2
  const zero = y(0)

  // Um rótulo de mês a cada ~44 px, contado a partir do mais recente, que
  // nunca perde o dele.
  const labelEvery = Math.max(1, Math.ceil((count * 44) / Math.max(plotWidth, 1)))

  // ---- linha da sobra ----
  const points = months.map((month, i) => ({ x: center(i), y: y(month.net), partial: month.partial }))
  const solid = points.filter((point) => !point.partial)
  const solidPath = solid.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join('')
  const lastSolid = solid[solid.length - 1]
  const partialPoint = points.find((point) => point.partial)
  const dashedPath = lastSolid && partialPoint ? `M${lastSolid.x.toFixed(1)} ${lastSolid.y.toFixed(1)}L${partialPoint.x.toFixed(1)} ${partialPoint.y.toFixed(1)}` : ''

  // A linha se desenha (stroke-dashoffset) depois que as barras sobem. O
  // tracejado do comprimento total existe só durante a animação: fixo, ele
  // cortaria a linha ao redimensionar.
  const drawable = width > 0
  useLayoutEffect(() => {
    const path = lineRef.current
    if (!revealed || !drawable || !path || reducedMotion() || typeof path.animate !== 'function') return
    const length = path.getTotalLength()
    const animation = path.animate(
      [
        { strokeDasharray: `${length}`, strokeDashoffset: length },
        { strokeDasharray: `${length}`, strokeDashoffset: 0 },
      ],
      { duration: MOTION.flight + 300, delay: 250, easing: ease(), fill: 'backwards' },
    )
    return () => animation.cancel()
  }, [revealed, drawable, dataKey])

  // ---- cursor: toque, mouse e teclado ----
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    if (band === 0) return
    const left = event.currentTarget.getBoundingClientRect().left
    onSelect(Math.max(0, Math.min(count - 1, Math.floor((event.clientX - left) / band))))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      Home: 0,
      End: count - 1,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    onSelect(Math.max(0, Math.min(count - 1, moves[event.key])))
  }

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Mês no gráfico de entradas e saídas"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={index}
      aria-valuetext={valueText}
      aria-describedby={describedBy}
      onPointerDown={pick}
      // Mouse acompanha sem clicar; no toque, só com o dedo na tela.
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse' || event.buttons > 0) pick(event)
      }}
      onKeyDown={onKeyDown}
      // pan-y: arrastar na horizontal escolhe o mês, na vertical continua
      // rolando a página. Sem isso, o celular trataria todo toque como rolagem.
      className="relative mt-3 h-[13rem] cursor-crosshair touch-pan-y rounded-[var(--radius-inset)] select-none"
    >
      {drawable && (
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true" className="block overflow-visible">
          <defs>
            <pattern id={`${patternId}-in`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="4" className="fill-accent" />
            </pattern>
            <pattern id={`${patternId}-out`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="4" className="fill-faint" />
            </pattern>
          </defs>

          {/* Grade só horizontal; o zero mais forte, porque a sobra pode
              passar para baixo dele. */}
          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={0}
                x2={plotWidth}
                y1={y(value)}
                y2={y(value)}
                className={value === 0 ? 'stroke-white/25' : 'stroke-separator'}
                strokeWidth={1}
              />
              <text x={width} y={y(value) + 4} textAnchor="end" className="fill-faint text-[12px]">
                {value === 0 ? 'R$ 0' : formatCompactCurrency(value)}
              </text>
            </g>
          ))}

          {/* Faixa do mês escolhido, atrás das barras. */}
          {/* Anda por transform (e não pelo atributo x, que não transiciona). */}
          <rect
            x={1}
            y={PAD_TOP - 6}
            width={Math.max(band - 2, 0)}
            height={plotHeight + 12}
            rx={6}
            className="fill-white/[0.06] transition-transform duration-150"
            style={{ transform: `translateX(${index * band}px)` }}
          />

          {revealed && (
            <g key={dataKey}>
              {months.map((month, i) => {
                const x0 = center(i) - groupWidth / 2
                const dim = interacting && i !== index
                const delay = `${i * Math.min(35, 420 / count)}ms`
                return (
                  <g key={month.month} className="transition-opacity duration-150" opacity={dim ? 0.45 : 1}>
                    <rect
                      x={x0}
                      y={y(month.income)}
                      width={barWidth}
                      height={Math.max(zero - y(month.income), 0)}
                      rx={Math.min(2, barWidth / 2)}
                      className={`grow-y ${month.partial ? 'stroke-accent' : 'fill-accent'}`}
                      fill={month.partial ? `url(#${patternId}-in)` : undefined}
                      strokeWidth={month.partial ? 1 : 0}
                      style={{ animationDelay: delay }}
                    />
                    <rect
                      x={x0 + barWidth + gap}
                      y={y(month.expense)}
                      width={barWidth}
                      height={Math.max(zero - y(month.expense), 0)}
                      rx={Math.min(2, barWidth / 2)}
                      className={`grow-y ${month.partial ? 'stroke-faint' : 'fill-faint'}`}
                      fill={month.partial ? `url(#${patternId}-out)` : undefined}
                      strokeWidth={month.partial ? 1 : 0}
                      style={{ animationDelay: delay }}
                    />
                  </g>
                )
              })}

              <path
                ref={lineRef}
                d={solidPath}
                className="fill-none stroke-fg"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {dashedPath && (
                <path
                  d={dashedPath}
                  className="fade-in fill-none stroke-fg"
                  strokeWidth={2}
                  strokeDasharray="3 4"
                  strokeLinecap="round"
                  style={{ animationDelay: `${MOTION.flight + 450}ms` }}
                />
              )}
              {points.map((point, i) => {
                const negative = months[i].net < 0
                const chosen = i === index
                return (
                  <circle
                    key={months[i].month}
                    cx={point.x}
                    cy={point.y}
                    r={chosen ? 5 : 3}
                    strokeWidth={2}
                    className={`fade-in stroke-void ${negative ? 'fill-negative' : 'fill-fg'}`}
                    style={{ animationDelay: `${MOTION.flight + 250}ms` }}
                  />
                )
              })}
            </g>
          )}

          {months.map((month, i) => {
            if ((count - 1 - i) % labelEvery !== 0) return null
            return (
              <text
                key={month.month}
                x={center(i)}
                y={HEIGHT - 4}
                textAnchor="middle"
                className={`text-[12px] ${i === index ? 'fill-fg font-semibold' : 'fill-faint'}`}
              >
                {formatMonthShort(month.month).replace('.', '')}
              </text>
            )
          })}
        </svg>
      )}
    </div>
  )
}
