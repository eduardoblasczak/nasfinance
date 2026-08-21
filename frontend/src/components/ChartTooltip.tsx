import type { ReactNode } from 'react'

interface ChartTooltipProps {
  title: string
  rows: Array<{ label: string; value: string; color?: string }>
  footer?: ReactNode
}

/**
 * Tooltip compartilhado por todos os graficos.
 *
 * Um so componente mantem tipografia, espacamento e superficie identicos entre
 * os graficos — inconsistencia entre tooltips e das coisas que mais denunciam
 * um dashboard montado por partes.
 *
 * Os valores usam figuras tabulares para nao "dancar" quando o ponteiro se move
 * entre pontos com numeros de larguras diferentes.
 */
export function ChartTooltip({ title, rows, footer }: ChartTooltipProps) {
  return (
    <div className="pointer-events-none rounded-lg border border-hairline bg-overlay px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-ink">{title}</p>

      <div className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            {row.color && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
            )}
            <span className="text-ink-muted">{row.label}</span>
            <span className="ml-auto font-medium text-ink tabular">{row.value}</span>
          </div>
        ))}
      </div>

      {footer && <div className="mt-1.5 border-t border-hairline pt-1.5 text-xs text-ink-muted">{footer}</div>}
    </div>
  )
}
