/**
 * O diagrama do "Como funciona": cada lançamento que chega pelo canal ao vivo
 * percorre o caminho da porta por onde entrou (Atalho, Open Finance ou tela)
 * até o painel. Nada se move sem um evento real.
 *
 * Diagrama fora da tela não anima no vazio: guarda os três últimos eventos e
 * os mostra quando a pessoa chega até ele. O caso comum é tocar em Lançar no
 * celular da abertura e rolar até aqui depois.
 */
import type { TransactionSource } from '../../../frontend/src/types'
import { onLive } from './feed'
import { MOTION, ease, reduced } from './motion'

const SVG_NS = 'http://www.w3.org/2000/svg'
const QUEUE_MAX = 3

/** A cor de cada porta, a mesma da página inteira (landing.css). */
const COLORS: Partial<Record<TransactionSource, string>> = {
  SHORTCUT: 'var(--color-atalho)',
  AGGREGATOR: 'var(--color-extrato)',
  MANUAL: 'var(--color-tela)',
}

const figure = document.getElementById('fluxo')
let visible = false
const queue: TransactionSource[] = []
/** O seletor de portas: um evento ao vivo acende a porta por onde chegou. */
let selectDoor: ((door: string) => void) | null = null

/** Há duas versões do SVG (larga e compacta); anima a que está aparecendo. */
function activeSvg(): SVGSVGElement | null {
  if (!figure) return null
  return [...figure.querySelectorAll<SVGSVGElement>('svg[data-flow]')].find((svg) => svg.getClientRects().length > 0) ?? null
}

function circle(radius: number, color: string, opacity = 1): SVGCircleElement {
  const node = document.createElementNS(SVG_NS, 'circle')
  node.setAttribute('r', String(radius))
  node.setAttribute('fill', color)
  if (opacity < 1) node.setAttribute('fill-opacity', String(opacity))
  return node
}

/** O painel "recebe": um anel que acende em volta dele e some. */
function receive(svg: SVGSVGElement) {
  const panel = svg.querySelector<SVGRectElement>('rect[data-panel]')
  if (!panel) return
  const ring = panel.cloneNode() as SVGRectElement
  ring.removeAttribute('data-panel')
  ring.setAttribute('class', 'flow-ring')
  panel.after(ring)
  ring
    .animate(
      [
        { opacity: 0.9, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.06)' },
      ],
      { duration: MOTION.slow, easing: ease() },
    )
    .finished.finally(() => ring.remove())
}

function travel(source: TransactionSource) {
  const color = COLORS[source]
  const svg = activeSvg()
  const path = svg?.querySelector<SVGPathElement>(`path[data-path="${source}"]`)
  const layer = svg?.querySelector<SVGGElement>('[data-particles]')
  if (!color || !svg || !path || !layer) return
  selectDoor?.(source)

  // O caminho vira quadros de translate: transform é o que o navegador anima
  // sem recalcular nada. 16 amostras bastam para a curva não quebrar.
  const length = path.getTotalLength()
  const frames: Keyframe[] = []
  for (let i = 0; i <= 16; i++) {
    const point = path.getPointAtLength((length * i) / 16)
    frames.push({ offset: i / 16, transform: `translate(${point.x}px, ${point.y}px)` })
  }

  const particle = document.createElementNS(SVG_NS, 'g')
  particle.append(circle(11, color, 0.25), circle(5.5, color))
  layer.append(particle)

  // O trecho percorrido acende junto, na cor da porta, e apaga.
  const trail = path.cloneNode() as SVGPathElement
  trail.removeAttribute('data-path')
  trail.setAttribute('stroke-opacity', '1')
  path.after(trail)

  const options = { duration: MOTION.flight, easing: ease() }
  const moving = particle.animate(frames, options)
  particle.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], {
    duration: MOTION.flight,
  })
  trail.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: MOTION.flight, easing: 'linear' })

  moving.finished
    .then(() => receive(svg))
    .catch(() => {})
    .finally(() => {
      particle.remove()
      trail.remove()
    })
}

function flush() {
  queue.splice(0).forEach((source, index) => window.setTimeout(() => travel(source), index * MOTION.base))
}

/**
 * As três portas viram seletor: escolher uma acende o caminho dela (as
 * outras recuam) e mostra a linha de texto dela. Passar o mouse num nó do
 * diagrama escolhe também. Sem JavaScript, as três linhas ficam à mostra.
 */
function startDoors() {
  if (!figure) return
  const picker = figure.querySelector<HTMLElement>('.door-picker')
  const buttons = [...figure.querySelectorAll<HTMLButtonElement>('button.door')]
  const texts = [...figure.querySelectorAll<HTMLElement>('[data-door-text]')]
  if (!picker || buttons.length === 0) return
  picker.classList.replace('hidden', 'flex')

  const choose = (door: string) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.door === door))
    for (const text of texts) text.hidden = text.dataset.doorText !== door
    for (const svg of figure.querySelectorAll<SVGSVGElement>('svg[data-flow]')) svg.dataset.door = door
  }
  for (const button of buttons) button.addEventListener('click', () => choose(button.dataset.door ?? 'SHORTCUT'))
  for (const node of figure.querySelectorAll<SVGGElement>('[data-node]')) {
    const door = node.dataset.node
    if (!door || door === 'PANEL') continue
    node.addEventListener('pointerenter', () => choose(door))
    node.addEventListener('click', () => choose(door))
  }
  selectDoor = choose
  choose('SHORTCUT')
}

export function startFlow() {
  if (!figure) return
  startDoors()
  new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
      if (visible) flush()
    },
    { threshold: 0.35 },
  ).observe(figure)

  onLive((event) => {
    if (event.type !== 'CREATED' || reduced()) return
    const source = event.transaction.source
    if (!COLORS[source]) return
    if (visible && document.visibilityState === 'visible') travel(source)
    else {
      queue.push(source)
      if (queue.length > QUEUE_MAX) queue.shift()
    }
  })
}
