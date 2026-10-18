import { useEffect, useState } from 'react'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { field } from './styles'

interface MoneyInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  /** Muda a cada abertura do formulário: o valor volta a ficar oculto. */
  resetKey: unknown
  placeholder?: string
  describedBy?: string
}

/**
 * Campo de valor que respeita o "ocultar valores".
 *
 * Oculto, mostra "R$ ••••" até a pessoa tocar no campo — focar é o gesto
 * explícito de quem vai digitar, e quem digita já está olhando o número.
 * Campo vazio não tem o que esconder e aparece normal, com o placeholder.
 * 16 px no texto (via `field`) para o Safari não dar zoom ao focar.
 */
export function MoneyInput({ id, value, onChange, resetKey, placeholder, describedBy }: MoneyInputProps) {
  const { hidden } = useMoneyVisibility()
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setRevealed(false)
  }, [resetKey])

  const masked = hidden && !revealed && value.trim() !== ''

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={masked ? 'R$ ••••' : value}
      readOnly={masked}
      onFocus={() => setRevealed(true)}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-describedby={describedBy}
      className={`${field} tabular`}
    />
  )
}
