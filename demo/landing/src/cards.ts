/**
 * Cartões que reagem ao cursor: um brilho que segue o ponteiro e uma
 * inclinação de até 2 graus. Só com mouse ou caneta (ponteiro fino) e com
 * movimento liberado; no toque, nada disso liga.
 *
 * Um quadro por vez: o pointermove só guarda a posição, e o desenho sai no
 * próximo requestAnimationFrame, mexendo em duas propriedades (o transform
 * do cartão e as variáveis do brilho). Nada de layout.
 */
import { reduced } from './motion'

const MAX_TILT = 2

export function startCards() {
  if (reduced() || !window.matchMedia('(pointer: fine)').matches) return
  for (const card of document.querySelectorAll<HTMLElement>('.glow-card')) {
    let frame = 0
    let x = 0
    let y = 0
    // Cartão com interação dentro (o "antes e depois", os links) só brilha:
    // inclinar um alvo de clique em movimento atrapalha a mira.
    const tilt = !card.querySelector('button, details')
    if (tilt) card.classList.add('tilt')

    const draw = () => {
      frame = 0
      const box = card.getBoundingClientRect()
      card.style.setProperty('--glow-x', `${x - box.left}px`)
      card.style.setProperty('--glow-y', `${y - box.top}px`)
      if (tilt) {
        const rx = ((y - box.top) / box.height - 0.5) * -MAX_TILT * 2
        const ry = ((x - box.left) / box.width - 0.5) * MAX_TILT * 2
        card.style.setProperty('transform', `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`)
      }
    }
    card.addEventListener('pointerenter', () => card.classList.add('is-lit'))
    card.addEventListener('pointermove', (event) => {
      x = event.clientX
      y = event.clientY
      frame ||= requestAnimationFrame(draw)
    })
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame)
      frame = 0
      card.classList.remove('is-lit')
      card.style.removeProperty('transform')
    })
  }
}
