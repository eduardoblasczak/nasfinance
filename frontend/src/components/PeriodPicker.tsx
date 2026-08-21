import { Check } from 'lucide-react'

export interface Period {
  from: string
  to: string
  label: string
}

interface PeriodPickerProps {
  value: Period
  onChange: (period: Period) => void
}

function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Presets calculados no momento do clique, nao no carregamento do modulo —
 *  uma aba aberta durante a virada do mes continuaria oferecendo o mes errado. */
function presets(): Period[] {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

  const daysAgo = (days: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() - days)
    return date
  }

  return [
    { label: 'Este mes', from: iso(startOfMonth), to: iso(endOfMonth) },
    { label: 'Mes passado', from: iso(startOfLastMonth), to: iso(endOfLastMonth) },
    { label: 'Ultimos 30 dias', from: iso(daysAgo(29)), to: iso(now) },
    { label: 'Ultimos 90 dias', from: iso(daysAgo(89)), to: iso(now) },
  ]
}

/** Seletor de periodo: presets numa linha, mais intervalo personalizado. */
export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const options = presets()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => {
        const selected = option.from === value.from && option.to === value.to

        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={selected}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              selected
                ? 'border-series-1 bg-series-1/12 text-ink'
                : 'border-hairline bg-surface text-ink-muted hover:bg-raised hover:text-ink-soft'
            }`}
          >
            {/* Selecao marcada por icone, nao apenas por cor de fundo */}
            {selected && <Check className="size-3.5" aria-hidden="true" />}
            {option.label}
          </button>
        )
      })}

      <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-1">
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(event) =>
            onChange({ ...value, from: event.target.value, label: 'Personalizado' })
          }
          aria-label="Data inicial"
          className="bg-transparent text-xs text-ink-soft outline-none"
        />
        <span className="text-xs text-ink-muted">ate</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          onChange={(event) =>
            onChange({ ...value, to: event.target.value, label: 'Personalizado' })
          }
          aria-label="Data final"
          className="bg-transparent text-xs text-ink-soft outline-none"
        />
      </div>
    </div>
  )
}

/** Periodo inicial da aplicacao: mes corrente. */
export function currentMonthPeriod(): Period {
  return presets()[0]
}
