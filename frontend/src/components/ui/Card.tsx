import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

/**
 * Painel: uma hairline sobre o vazio.
 *
 * Sem sombra e sem fundo elevado — a hierarquia vem do contraste com o preto
 * absoluto. Simular elevação com `box-shadow` quebraria a linguagem.
 */
export function Card({ children, className = '' }: CardProps) {
  return <section className={`panel ${className}`}>{children}</section>
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 px-7 pt-7 pb-6">
      <div className="min-w-0">
        <h2 className="eyebrow">{title}</h2>
        {subtitle && <p className="mt-2 text-xs text-faint">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
