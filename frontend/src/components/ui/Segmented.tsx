interface SegmentedProps<T extends string> {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
  className?: string
}

/**
 * Controle segmentado do iOS: poucas opções exclusivas, todas à vista.
 *
 * Cada segmento é um botão com aria-pressed, não um radio escondido: o
 * leitor de tela anuncia "Despesas, botão, selecionado", que é o que a
 * pessoa precisa ouvir.
 */
export function Segmented<T extends string>({ value, options, onChange, label, className = '' }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={`inline-flex rounded-full bg-surface-2 p-0.5 ${className}`}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`press min-h-11 min-w-11 flex-1 rounded-full px-4 text-[0.9375rem] whitespace-nowrap ${
              selected ? 'bg-white/14 font-semibold text-fg' : 'font-medium text-dim hover:text-fg'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
