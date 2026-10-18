export interface ToastMessage {
  /** Muda a cada aviso, para a animação de entrada rodar de novo. */
  key: number
  text: string
  tone?: 'neutral' | 'error'
  /** Presente quando a ação ainda pode ser desfeita. */
  onUndo?: () => void
}

interface ToastProps {
  toast: ToastMessage | null
}

/**
 * Aviso flutuante acima da navegação.
 *
 * A região `aria-live` fica sempre montada — é só o conteúdo que entra e
 * sai. Se ela nascesse junto com a mensagem, o leitor de tela não anunciaria.
 *
 * Fica acima da tab bar no celular (na zona do polegar, onde o Desfazer é
 * alcançável) e no rodapé do conteúdo no desktop.
 */
export function Toast({ toast }: ToastProps) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 font-ui bottom-[calc(max(12px,env(safe-area-inset-bottom))+76px)] z-40 flex justify-center px-4 md:bottom-6 md:pl-60"
    >
      {toast && (
        <div
          key={toast.key}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className="chrome toast-in pointer-events-auto flex min-h-12 w-full max-w-[26rem] items-center gap-3 rounded-[1.5rem] py-1.5 pr-1.5 pl-5"
        >
          <p className={`min-w-0 flex-1 text-[0.9375rem] ${toast.tone === 'error' ? 'text-negative' : 'text-fg'}`}>
            {toast.text}
          </p>
          {toast.onUndo && (
            <button
              type="button"
              onClick={toast.onUndo}
              className="press min-h-11 shrink-0 rounded-full px-4 text-[0.9375rem] font-semibold text-accent hover:bg-white/8"
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
