import { Card, CardHeader } from './ui/Card'
import { formatCurrency } from '@/lib/format'
import type { CategorySlice } from '@/types'

interface CategoryBarChartProps {
  slices: CategorySlice[]
  /** Índice destacado; a constelação reage ao mesmo valor. */
  highlight: number | null
  onHighlight: (index: number | null) => void
  topN?: number
}

const OTHER_COLOR = '#898781'

/**
 * Gastos por categoria.
 *
 * FORMA: barras, não pizza. A tarefa é comparar magnitudes ("em que gastei
 * mais?"), e comprimento é a codificação visual mais precisa para isso —
 * ângulo e área, usadas na pizza, estão entre as menos precisas. Barras
 * horizontais ainda acomodam o nome por extenso, sem legenda separada.
 *
 * Desenhado à mão em vez de com biblioteca de gráficos: são retângulos com
 * largura proporcional. Uma dependência de gráfico aqui só acrescentaria
 * peso ao bundle — que trafega pelo túnel a partir de um servidor em WiFi.
 *
 * Clicar destaca a categoria na constelação ao fundo, ligando o dado ao
 * elemento visual da marca.
 */
export function CategoryBarChart({
  slices,
  highlight,
  onHighlight,
  topN = 8,
}: CategoryBarChartProps) {
  const sorted = [...slices].sort((a, b) => b.total - a.total)
  const head = sorted.slice(0, topN)
  const tail = sorted.slice(topN)

  const data = [...head]
  if (tail.length > 0) {
    // A cauda vira uma barra só. Sem esse corte, uma dezena de categorias de
    // R$ 3,00 ocuparia metade da altura e as cores começariam a se repetir.
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
        <CardHeader title="por categoria" />
        <p className="px-7 pb-10 text-sm text-faint">Nenhuma despesa neste período.</p>
      </Card>
    )
  }

  const max = Math.max(...data.map((slice) => slice.total))

  return (
    <Card className="h-full">
      <CardHeader
        title="por categoria"
        subtitle="Clique para destacar na constelação"
      />

      <div className="flex flex-col gap-4 px-7 pb-7">
        {data.map((slice, index) => {
          const active = highlight === index
          const dimmed = highlight !== null && !active

          return (
            <button
              key={slice.categoryName}
              type="button"
              onClick={() => onHighlight(active ? null : index)}
              aria-pressed={active}
              className="group block w-full text-left transition-opacity duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ opacity: dimmed ? 0.35 : 1 }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="truncate text-xs text-fg">{slice.categoryName}</span>
                <span className="shrink-0 font-mono text-[11px] text-dim tabular">
                  {formatCurrency(slice.total)}
                </span>
              </div>

              <div className="h-[3px] w-full bg-ghost">
                <div
                  className="grow-x h-full"
                  style={{
                    width: `${(slice.total / max) * 100}%`,
                    backgroundColor: slice.color,
                  }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
