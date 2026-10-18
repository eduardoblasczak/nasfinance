import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastMessage } from '@/components/ui/Toast'

const DEFAULT_MS = 3000

/**
 * Estado de um aviso por vez. Um aviso novo substitui o anterior em vez de
 * empilhar: três toasts na zona do polegar cobririam a tab bar.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback(
    (message: Omit<ToastMessage, 'key'>, duration = DEFAULT_MS) => {
      window.clearTimeout(timer.current)
      const undo = message.onUndo
      // Desfazer roda uma vez só e fecha o aviso no mesmo toque. Sem isto,
      // o toast continuava na tela depois do toque, e um toque duplo
      // disparava a compensação duas vezes (desarquivar, arquivar de novo;
      // revincular duas vezes, com a segunda falhando por duplicidade).
      let used = false
      const onUndo = undo
        ? () => {
            if (used) return
            used = true
            clear()
            undo()
          }
        : undefined
      setToast({ ...message, onUndo, key: Date.now() })
      timer.current = window.setTimeout(() => setToast(null), duration)
    },
    [clear],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { toast, show, clear }
}
