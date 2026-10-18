import { formatCurrency } from '@/lib/format'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'

interface MoneyProps {
  /** Valor sempre positivo: a direção vem de `sign`, nunca do sinal do número. */
  value: number
  /** `-` despesa, `+` receita, `none` sem direção (saldo, total neutro). */
  sign?: '-' | '+' | 'none'
  className?: string
}

/**
 * Um valor em reais, do jeito que todo valor da interface deve aparecer.
 *
 * Direção por sinal E cor juntos: cor sozinha some para quem não distingue
 * verde de vermelho e numa tela com brilho baixo. Os centavos ficam menores
 * mas nunca somem — R$ 1.234 e R$ 1.234,90 não são o mesmo número.
 *
 * Com valores ocultos, vira "R$ ••••" de largura fixa: o comprimento do
 * número também é informação.
 */
export function Money({ value, sign = 'none', className = '' }: MoneyProps) {
  const { hidden } = useMoneyVisibility()
  const tone = sign === '+' ? 'text-accent' : ''

  if (hidden) {
    return (
      <span className={`tabular whitespace-nowrap ${tone} ${className}`}>
        <span className="sr-only">valor oculto</span>
        <span aria-hidden="true">{sign === 'none' ? '' : `${sign === '-' ? '−' : '+'} `}R$ ••••</span>
      </span>
    )
  }

  const formatted = formatCurrency(Math.abs(value))
  const comma = formatted.lastIndexOf(',')
  const whole = comma >= 0 ? formatted.slice(0, comma) : formatted
  const cents = comma >= 0 ? formatted.slice(comma) : ''
  // U+2212 (sinal de menos de verdade), não o hífen: tem a largura do "+",
  // e a coluna de valores não dança entre despesa e receita.
  const prefix = sign === '-' ? '− ' : sign === '+' ? '+ ' : ''

  return (
    <span className={`tabular whitespace-nowrap ${tone} ${className}`}>
      {prefix}
      {whole}
      <span className="text-[0.82em]">{cents}</span>
    </span>
  )
}
