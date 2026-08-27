import { useTilt } from '@/hooks/useTilt'
import { formatCurrency, formatPercent } from '@/lib/format'

interface StatTileProps {
  label: string
  value: number
  /** Passe `false` para exibir contagem em vez de moeda. */
  currency?: boolean
  deltaPct?: number | null
  /**
   * Define o que uma alta significa. Em despesa, subir é ruim; em receita e
   * saldo, subir é bom. Sem isso, o indicador pintaria "gastei 40% a mais"
   * de verde.
   */
  higherIsBetter?: boolean
  hint?: string
}

/**
 * Número de destaque com variação.
 *
 * Sem gráfico: para um valor único o próprio número é a melhor
 * visualização — um gráfico de uma barra só não acrescenta nada.
 *
 * A variação usa seta + sinal, nunca só cor: quem não distingue vermelho de
 * verde precisa da direção explícita.
 */
export function StatTile({
  label,
  value,
  currency = true,
  deltaPct,
  higherIsBetter = false,
  hint,
}: StatTileProps) {
  const tiltRef = useTilt<HTMLDivElement>()

  const hasDelta = deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct)
  const isFlat = hasDelta && Math.abs(deltaPct) < 0.05
  const isUp = hasDelta && deltaPct > 0
  const isGood = isFlat ? null : isUp === higherIsBetter

  const deltaColor = isFlat ? 'text-faint' : isGood ? 'text-accent' : 'text-negative'

  return (
    <div ref={tiltRef} className="tilt bg-void px-7 py-8">
      <div className="tilt-inner">
        <div className="eyebrow">{label}</div>

        <p className="mt-5 font-mono text-3xl font-light tracking-tight text-fg tabular">
          {currency ? formatCurrency(value) : value.toLocaleString('pt-BR')}
        </p>

        <div className="mt-3 flex min-h-5 items-center gap-2 text-xs">
          {hasDelta ? (
            <>
              <span className={`font-mono ${deltaColor} tabular`}>
                {isFlat ? '→' : isUp ? '↑' : '↓'} {formatPercent(deltaPct)}
              </span>
              <span className="text-faint">vs. anterior</span>
            </>
          ) : (
            <span className="text-faint">{hint ?? '—'}</span>
          )}
        </div>
      </div>
    </div>
  )
}
