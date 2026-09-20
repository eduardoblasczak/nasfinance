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

/*
 * Os campos de data continuam sendo <input type="date"> nativos, e nao um
 * calendario proprio.
 *
 * O plano previa trocá-los por um painel customizado, mas o nativo ganha onde
 * mais importa aqui: no iPhone ele abre a roda de data do proprio sistema, que
 * e mais rapida e mais acessivel do que qualquer calendario que eu desenhasse
 * — e este app e usado no celular. O problema real nunca foi o controle ser
 * nativo; era ter 17px de altura. Isso da para corrigir sem abrir mao dele.
 */
export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  // 44px: o confortavel para toque. O minimo da WCAG 2.2 e 24px, que os chips
  // ja cumpriam — mas cumprir o minimo num app que se usa com o polegar, em
  // movimento, saindo do caixa, nao e o alvo certo.
  const control =
    'min-h-11 border px-4 font-mono text-2xs transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]'

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
            className={`${control} ${
              selected
                ? 'border-accent/50 bg-accent/12 text-accent'
                : 'border-border text-dim hover:border-faint hover:text-fg'
            }`}
          >
            {option.label}
          </button>
        )
      })}

      <div className="ml-1 flex min-h-11 items-center gap-2 border border-border px-3">
        {/* h-full faz o input ocupar toda a altura do container: a area
            clicavel passa a ser os 44px inteiros, nao so a linha do texto. */}
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(event) => onChange({ ...value, from: event.target.value, label: 'Personalizado' })}
          aria-label="Data inicial"
          className="h-11 bg-transparent font-mono text-2xs text-dim outline-none focus-visible:text-fg"
        />
        <span className="font-mono text-2xs text-faint">→</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          onChange={(event) => onChange({ ...value, to: event.target.value, label: 'Personalizado' })}
          aria-label="Data final"
          className="h-11 bg-transparent font-mono text-2xs text-dim outline-none focus-visible:text-fg"
        />
      </div>
    </div>
  )
}

export function currentMonthPeriod(): Period {
  return presets()[0]
}
