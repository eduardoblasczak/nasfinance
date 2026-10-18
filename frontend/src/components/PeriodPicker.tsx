import { ChevronDownIcon } from './ui/icons'

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

const CUSTOM = 'Personalizado'

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

/**
 * Período como uma cápsula com menu, e não quatro chips enfileirados.
 *
 * Os chips ocupavam uma linha inteira no celular para uma escolha que se faz
 * uma vez por visita. O menu é o <select> nativo, que no iPhone abre a roda do
 * sistema. "Personalizado" revela as duas datas — também nativas, pelo mesmo
 * motivo: a roda de data do iOS é mais rápida que qualquer calendário daqui.
 */
export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const options = presets()
  const current = options.find((option) => option.from === value.from && option.to === value.to)
  // O rótulo decide, não só as datas: escolher "Personalizado" começa com as
  // datas do preset atual, e sem isto o menu voltaria sozinho para ele.
  const selected = value.label === CUSTOM ? CUSTOM : (current?.label ?? CUSTOM)

  const dateClass =
    'min-h-11 rounded-full bg-surface-2 px-3.5 text-base text-fg tabular outline-none focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent [color-scheme:dark]'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="press relative inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 pr-3 pl-4 text-fg hover:bg-white/12 has-[select:focus-visible]:outline-1 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent">
        <span className="text-[0.9375rem] font-semibold whitespace-nowrap">{selected}</span>
        <ChevronDownIcon className="size-4 text-dim" />
        <select
          value={selected}
          aria-label="Período"
          onChange={(event) => {
            const preset = options.find((option) => option.label === event.target.value)
            onChange(preset ?? { ...value, label: CUSTOM })
          }}
          className="absolute inset-0 cursor-pointer appearance-none rounded-full text-base opacity-0"
        >
          {options.map((option) => (
            <option key={option.label} value={option.label}>
              {option.label}
            </option>
          ))}
          <option value={CUSTOM}>{CUSTOM}…</option>
        </select>
      </label>

      {selected === CUSTOM && (
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.from}
            max={value.to}
            onChange={(event) => onChange({ ...value, from: event.target.value, label: CUSTOM })}
            aria-label="Data inicial"
            className={dateClass}
          />
          <span className="text-faint" aria-hidden="true">
            –
          </span>
          <input
            type="date"
            value={value.to}
            min={value.from}
            onChange={(event) => onChange({ ...value, to: event.target.value, label: CUSTOM })}
            aria-label="Data final"
            className={dateClass}
          />
        </span>
      )}
    </div>
  )
}

export function currentMonthPeriod(): Period {
  return presets()[0]
}
