import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/format'

interface StatTileProps {
  label: string
  value: number
  /** Variacao percentual contra o periodo anterior. `null` = sem base de comparacao. */
  deltaPct?: number | null
  /**
   * Define o que uma alta significa. Em despesa, subir e ruim; em receita e
   * saldo, subir e bom. Sem isso, o indicador pintaria "gastei 40% a mais"
   * de verde.
   */
  higherIsBetter?: boolean
  /** Linha de apoio: o numero bruto por tras da variacao. */
  hint?: string
}

/**
 * Numero de destaque com variacao.
 *
 * Sem grafico: para um valor unico, o proprio numero e a melhor visualizacao —
 * um grafico de uma barra so nao acrescenta nada.
 *
 * A variacao usa icone + texto, nunca so cor: quem nao distingue vermelho de
 * verde precisa da seta e do sinal para entender a direcao.
 */
export function StatTile({
  label,
  value,
  deltaPct,
  higherIsBetter = false,
  hint,
}: StatTileProps) {
  const hasDelta = deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct)
  const isFlat = hasDelta && Math.abs(deltaPct) < 0.05
  const isUp = hasDelta && deltaPct > 0

  const isGood = isFlat ? null : isUp === higherIsBetter
  const deltaColor = isFlat
    ? 'text-ink-muted'
    : isGood
      ? 'text-good'
      : 'text-critical'

  const DeltaIcon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown

  return (
    <div className="rounded-xl border border-hairline bg-surface px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>

      <p className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
        {formatCurrency(value)}
      </p>

      <div className="mt-2 flex min-h-5 items-center gap-1.5 text-xs">
        {hasDelta ? (
          <>
            <DeltaIcon className={`size-3.5 shrink-0 ${deltaColor}`} aria-hidden="true" />
            <span className={`font-medium tabular ${deltaColor}`}>
              {formatPercent(deltaPct)}
            </span>
            <span className="text-ink-muted">vs. periodo anterior</span>
          </>
        ) : (
          <span className="text-ink-muted">{hint ?? 'Sem base de comparacao'}</span>
        )}
      </div>
    </div>
  )
}
