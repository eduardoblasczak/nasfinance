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

  const show = useCallback((message: Omit<ToastMessage, 'key'>, duration = DEFAULT_MS) => {
    window.clearTimeout(timer.current)
    setToast({ ...message, key: Date.now() })
    timer.current = window.setTimeout(() => setToast(null), duration)
  }, [])

  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    setToast(null)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { toast, show, clear }
}
