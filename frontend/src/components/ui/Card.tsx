import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

/** Superficie base: todo bloco de conteudo do app se apoia nela. */
export function Card({ children, className = '' }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-hairline bg-surface ${className}`}
    >
      {children}
    </section>
  )
}

interface CardHeaderProps {
  title: string
  /** Texto de apoio: explica o que o bloco mostra, sem repetir o titulo. */
  subtitle?: string
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
