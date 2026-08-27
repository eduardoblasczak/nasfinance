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

/**
 * Presets calculados no momento do clique, não na carga do módulo — uma aba
 * deixada aberta durante a virada do mês continuaria oferecendo o mês errado.
 */
function presets(): Period[] {
  const now = new Date()
  const daysAgo = (days: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() - days)
    return date
  }

  return [
    {
      label: 'Este mês',
      from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    },
    {
      label: 'Mês passado',
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    },
    { label: 'Últimos 30 dias', from: iso(daysAgo(29)), to: iso(now) },
    { label: 'Últimos 90 dias', from: iso(daysAgo(89)), to: iso(now) },
  ]
}

export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets().map((option) => {
        const selected = option.from === value.from && option.to === value.to

        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={selected}
            className={`border px-4 py-2 font-mono text-[11px] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              selected
                ? 'border-accent/50 bg-accent/12 text-accent'
                : 'border-ghost text-dim hover:border-faint hover:text-fg'
            }`}
          >
            {option.label}
          </button>
        )
      })}

      <div className="ml-1 flex items-center gap-2 border border-ghost px-3 py-1.5">
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(event) => onChange({ ...value, from: event.target.value, label: 'Personalizado' })}
          aria-label="Data inicial"
          className="bg-transparent font-mono text-[11px] text-dim outline-none"
        />
        <span className="font-mono text-[11px] text-faint">→</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          onChange={(event) => onChange({ ...value, to: event.target.value, label: 'Personalizado' })}
          aria-label="Data final"
          className="bg-transparent font-mono text-[11px] text-dim outline-none"
        />
      </div>
    </div>
  )
}

export function currentMonthPeriod(): Period {
  return presets()[0]
}
