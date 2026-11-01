/**
 * Entrada ao rolar: o bloco sobe 16 px e aparece quando chega na tela.
 *
 * Três regras para nunca esconder conteúdo:
 *   - sem JavaScript, nada é armado (o estado escondido vem do script);
 *   - com movimento reduzido, também não;
 *   - o que já está na tela quando a página abre fica como está.
 * E na impressão, tudo aparece.
 *
 * Os números marcados com `data-count` sobem de zero quando o bloco deles
 * entra; o HTML já traz o valor final, que é o que fica sem script.
 */
import { MOTION, ease, reduced, tween } from './motion'

function count(element: HTMLElement) {
  const target = Number(element.dataset.count)
  if (!Number.isFinite(target)) return
  tween(0, target, MOTION.flight, (value) => {
    element.textContent = String(Math.round(value))
  })
}

export function armReveals() {
  if (reduced() || !('IntersectionObserver' in window)) return
  const items = [...document.querySelectorAll<HTMLElement>('[data-reveal]')]
  const fold = window.innerHeight

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const element = entry.target as HTMLElement
        observer.unobserve(element)
        element.classList.add('is-revealed')
        for (const number of element.querySelectorAll<HTMLElement>('[data-count]')) count(number)
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )

  // Irmãos que entram juntos (os cartões de uma grade) chegam em escada
  // curta: 60 ms entre um e outro, no máximo quatro degraus.
  const step = new Map<Element, number>()
  for (const element of items) {
    if (element.getBoundingClientRect().top < fold) continue
    const parent = element.parentElement
    const index = parent ? (step.get(parent) ?? 0) : 0
    if (parent) step.set(parent, index + 1)
    if (index > 0) element.style.setProperty('transition-delay', `${Math.min(index, 4) * 60}ms`)
    element.classList.add('reveal')
    observer.observe(element)
  }

  window.addEventListener('beforeprint', () => {
    for (const element of items) element.classList.add('is-revealed')
  })
}

/**
 * O que anima sozinho para quando sai da tela: a faixa da stack não gira
 * para ninguém. E o conteúdo de um <details> sobe ao abrir (abrir e fechar
 * continuam do navegador, com ou sem script).
 */
export function startExtras() {
  const ticker = document.querySelector<HTMLElement>('.ticker')
  if (ticker && 'IntersectionObserver' in window) {
    ticker.classList.add('is-offscreen')
    new IntersectionObserver((entries) => {
      ticker.classList.toggle('is-offscreen', !entries.some((entry) => entry.isIntersecting))
    }).observe(ticker)
  }
  for (const fold of document.querySelectorAll<HTMLDetailsElement>('details.fold')) {
    fold.addEventListener('toggle', () => {
      const body = fold.querySelector<HTMLElement>('.fold-body')
      if (!fold.open || !body || reduced()) return
      body.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], {
        duration: MOTION.base,
        easing: ease(),
      })
    })
  }
  // Listas marcadas com .stagger: cada item entra um pouco depois do outro
  // quando a lista aparece.
  if (reduced() || !('IntersectionObserver' in window)) return
  for (const list of document.querySelectorAll<HTMLElement>('.stagger')) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      ;[...list.children].forEach((item, index) => {
        ;(item as HTMLElement).animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], {
          duration: MOTION.slow,
          delay: 120 + index * 60,
          easing: ease(),
          fill: 'backwards',
        })
      })
    })
    observer.observe(list)
  }
}
