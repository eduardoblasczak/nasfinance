import { formatCurrency } from '@/lib/format'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'

interface MoneyProps {
  /** Valor sempre positivo: a direção vem de `sign`, nunca do sinal do número. */
  value: number
  /** `-` despesa, `+` receita, `none` sem direção (saldo, total neutro). */
  sign?: '-' | '+' | 'none'
  /**
   * Pinta de vermelho (saldo negativo). Vem por prop, e não por className,
   * para o Money poder tirar a cor quando os valores estão ocultos.
   */
  negative?: boolean
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
export function Money({ value, sign = 'none', negative = false, className = '' }: MoneyProps) {
  const { hidden } = useMoneyVisibility()

  // Oculto é oculto por inteiro: sem sinal e sem cor. "− R$ ••••" em
  // vermelho já conta que o saldo está negativo, e um "+" verde conta que
  // entrou dinheiro — exatamente o que quem está do lado não deveria saber.
  if (hidden) {
    return (
      <span className={`tabular whitespace-nowrap ${className}`}>
        <span className="sr-only">valor oculto</span>
        <span aria-hidden="true">R$ ••••</span>
      </span>
    )
  }

  const tone = negative ? 'text-negative' : sign === '+' ? 'text-accent' : ''

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
