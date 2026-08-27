import { useEffect, useRef } from 'react'

/**
 * Inclina o elemento no espaço 3D seguindo o ponteiro.
 *
 * A referência visual rejeita sombras para sugerir elevação — a profundidade
 * precisa vir de perspectiva real. Este hook gira o elemento em torno dos
 * eixos X e Y conforme a posição do mouse dentro dele.
 *
 * O listener é único e global, não um por cartão: com um `mousemove` por
 * elemento, três cartões na tela significam três handlers disparando a cada
 * pixel de movimento. Um só handler percorrendo os elementos registrados
 * custa muito menos.
 *
 * @param maxDegrees rotação máxima nas bordas; acima de ~10 o texto começa
 *                   a distorcer visivelmente
 */
export function useTilt<T extends HTMLElement>(maxDegrees = 7) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Quem pediu menos movimento não recebe inclinação nenhuma.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const onMove = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect()
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (!inside) {
        element.style.transform = 'perspective(900px)'
        return
      }

      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)

      element.style.transform =
        `perspective(900px) rotateY(${(dx * maxDegrees).toFixed(2)}deg) ` +
        `rotateX(${(-dy * maxDegrees).toFixed(2)}deg)`
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [maxDegrees])

  return ref
}
