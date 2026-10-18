import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { Money } from './ui/Money'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { formatCompactCurrency, formatDayLabel, formatDayMonth } from '@/lib/format'
import type { DailyPoint } from '@/types'

interface SpendingTrendChartProps {
  series: DailyPoint[]
}

const ACCENT = '#25d98a'
const GRID = 'rgba(255,255,255,0.07)'
// Tinta dos eixos = token faint (#8a8a8a, 6,08:1). O #565656 anterior
// reprovava contraste em qualquer tamanho.
const AXIS_INK = '#8a8a8a'
const UI_FONT = '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif'

/**
 * Evolução do gasto acumulado no período.
 *
 * FORMA: área, porque a variável é o tempo e o que interessa é a inclinação —
 * quão rápido o dinheiro está saindo. SÉRIE ÚNICA, de propósito: dois eixos Y
 * com escalas diferentes fazem o cruzamento das linhas parecer significativo
 * quando ele só depende de como cada eixo foi escalado.
 *
 * Este arquivo é o único que importa o Recharts, e a Visão geral o carrega
 * sob demanda: são ~360 kB que o resto do app não precisa esperar.
 *
 * Com os valores ocultos, a curva não aparece: a forma dela já conta em
 * que dias o dinheiro saiu e quanto, em proporção. Fica um estado discreto
 * da mesma altura, para nada pular ao alternar o olho.
 */
export default function SpendingTrendChart({ series }: SpendingTrendChartProps) {
  const { hidden } = useMoneyVisibility()
  const hasMovement = series.some((point) => point.cumulativeExpense > 0)

  if (hidden) {
    return (
      <div className="flex h-[13rem] items-center justify-center">
        <p className="text-[0.9375rem] text-faint">Valores ocultos</p>
      </div>
    )
  }

  if (!hasMovement) {
    return (
      <div className="flex h-[13rem] items-center justify-center">
        <p className="text-[0.9375rem] text-faint">Nenhuma despesa neste período.</p>
      </div>
    )
  }

  // Com muitos dias, rotular todos empilharia texto ilegível no eixo.
  const tickInterval = Math.max(Math.floor(series.length / 6), 0)

  return (
    <div className="h-[13rem]">
      <ResponsiveContainer width="100%" height="100%">
        {/* 20 px à esquerda: o rótulo do primeiro dia é centrado no ponto
            da borda, e com margem zero metade dele saía do card ("/10"). */}
        <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 20 }}>
          <defs>
            <linearGradient id="accumFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.2} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Grade só horizontal: linhas verticais competiriam com a leitura
              da inclinação, que é a informação principal. */}
          <CartesianGrid stroke={GRID} vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={formatDayMonth}
            interval={tickInterval}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS_INK, fontSize: 12, fontFamily: UI_FONT }}
            minTickGap={12}
          />

          <YAxis
            tickFormatter={formatCompactCurrency}
            tickLine={false}
            axisLine={false}
            orientation="right"
            tick={{ fill: AXIS_INK, fontSize: 12, fontFamily: UI_FONT }}
            width={64}
          />

          <Tooltip
            cursor={{ stroke: AXIS_INK, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as DailyPoint
              return (
                <ChartTooltip
                  title={formatDayLabel(point.date)}
                  rows={[
                    { label: 'Acumulado', value: <Money value={point.cumulativeExpense} />, color: ACCENT },
                    { label: 'Gasto no dia', value: <Money value={point.expense} /> },
                    ...(point.income > 0 ? [{ label: 'Entrada no dia', value: <Money value={point.income} /> }] : []),
                  ]}
                />
              )
            }}
          />

          <Area
            type="monotone"
            dataKey="cumulativeExpense"
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#accumFill)"
            isAnimationActive={false}
            // Ponto só no hover: um marcador por dia viraria ruído.
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#000000' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
