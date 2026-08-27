import type { ReactNode } from 'react'

interface ChartTooltipProps {
  title: string
  rows: Array<{ label: string; value: string; color?: string }>
  footer?: ReactNode
}

/**
 * Tooltip compartilhado pelos gráficos.
 *
 * Um só componente mantém tipografia, espaçamento e superfície idênticos —
 * inconsistência entre tooltips é das coisas que mais denunciam um dashboard
 * montado por partes.
 *
 * Os valores usam figuras tabulares para não "dançar" quando o ponteiro se
 * move entre pontos com números de larguras diferentes.
 */
export function ChartTooltip({ title, rows, footer }: ChartTooltipProps) {
  return (
    <div className="pointer-events-none border border-ghost bg-void px-4 py-3">
      <p className="eyebrow">{title}</p>

      <div className="mt-2.5 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 text-xs">
            {row.color && (
              <span
                className="size-1.5 shrink-0"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
            )}
            <span className="text-faint">{row.label}</span>
            <span className="ml-auto font-mono text-fg tabular">{row.value}</span>
          </div>
        ))}
      </div>

      {footer && <div className="mt-2.5 border-t border-ghost pt-2.5 text-xs text-faint">{footer}</div>}
    </div>
  )
}
