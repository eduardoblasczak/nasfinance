/**
 * O sistema de movimento da landing, do lado do script.
 *
 * As durações repetem as do landing.css (--motion-*). A curva é lida do
 * próprio CSS, para existir num lugar só. Toda animação daqui mexe só em
 * transform e opacity, e nenhuma roda com prefers-reduced-motion: a regra
 * global do index.css desliga as de CSS, mas não alcança a Web Animations API.
 */

export const MOTION = { fast: 150, base: 220, slow: 400, flight: 600 } as const

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

/** Consultado a cada uso: a preferência pode mudar com a página aberta. */
export const reduced = () => reducedQuery.matches

let easeCache = ''
export function ease(): string {
  easeCache ||= getComputedStyle(document.documentElement).getPropertyValue('--ease-out-expo').trim()
  return easeCache || 'cubic-bezier(0.22, 1, 0.36, 1)'
}

/**
 * A mesma curva, como função, para o que é desenhado quadro a quadro (os
 * números que sobem). Resolve x(t) = x por bisseção: 24 passos dão precisão
 * de sobra para um número na tela.
 */
function easing(): (x: number) => number {
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
 * Leva um número de `from` até `to` com a curva da casa, chamando `frame` a
 * cada quadro. Com movimento reduzido, vai direto ao valor final. Devolve
 * quem cancela, para uma atualização nova não brigar com a anterior.
 */
export function tween(from: number, to: number, duration: number, frame: (value: number) => void): () => void {
  if (reduced() || from === to) {
    frame(to)
    return () => {}
  }
  const curve = easing()
  const start = performance.now()
  let handle = 0
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    frame(progress === 1 ? to : from + (to - from) * curve(progress))
    if (progress < 1) handle = requestAnimationFrame(step)
  }
  handle = requestAnimationFrame(step)
  return () => cancelAnimationFrame(handle)
}

/**
 * FLIP numa lista: guarda onde cada item estava, aplica a mudança e anima
 * cada um da posição antiga até a nova. Linha que chega empurra as outras
 * para baixo em vez de fazê-las saltar.
 *
 * A lista precisa ser `position: relative` (o `offsetTop` é medido nela), e
 * `offsetTop` ignora transform: medir no meio de outro FLIP não erra.
 */
export function flipList(list: HTMLElement, mutate: () => void) {
  if (reduced()) {
    mutate()
    return
  }
  const before = new Map<HTMLElement, number>()
  for (const child of list.children) before.set(child as HTMLElement, (child as HTMLElement).offsetTop)
  mutate()
  for (const child of list.children) {
    const element = child as HTMLElement
    const old = before.get(element)
    if (old === undefined) continue
    const delta = old - element.offsetTop
    if (delta === 0) continue
    element.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
      duration: MOTION.base,
      easing: ease(),
    })
  }
}

/**
 * O voo: uma cópia de `target` sai do retângulo de `from` e pousa sobre
 * `target`, com escala uniforme (o texto não deforma) e em arco.
 *
 * Decide e mede na hora da chamada: devolve `null`, sem animar, quando não
 * faz sentido voar — movimento reduzido, ou origem ou destino fora da tela
 * (um voo cujo fim ninguém vê não explica nada). Assim quem chama sabe na
 * hora se pode esconder a origem. A promessa diz se o voo chegou ao fim.
 */
export function fly(from: HTMLElement, target: HTMLElement): Promise<boolean> | null {
  if (reduced()) return null
  const origin = from.getBoundingClientRect()
  const landing = target.getBoundingClientRect()
  const height = document.documentElement.clientHeight
  const visible = (rect: DOMRect) => rect.bottom > 0 && rect.top < height
  if (!visible(origin) || !visible(landing) || landing.width === 0) return null

  const ghost = target.cloneNode(true) as HTMLElement
  ghost.classList.remove('is-held', 'is-new', 'is-landed', 'is-enter')
  ghost.removeAttribute('data-id')
  const shell = document.createElement('div')
  shell.className = 'flight'
  shell.setAttribute('aria-hidden', 'true')
  shell.style.setProperty('left', `${landing.left}px`)
  shell.style.setProperty('top', `${landing.top}px`)
  shell.style.setProperty('width', `${landing.width}px`)
  shell.append(ghost)
  document.body.append(shell)

  // Parte do tamanho da notificação, centralizada nela na vertical.
  const scale = origin.width / landing.width
  const startX = origin.left - landing.left
  const startY = origin.top + (origin.height - landing.height * scale) / 2 - landing.top

  // Arco: uma curva de Bézier quadrática com o ponto de controle acima da
  // origem e do destino, amostrada em 12 quadros. Entre quadros a
  // interpolação é reta; com 12, o olho lê uma curva.
  const controlX = startX * 0.45
  const controlY = Math.min(startY, 0) - 120
  const steps = 12
  const frames: Keyframe[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = (1 - t) ** 2 * startX + 2 * (1 - t) * t * controlX
    const y = (1 - t) ** 2 * startY + 2 * (1 - t) * t * controlY
    const s = scale + (1 - scale) * t
    frames.push({ offset: t, transform: `translate(${x}px, ${y}px) scale(${s})` })
  }

  return Promise.all([
    // Duas fases. Decolagem (150 ms): a notificação vira o lançamento,
    // parada no lugar dela. Voo (600 ms). A curva da casa concentra o
    // movimento no começo; sem a decolagem, o cartão ainda estaria
    // transparente durante a parte mais rápida do trajeto, e o voo se
    // resumiria ao pouso.
    ghost.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], {
      duration: MOTION.fast,
      easing: ease(),
    }).finished,
    shell.animate(frames, { duration: MOTION.flight, delay: MOTION.fast, easing: ease(), fill: 'backwards' }).finished,
  ]).then(
    () => true,
    // Animação cancelada (aba fechando, elemento removido): o pouso segue sem ela.
    () => false,
  ).finally(() => shell.remove())
}
