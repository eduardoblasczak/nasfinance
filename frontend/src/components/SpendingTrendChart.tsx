import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader } from './ui/Card'
import { ChartTooltip } from './ChartTooltip'
import { formatCompactCurrency, formatCurrency, formatDate, formatDayMonth } from '@/lib/format'
import type { DailyPoint } from '@/types'

interface SpendingTrendChartProps {
  series: DailyPoint[]
}

const ACCENT = '#25d98a'
const GRID = '#2e2e2e'
const AXIS_INK = '#565656'

/**
 * Evolução do gasto acumulado no período.
 *
 * FORMA: área, porque a variável é o tempo e o que interessa é a inclinação —
 * quão rápido o dinheiro está saindo. Uma barra por dia responderia "quanto
 * gastei na terça", pergunta menos útil e já respondida pela lista.
 *
 * SÉRIE ÚNICA, de propósito. A tentação seria sobrepor receita, ou plotar o
 * gasto diário num segundo eixo Y. Dois eixos Y com escalas diferentes fazem
 * o cruzamento das linhas parecer significativo quando ele só depende de como
 * cada eixo foi escalado — o erro mais comum em dashboards. Com uma série só
 * não há legenda: o título já a nomeia.
 *
 * Esta é a única visualização que ainda usa biblioteca de gráficos: a camada
 * de hover com crosshair e tooltip posicionado é justamente o que compensa a
 * dependência.
 */
export function SpendingTrendChart({ series }: SpendingTrendChartProps) {
  const hasMovement = series.some((point) => point.cumulativeExpense > 0)

  if (!hasMovement) {
    return (
      <Card className="h-full">
        <CardHeader title="gasto acumulado" />
        <div className="flex h-64 items-center justify-center px-7 pb-7">
          <p className="text-sm text-faint">Nenhuma despesa neste período.</p>
        </div>
      </Card>
    )
  }

  const total = series.at(-1)?.cumulativeExpense ?? 0
  // Com muitos dias, rotular todos empilharia texto ilegível no eixo.
  const tickInterval = Math.max(Math.floor(series.length / 8), 0)

  return (
    <Card className="h-full">
      <CardHeader
        title="gasto acumulado"
        subtitle={`Ritmo de saída — ${formatCurrency(total)} no período`}
      />

      <div className="px-4 pb-7">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={series} margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="accumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Grade só horizontal: linhas verticais competiriam com a leitura
                da inclinação, que é a informação principal. */}
            <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={formatDayMonth}
              interval={tickInterval}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: 'Mono, monospace' }}
              minTickGap={8}
            />

            <YAxis
              tickFormatter={formatCompactCurrency}
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: 'Mono, monospace' }}
              width={58}
            />

            <Tooltip
              cursor={{ stroke: AXIS_INK, strokeWidth: 1, strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as DailyPoint
                return (
                  <ChartTooltip
                    title={formatDate(point.date)}
                    rows={[
                      {
                        label: 'Acumulado',
                        value: formatCurrency(point.cumulativeExpense),
                        color: ACCENT,
                      },
                      { label: 'Gasto no dia', value: formatCurrency(point.expense) },
                      ...(point.income > 0
                        ? [{ label: 'Entrada no dia', value: formatCurrency(point.income) }]
                        : []),
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
              // Ponto só no hover: um marcador por dia viraria ruído num
              // período de 30 dias.
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#000000' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
