/**
 * Movimento do lado do script: o que o CSS sozinho não faz (número que
 * conta, traço que se desenha medindo o próprio comprimento).
 *
 * As durações e a curva são as da landing (`demo/landing/src/motion.ts`),
 * para app e página pública se moverem do mesmo jeito. A curva é lida do
 * `index.css`, para existir num lugar só.
 *
 * Por que isto precisa checar `prefers-reduced-motion` por conta própria: a
 * regra global do `index.css` zera animação e transição de CSS, mas não
 * alcança a Web Animations API nem um laço de `requestAnimationFrame`.
 */

export const MOTION = { fast: 150, base: 220, slow: 400, flight: 600 } as const

const FALLBACK_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const reducedQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

/** Consultado a cada uso: a preferência pode mudar com a tela aberta. */
export const reducedMotion = (): boolean => reducedQuery?.matches ?? false

let easeCache = ''
export function ease(): string {
  if (!easeCache && typeof document !== 'undefined') {
    easeCache = getComputedStyle(document.documentElement).getPropertyValue('--ease-out-expo').trim()
  }
  return easeCache || FALLBACK_EASE
}

/**
 * A mesma curva como função, para o que é desenhado quadro a quadro. Resolve
 * x(t) = x por bisseção: 24 passos sobram para um número na tela.
 */
function curve(): (x: number) => number {
  const parts = ease().match(/cubic-bezier\(([^)]+)\)/)?.[1].split(',').map(Number)
  const [x1, y1, x2, y2] = parts?.length === 4 && parts.every(Number.isFinite) ? parts : [0.22, 1, 0.36, 1]
  const bezier = (a: number, b: number, t: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let low = 0
    let high = 1
    let t = x
    for (let i = 0; i < 24; i++) {
      t = (low + high) / 2
      if (bezier(x1, x2, t) < x) low = t
      else high = t
    }
    return bezier(y1, y2, t)
  }
}

/**
 * Leva um número de `from` a `to` com a curva da casa, chamando `frame` a
 * cada quadro. Com movimento reduzido vai direto ao valor final. Devolve
 * quem cancela, para uma atualização nova não brigar com a anterior.
 */
export function tween(from: number, to: number, duration: number, frame: (value: number) => void): () => void {
  if (reducedMotion() || from === to) {
    frame(to)
    return () => {}
  }
  const shape = curve()
  const start = performance.now()
  let handle = 0
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    frame(progress === 1 ? to : from + (to - from) * shape(progress))
    if (progress < 1) handle = requestAnimationFrame(step)
  }
  handle = requestAnimationFrame(step)
  return () => cancelAnimationFrame(handle)
}
