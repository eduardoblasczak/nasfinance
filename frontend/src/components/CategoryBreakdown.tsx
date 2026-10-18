import { Money } from './ui/Money'
import type { CategorySlice } from '@/types'

interface CategoryBreakdownProps {
  slices: CategorySlice[]
  topN?: number
}

const OTHER_COLOR = 'var(--color-faint)'

/**
 * Gastos por categoria.
 *
 * FORMA: barras, não pizza. A tarefa é comparar magnitudes ("em que gastei
 * mais?"), e comprimento é a codificação mais precisa para isso. Desenhado à
 * mão, sem biblioteca: são retângulos com largura proporcional.
 *
 * Cada linha diz também quanto do teto já foi — é a pergunta que vem logo
 * depois de "em que gastei". Acima de 100%, a porcentagem muda de cor E
 * ganha a palavra "acima", para não depender só do vermelho.
 */
export function CategoryBreakdown({ slices, topN = 6 }: CategoryBreakdownProps) {
  const sorted = [...slices].sort((a, b) => b.total - a.total)
  const head = sorted.slice(0, topN)
  const tail = sorted.slice(topN)

  const data = [...head]
  if (tail.length > 0) {
    // A cauda vira uma barra só: uma dezena de categorias de R$ 3 ocuparia
    // metade da altura e as cores começariam a se repetir.
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
    return <p className="px-4 py-10 text-center text-[0.9375rem] text-faint">Nenhuma despesa neste período.</p>
  }

  const max = Math.max(...data.map((slice) => slice.total))

  return (
    <ul className="divide-y divide-separator">
      {data.map((slice) => {
        const over = slice.budgetUsedPct !== null && slice.budgetUsedPct > 100
        return (
          <li key={slice.categoryName} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-fg">{slice.categoryName}</span>
              <Money value={slice.total} className="shrink-0 text-[0.9375rem] font-semibold" />
            </div>
            <div className="mt-2 ml-[1.375rem] flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="grow-x h-full rounded-full"
                  style={{ width: `${(slice.total / max) * 100}%`, backgroundColor: slice.color }}
                />
              </div>
              {slice.budgetUsedPct !== null && (
                <span className={`shrink-0 text-[0.8125rem] tabular ${over ? 'font-semibold text-negative' : 'text-faint'}`}>
                  {over ? `${Math.round(slice.budgetUsedPct - 100)}% acima do teto` : `${Math.round(slice.budgetUsedPct)}% do teto`}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
