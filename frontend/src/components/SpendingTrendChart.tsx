import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader } from './ui/Card'
import { ChartTooltip } from './ChartTooltip'
import { formatCompactCurrency, formatCurrency, formatDate, formatDayMonth } from '@/lib/format'
import type { DailyPoint } from '@/types'

interface SpendingTrendChartProps {
  series: DailyPoint[]
}

const SERIES_COLOR = '#3987e5'

/**
 * Evolucao do gasto acumulado ao longo do periodo.
 *
 * FORMA: linha/area, porque a variavel e o tempo e o que interessa e a
 * inclinacao — quao rapido o dinheiro esta saindo. Uma barra por dia
 * responderia "quanto gastei na terca", pergunta menos util no dia a dia e ja
 * respondida pela lista de lancamentos.
 *
 * SERIE UNICA, de proposito. A tentacao seria sobrepor receita e despesa
 * acumuladas, ou pior, plotar o gasto diario num segundo eixo Y. Dois eixos Y
 * com escalas diferentes deixam o cruzamento das linhas parecer significativo
 * quando ele so depende de como cada eixo foi escalado — o erro mais comum em
 * dashboards. Com uma serie so, nao ha legenda: o titulo ja a nomeia.
 */
export function SpendingTrendChart({ series }: SpendingTrendChartProps) {
  const hasMovement = series.some((point) => point.cumulativeExpense > 0)

  if (!hasMovement) {
    return (
      <Card className="h-full">
        <CardHeader title="Gasto acumulado" />
        <div className="flex h-56 items-center justify-center px-5 pb-5">
          <p className="text-sm text-ink-muted">Nenhuma despesa registrada neste periodo.</p>
        </div>
      </Card>
    )
  }

  const total = series.at(-1)?.cumulativeExpense ?? 0

  // Com muitos dias, rotular todos empilharia texto ilegivel no eixo.
  const tickInterval = Math.max(Math.floor(series.length / 8), 0)

  return (
    <Card className="h-full">
      <CardHeader
        title="Gasto acumulado"
        subtitle={`Soma progressiva das despesas — total de ${formatCurrency(total)}`}
      />

      <div className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={series} margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Grade discreta e apenas horizontal: linhas verticais competiriam
                com a leitura da inclinacao, que e a informacao principal. */}
            <CartesianGrid stroke="#2c2c2a" strokeDasharray="0" vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={formatDayMonth}
              interval={tickInterval}
              tickLine={false}
              axisLine={{ stroke: '#383835' }}
              tick={{ fill: '#898781', fontSize: 11 }}
              minTickGap={8}
            />

            <YAxis
              tickFormatter={formatCompactCurrency}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#898781', fontSize: 11 }}
              width={58}
            />

            <Tooltip
              cursor={{ stroke: '#898781', strokeWidth: 1, strokeDasharray: '3 3' }}
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
                        color: SERIES_COLOR,
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
              stroke={SERIES_COLOR}
              strokeWidth={2}
              fill="url(#expenseFill)"
              isAnimationActive={false}
              // Ponto so aparece no hover: um marcador por dia viraria ruido
              // num periodo de 30 dias.
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#161618' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
