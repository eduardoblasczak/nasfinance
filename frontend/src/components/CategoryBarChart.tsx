import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader } from './ui/Card'
import { ChartTooltip } from './ChartTooltip'
import { formatCompactCurrency, formatCurrency } from '@/lib/format'
import type { CategorySlice } from '@/types'

interface CategoryBarChartProps {
  slices: CategorySlice[]
  /** Quantas categorias mostrar antes de agrupar o restante em "Outras". */
  topN?: number
}

const OTHER_COLOR = '#898781'

/**
 * Gastos por categoria.
 *
 * FORMA: barras horizontais, nao pizza. A tarefa aqui e comparar magnitudes
 * ("em que eu gastei mais?"), e comprimento e a codificacao visual mais
 * precisa que existe para isso — angulo e area, usadas na pizza, estao entre
 * as menos precisas. Barras horizontais ainda acomodam nomes de categoria por
 * extenso, sem rotulo girado nem legenda separada.
 *
 * As categorias alem da N-esima viram uma barra "Outras". Sem esse corte, uma
 * cauda de categorias de R$ 3,00 ocuparia metade da altura do grafico e as
 * cores comecariam a se repetir sem necessidade.
 */
export function CategoryBarChart({ slices, topN = 8 }: CategoryBarChartProps) {
  const sorted = [...slices].sort((a, b) => b.total - a.total)
  const head = sorted.slice(0, topN)
  const tail = sorted.slice(topN)

  const data = [...head]
  if (tail.length > 0) {
    data.push({
      categoryId: null,
      categoryName: `Outras (${tail.length})`,
      color: OTHER_COLOR,
      icon: null,
      total: tail.reduce((sum, slice) => sum + slice.total, 0),
      budget: null,
      budgetUsedPct: null,
      transactionCount: tail.reduce((sum, slice) => sum + slice.transactionCount, 0),
    })
  }

  if (data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader title="Gastos por categoria" />
        <EmptyState message="Nenhuma despesa registrada neste periodo." />
      </Card>
    )
  }

  // Altura proporcional ao numero de barras: um grafico de altura fixa deixaria
  // 3 barras espremidas no topo ou 9 barras se sobrepondo.
  const chartHeight = Math.max(data.length * 38 + 16, 140)

  return (
    <Card className="h-full">
      <CardHeader
        title="Gastos por categoria"
        subtitle={`${sorted.length} categoria(s) com movimento no periodo`}
      />

      <div className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 64, bottom: 0, left: 8 }}
            barCategoryGap={6}
          >
            <XAxis type="number" hide />

            <YAxis
              type="category"
              dataKey="categoryName"
              width={128}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#c3c2b7', fontSize: 12 }}
            />

            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const slice = payload[0].payload as CategorySlice
                return (
                  <ChartTooltip
                    title={slice.categoryName}
                    rows={[
                      { label: 'Total', value: formatCurrency(slice.total), color: slice.color },
                      { label: 'Lancamentos', value: String(slice.transactionCount) },
                    ]}
                    footer={
                      slice.budgetUsedPct !== null && slice.budget !== null
                        ? `${slice.budgetUsedPct.toFixed(0)}% do orcamento de ${formatCompactCurrency(slice.budget)}`
                        : undefined
                    }
                  />
                )
              }}
            />

            {/* Cantos arredondados apenas na ponta do dado; a base fica reta,
                ancorada no eixo. Arredondar os dois lados desalinha o inicio
                das barras e atrapalha a comparacao. */}
            <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
              {data.map((slice) => (
                <Cell key={slice.categoryName} fill={slice.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Rotulos diretos em texto, ao lado do grafico: garantem que o valor
            esteja disponivel sem depender de passar o mouse — o que nao existe
            no celular. */}
        <ul className="mt-1 space-y-1 px-3">
          {data.map((slice) => (
            <li
              key={slice.categoryName}
              className="flex items-center gap-2 text-xs text-ink-muted"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden="true"
              />
              <span className="truncate">{slice.categoryName}</span>
              <span className="ml-auto shrink-0 font-medium text-ink-soft tabular">
                {formatCurrency(slice.total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center px-5 pb-5">
      <p className="text-center text-sm text-ink-muted">{message}</p>
    </div>
  )
}
