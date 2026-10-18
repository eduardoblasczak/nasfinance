import type { ReactNode } from 'react'

interface ChartTooltipProps {
  title: string
  rows: Array<{ label: string; value: ReactNode; color?: string }>
}

/**
 * Tooltip dos gráficos.
 *
 * Um só componente mantém tipografia, espaçamento e superfície idênticos —
 * inconsistência entre tooltips é das coisas que mais denunciam um dashboard
 * montado por partes. Flutua sobre o gráfico, então usa o material das
 * barras; os valores têm figuras tabulares para não "dançar" com o ponteiro.
 */
export function ChartTooltip({ title, rows }: ChartTooltipProps) {
  return (
    <div className="chrome pointer-events-none rounded-[var(--radius-inset)] px-3.5 py-2.5 font-ui">
      <p className="text-[0.8125rem] font-semibold text-dim">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 text-[0.875rem]">
            {row.color && (
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
            )}
            <span className="text-faint">{row.label}</span>
            <span className="ml-auto font-semibold text-fg tabular">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
