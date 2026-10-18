import type { ReactNode } from 'react'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { EyeIcon, EyeOffIcon } from './icons'

interface PageHeaderProps {
  title: string
  /** A resposta da tela numa linha — o que se lê antes de rolar. */
  summary?: ReactNode
  /** Ação principal da tela (ex.: novo lançamento), ao lado do olho. */
  action?: ReactNode
}

/**
 * Título grande no topo da tela, como no iOS: diz onde você está sem uma
 * barra fixa ocupando altura. O olho mora aqui, ao lado do título, porque é
 * o primeiro lugar onde o polegar e o olhar chegam ao abrir a tela.
 */
export function PageHeader({ title, summary, action }: PageHeaderProps) {
  const { hidden, toggle } = useMoneyVisibility()

  return (
    <header className="flex items-start justify-between gap-4 pt-4 pb-6 md:pt-12 md:pb-8">
      <div className="min-w-0">
        <h1 className="text-[2.125rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg">{title}</h1>
        {summary && <div className="mt-2 text-[1.0625rem] leading-snug text-dim">{summary}</div>}
      </div>
      <div className="mt-0.5 flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
          title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
          className="press flex size-11 items-center justify-center rounded-full bg-surface-2 text-dim hover:text-fg"
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        {action}
      </div>
    </header>
  )
}
