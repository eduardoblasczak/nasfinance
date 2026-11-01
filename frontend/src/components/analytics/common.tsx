import type { ReactNode } from 'react'
import { Segmented } from '@/components/ui/Segmented'
import { Money } from '@/components/ui/Money'
import { ChevronDownIcon } from '@/components/ui/icons'
import { card, secondaryButton } from '@/components/ui/styles'
import { useCountUp } from '@/hooks/useMotion'
import { formatMonthLong, todayIsoInSaoPaulo } from '@/lib/format'

/**
 * Peças repetidas das três seções de Análises. Ficam aqui, e não em `ui/`,
 * porque só fazem sentido nesta tela: cabeçalho com linha de apoio, estado de
 * erro com "Tentar de novo", número que conta e o seletor de mês.
 */

/**
 * Título curto + uma linha que diz o que o gráfico compara. É um h3: as
 * seções moram dentro dos grupos da página ("Este mês", "Hábitos"...), que
 * são os h2 — quem navega por títulos no leitor de tela ouve a mesma
 * hierarquia que vê.
 */
export function SectionHeader({ id, title, support, children }: { id: string; title: string; support: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 px-1">
      <h3 id={id} className="text-[1.25rem] font-bold tracking-[-0.01em] text-fg">
        {title}
      </h3>
      {/* Altura mínima de duas linhas no celular: a frase muda quando os
          dados chegam ("até o dia 18"), e o resto da seção não pode pular. */}
      <p className="mt-1 min-h-[2.75rem] text-[0.9375rem] leading-snug text-dim sm:min-h-0">{support}</p>
      {children && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>}
    </div>
  )
}

/** Erro de uma seção só: as outras duas continuam funcionando. */
export function SectionError({ what, error, onRetry }: { what: string; error: string | null; onRetry: () => void }) {
  return (
    <div role="alert" className={`${card} px-6 py-8 text-center`}>
      <p className="text-[1.0625rem] font-semibold text-fg">{what} não carregou</p>
      <p className="mx-auto mt-2 max-w-[22rem] text-[0.9375rem] text-dim">{error ?? 'O servidor não respondeu.'}</p>
      <button type="button" onClick={onRetry} className={`${secondaryButton} mt-5`}>
        Tentar de novo
      </button>
    </div>
  )
}

/**
 * Valor que conta até o número na entrada e anda até o novo quando o filtro
 * muda. O leitor de tela ouve só o valor final, fora da animação.
 */
export function CountUpMoney({
  value,
  active,
  sign = 'none',
  className = '',
}: {
  value: number
  active: boolean
  /** `auto`: sinal e cor pelo próprio valor (sobra que pode ser negativa). */
  sign?: 'none' | 'auto'
  className?: string
}) {
  const shown = useCountUp(value, active)
  const signOf = (amount: number) => (sign === 'auto' ? (amount < 0 ? '-' : amount > 0 ? '+' : 'none') : 'none')
  return (
    <span className={className}>
      <span className="sr-only">
        <Money value={value} sign={signOf(value)} negative={sign === 'auto' && value < 0} />
      </span>
      <span aria-hidden="true">
        <Money value={shown} sign={signOf(shown)} negative={sign === 'auto' && shown < 0} />
      </span>
    </span>
  )
}

/** Mês corrente em São Paulo, `YYYY-MM`: é ele que a API chama de "hoje". */
export function currentMonth(): string {
  return todayIsoInSaoPaulo().slice(0, 7)
}

/** `YYYY-MM` deslocado `delta` meses. */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  const index = year * 12 + (mon - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/**
 * Mês como cápsula com menu nativo, o mesmo desenho do seletor de período da
 * Visão geral: no iPhone abre a roda do sistema. Só meses até o corrente — a
 * API recusa mês futuro, e oferecer um para depois dar erro seria pior.
 */
/** Quantos meses o seletor oferece, do corrente para trás. */
export const MONTH_OPTIONS = 24

export function MonthSelect({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const now = currentMonth()
  const options = Array.from({ length: MONTH_OPTIONS }, (_, index) => shiftMonth(now, -index))
  const label = (month: string) => (month === now ? 'Este mês' : formatMonthLong(month))

  return (
    <label className="press relative inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 pr-3 pl-4 text-fg hover:bg-white/12 has-[select:focus-visible]:outline-1 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent">
      <span className="text-[0.9375rem] font-semibold whitespace-nowrap">{label(value)}</span>
      <ChevronDownIcon className="size-4 text-dim" />
      <select
        value={value}
        aria-label="Mês analisado"
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full text-base opacity-0"
      >
        {options.map((month) => (
          <option key={month} value={month}>
            {label(month)}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Variação contra a média, para despesa: subir é ruim. Seta, sinal e cor
 * juntos — "↑ 38%" diz sozinho, o vermelho só reforça.
 */
export function deltaTone(pct: number): { arrow: string; tone: string; text: string } {
  const rounded = Math.round(pct)
  if (Math.abs(pct) < 5) return { arrow: '→', tone: 'text-faint', text: `${Math.abs(rounded)}%` }
  return pct > 0
    ? { arrow: '↑', tone: 'text-negative', text: `${rounded}%` }
    : { arrow: '↓', tone: 'text-accent', text: `${Math.abs(rounded)}%` }
}

/**
 * Esqueleto com a altura e o desenho do conteúdo — rótulo, número grande e
 * linhas —, para nada saltar quando os dados chegam e a forma já dizer o que
 * vem ali.
 */
export function Skeleton({ className, rows = 4 }: { className: string; rows?: number }) {
  const bar = 'rounded-md bg-surface-2'
  return (
    <div aria-hidden="true" className={`animate-pulse overflow-hidden rounded-[var(--radius-card)] bg-surface px-5 py-5 ${className}`}>
      <div className={`${bar} h-4 w-32`} />
      <div className={`${bar} mt-2 h-9 w-48`} />
      <div className="mt-6 space-y-5">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index}>
            <div className="flex justify-between gap-6">
              <div className={`${bar} h-4 w-2/5`} />
              <div className={`${bar} h-4 w-20`} />
            </div>
            <div className={`${bar} mt-2.5 h-1.5 w-full`} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * "Últimos [1 | 3 | 6 | 12] meses": a janela das seções da leva 2. As
 * palavras ficam fora do controle (aria-hidden) e o rótulo do grupo diz o
 * mesmo para o leitor de tela, como no seletor do fluxo de caixa.
 */
export function WindowPicker({
  value,
  options,
  onChange,
  label,
}: {
  value: number
  options: readonly number[]
  onChange: (months: number) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-2 text-[0.9375rem] text-dim">
      <span aria-hidden="true">Últimos</span>
      <Segmented
        label={label}
        value={String(value)}
        options={options.map((months) => ({ value: String(months), label: String(months) }))}
        onChange={(next) => onChange(Number(next))}
      />
      <span aria-hidden="true">meses</span>
    </div>
  )
}

/** Falhou ao trocar o filtro, mas a leitura anterior continua na tela. */
export function StaleNotice({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mb-3 rounded-[var(--radius-inset)] bg-negative/12 px-4 py-3 text-[0.9375rem] text-fg">
      Não deu para atualizar; os números abaixo são da leitura anterior. {error}
    </p>
  )
}

/** Vazio com explicação e, quando houver, o próximo passo. */
export function EmptyCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${card} px-6 py-10 text-center`}>
      <p className="text-[1.0625rem] font-semibold text-fg">{title}</p>
      <p className="mx-auto mt-2 max-w-[24rem] text-[0.9375rem] text-dim">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * A janela por extenso nas frases de apoio. A janela da leva 2 conta o mês
 * corrente (ver ANALYTICS.md), então "1" é este mês, não o anterior.
 */
export function monthsLabel(months: number): string {
  return months === 1 ? 'neste mês' : `nos últimos ${months} meses`
}

/**
 * Fatia de um todo, sem sinal ("12%", "4,5%"). O `formatPercent` da casa põe
 * "+" na frente, que aqui leria como variação. Uma casa decimal só abaixo de
 * 10%, onde ela muda a leitura.
 */
export function formatShare(pct: number): string {
  if (pct > 0 && pct < 1) return '<1%'
  return pct < 10 ? `${pct.toFixed(1).replace('.', ',').replace(',0', '')}%` : `${Math.round(pct)}%`
}
