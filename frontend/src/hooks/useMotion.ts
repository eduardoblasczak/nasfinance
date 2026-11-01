import { useCallback, useEffect, useRef, useState } from 'react'
import { MOTION, reducedMotion, tween } from '@/lib/motion'

/**
 * Vira `true` uma vez, quando o elemento entra na tela.
 *
 * Gráfico que se desenha abaixo da dobra, enquanto ninguém olha, gasta a
 * animação à toa: quem rola até ele encontra tudo parado. Por isso a entrada
 * espera o elemento aparecer — como na landing.
 *
 * Ref por callback, e não `useRef`: o elemento só existe depois que os dados
 * chegam, e um efeito preso ao primeiro render nunca o veria. Com movimento
 * reduzido já começa revelado: o valor final, sem espera.
 */
export function useReveal<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null)
  const [shown, setShown] = useState(reducedMotion)

  useEffect(() => {
    if (shown || !node) return
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      // Um pouco antes da borda de baixo: a animação começa quando o gráfico
      // já está à vista, não quando um pixel dele aparece.
      { rootMargin: '0px 0px -12% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, shown])

  const ref = useCallback((element: T | null) => setNode(element), [])
  return [ref, shown]
}

/**
 * Número que conta até o valor (na entrada) ou anda até o novo (quando o
 * filtro muda). Parado em 0 até `active`, para contar à vista de quem olha.
 *
 * O valor final vai sempre para o leitor de tela por fora (ver `CountUpMoney`):
 * quem ouve não precisa de animação, e um número no meio do caminho seria
 * informação errada.
 */
export function useCountUp(target: number, active: boolean, duration: number = MOTION.flight): number {
  const [value, setValue] = useState(() => (active && reducedMotion() ? target : 0))
  const shown = useRef(value)

  useEffect(() => {
    if (!active) return
    return tween(shown.current, target, duration, (next) => {
      shown.current = next
      setValue(next)
    })
  }, [target, active, duration])

  return value
}

/** Largura do elemento, acompanhando giro de tela e redimensionamento. */
export function useWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!node) return
    setWidth(node.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  const ref = useCallback((element: T | null) => setNode(element), [])
  return [ref, width]
}
