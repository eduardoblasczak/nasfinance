import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from './icons'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Painel que sobe de baixo no celular e vira um diálogo centrado no desktop.
 *
 * No celular, o modal centrado obriga o polegar a subir até o meio da tela e
 * esconde o contexto inteiro; a sheet cresce de onde o polegar já está e
 * deixa o topo da tela à vista.
 *
 * Continua sendo o `<dialog>` nativo: foco preso dentro, Esc fecha e a
 * camada de fundo vem pronta — comportamentos que uma div com position:fixed
 * exigiria reimplementar, e que quase sempre saem incompletos.
 *
 * O corpo é sólido, não vidro: aqui dentro há formulário e texto para ler.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // O showModal foca o primeiro controle — o X de fechar. Quem quiser
      // outro ponto de partida marca com data-autofocus (o autoFocus do
      // React só roda na montagem, e a sheet fica montada fechada).
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Tocar fora (no fundo escurecido) fecha, como no iOS. O alvo do clique
      // só é o próprio <dialog> quando o toque cai no backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      aria-label={title}
      className="sheet font-ui text-fg"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 px-5 pt-3 pb-2">
          <h2 className="text-[1.0625rem] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="press -mr-2 flex size-11 items-center justify-center rounded-full text-dim hover:bg-surface-2 hover:text-fg"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </dialog>
  )
}
