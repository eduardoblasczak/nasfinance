/**
 * O celular da abertura: o Atalho do iPhone em miniatura. Um toque em
 * "Lançar" faz um POST de verdade para a API da demonstração (a mesma rota,
 * o mesmo token público, os mesmos limites) e o lançamento voa da
 * notificação do celular até o lugar dele no feed.
 *
 * O voo começa só depois do 201: a animação mostra o que aconteceu, nunca o
 * que se espera que aconteça. Erro não voa.
 */
import type { Transaction } from '../../../frontend/src/types'
import { formatCurrency } from '../../../frontend/src/lib/format'
// As cores das categorias vêm do mesmo catálogo que o Worker serve: a bolinha
// do celular e a do feed não têm como divergir.
import { CATEGORIES } from '../../src/catalog'
import { OFFLINE, type Options, loadOptions, lock, send, verdictOf } from './api'
import * as feed from './feed'
import { MOTION, ease, fly, reduced } from './motion'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  form: $<HTMLFormElement>('phone-form'),
  amount: $<HTMLOutputElement>('phone-amount'),
  shuffle: $<HTMLButtonElement>('phone-shuffle'),
  category: $<HTMLSelectElement>('phone-category'),
  categoryDot: $<HTMLSpanElement>('phone-category-dot'),
  categoryName: $<HTMLSpanElement>('phone-category-name'),
  account: $<HTMLSelectElement>('phone-account'),
  accountName: $<HTMLSpanElement>('phone-account-name'),
  send: $<HTMLButtonElement>('phone-send'),
  sendLabel: $<HTMLSpanElement>('phone-send-label'),
  drain: $<HTMLSpanElement>('phone-drain'),
  note: $<HTMLParagraphElement>('phone-note'),
  banner: $<HTMLDivElement>('phone-banner'),
  bannerTitle: $<HTMLParagraphElement>('phone-banner-title'),
  bannerText: $<HTMLParagraphElement>('phone-banner-text'),
  clock: $<HTMLSpanElement>('phone-clock'),
  hit: $<HTMLDivElement>('stage-hit'),
}

const NOTE = 'Isto manda um POST de verdade para a demonstração.'

const categoryColor = new Map(CATEGORIES.map((category) => [category.name, category.color]))

/**
 * Faixas de valor plausíveis por categoria, em reais: um almoço não custa
 * R$ 900 e uma assinatura não custa R$ 3. O sorteio é o que deixa o feed com
 * cara de extrato em vez de dez "R$ 42,50" iguais.
 */
const RANGES: Record<string, [number, number]> = {
  Mercado: [18, 260],
  Restaurantes: [14, 95],
  Transporte: [4.4, 58],
  Moradia: [60, 480],
  Saúde: [12, 240],
  Lazer: [15, 180],
  Assinaturas: [9.9, 59.9],
  Educação: [29, 390],
}

/** A conta que costuma pagar cada categoria. Só vale enquanto a pessoa não escolhe outra. */
const USUAL_ACCOUNT: Record<string, string> = {
  Restaurantes: 'Vale Refeição',
  Mercado: 'Cartão de Crédito',
  Moradia: 'Conta Corrente',
  Educação: 'Conta Corrente',
}

let cents = 0
let ready = false
let sending = false
let accountTouched = false

function drawCents(category: string): number {
  const [min, max] = RANGES[category] ?? [5, 150]
  const reais = min + Math.random() * (max - min)
  const style = Math.random()
  // Preço de prateleira termina em ,90 ou redondo; conta de mercado, quebrada.
  const value = style < 0.4 ? Math.floor(reais) * 100 + 90 : style < 0.6 ? Math.round(reais) * 100 : Math.round(reais * 100)
  return Math.min(Math.max(value, 1), 1_000_000)
}

function showAmount(animate: boolean) {
  els.amount.textContent = formatCurrency(cents / 100)
  if (animate && !reduced()) {
    els.amount.classList.remove('swap')
    void els.amount.offsetWidth
    els.amount.classList.add('swap')
  }
}

function syncPicks() {
  const category = els.category.value
  els.categoryName.textContent = category
  els.categoryDot.style.setProperty('background-color', categoryColor.get(category) ?? 'var(--color-faint)')
  els.accountName.textContent = els.account.value
}

function fill(select: HTMLSelectElement, names: string[]) {
  select.replaceChildren(
    ...names.map((name) => {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      return option
    }),
  )
}

function suggestAccount() {
  if (accountTouched) return
  const usual = USUAL_ACCOUNT[els.category.value] ?? 'Cartão de Crédito'
  if ([...els.account.options].some((option) => option.value === usual)) els.account.value = usual
}

function setOptions(options: Options) {
  fill(els.category, options.expenseCategories)
  fill(els.account, options.accounts)
  // Começa num gasto do dia a dia, sorteado, para duas visitas não verem o mesmo celular.
  const everyday = ['Restaurantes', 'Mercado', 'Transporte', 'Lazer'].filter((name) => options.expenseCategories.includes(name))
  if (everyday.length) els.category.value = everyday[Math.floor(Math.random() * everyday.length)]
  suggestAccount()
  cents = drawCents(els.category.value)
  showAmount(false)
  syncPicks()
  ready = true
  els.category.disabled = false
  els.account.disabled = false
  els.shuffle.disabled = false
  els.send.disabled = lock.active()
}

// ============================================================ notificação

function showBanner(title: string, text: string) {
  els.bannerTitle.textContent = title
  els.bannerText.textContent = text
  els.banner.classList.add('is-shown')
}

let bannerTimer = 0
function hideBanner(after = 0) {
  window.clearTimeout(bannerTimer)
  // Sem espera, some no mesmo quadro em que a cópia em voo aparece por cima.
  if (after === 0) els.banner.classList.remove('is-shown')
  else bannerTimer = window.setTimeout(() => els.banner.classList.remove('is-shown'), after)
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** O brilho verde do feed acende no pouso. */
function pulse() {
  if (reduced()) return
  els.hit.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], {
    duration: MOTION.flight,
    easing: ease(),
  })
}

// ============================================================ envio

async function launch(event: SubmitEvent) {
  event.preventDefault()
  if (!ready || sending || lock.active()) return
  sending = true
  els.send.disabled = true
  els.send.setAttribute('aria-busy', 'true')
  els.sendLabel.textContent = 'Enviando…'

  const category = els.category.value
  const account = els.account.value
  const amount = cents / 100
  showBanner(`Enviando ${formatCurrency(amount)}…`, `${category} · ${account}`)
  const shownAt = performance.now()

  feed.hold()
  try {
    const sent = await send({ amount, account, category, flow: 'EXPENSE' })
    if (!sent) {
      hideBanner()
      els.note.textContent = OFFLINE
      return
    }
    const verdict = verdictOf(sent)
    if (verdict.kind !== 'created') {
      hideBanner()
      if (verdict.kind === 'wait') lock.start(verdict.seconds)
      else els.note.textContent = verdict.message
      return
    }

    const transaction: Transaction = verdict.transaction
    // O mesmo texto da notificação do Atalho de verdade (IPHONE_SHORTCUT.md, passo 8).
    showBanner(`Registrado: ${formatCurrency(transaction.amount)}`, `${transaction.categoryName ?? category} · ${transaction.accountName}`)
    // A notificação precisa ser lida antes de virar linha do feed.
    await wait(Math.max(0, MOTION.base + MOTION.slow - (performance.now() - shownAt)))

    const target = feed.prepareLanding(transaction)
    // Mede a origem já, antes de ela sumir; `null` quando não vai voar.
    const flight = target ? fly(els.banner, target) : null
    let landed = false
    if (flight) {
      hideBanner()
      landed = await flight
    } else {
      // Sem voo (movimento reduzido, feed fora da tela): a notificação fica
      // um pouco, para o toque ter dado resultado visível no celular.
      hideBanner(2500)
    }
    feed.release(transaction.id, landed)
    if (landed) pulse()
    els.note.textContent = landed ? 'Pronto. Fica no feed por 10 minutos, para todo mundo.' : 'Registrado. Está no topo do feed por 10 minutos.'

    // O próximo toque não manda o mesmo valor.
    cents = drawCents(els.category.value)
    showAmount(true)
  } finally {
    feed.unhold()
    sending = false
    els.send.removeAttribute('aria-busy')
    if (!lock.active()) {
      els.sendLabel.textContent = 'Lançar'
      els.send.disabled = !ready
    }
  }
}

// O limite é por IP: um 429 em qualquer canto desta página trava o botão aqui.
let drain: Animation | null = null
lock.subscribe((left, total) => {
  if (left > 0) {
    els.send.disabled = true
    els.sendLabel.textContent = `Libera em ${left} s`
    els.note.textContent = 'Limite da demonstração: 10 lançamentos por minuto.'
    // A barra esvazia no tempo do Retry-After. Uma vez por trava, não a cada segundo.
    if (left === total && !reduced()) {
      drain?.cancel()
      drain = els.drain.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
        duration: total * 1000,
        easing: 'linear',
      })
    }
    return
  }
  drain?.cancel()
  drain = null
  if (!sending) {
    els.sendLabel.textContent = 'Lançar'
    els.send.disabled = !ready
  }
  els.note.textContent = NOTE
})

// ============================================================ controles

els.form.addEventListener('submit', (event) => void launch(event as SubmitEvent))

els.shuffle.addEventListener('click', () => {
  cents = drawCents(els.category.value)
  showAmount(true)
})

els.category.addEventListener('change', () => {
  suggestAccount()
  cents = drawCents(els.category.value)
  showAmount(true)
  syncPicks()
})

els.account.addEventListener('change', () => {
  accountTouched = true
  syncPicks()
})

// O relógio da barra de status é o de quem está olhando.
function tickClock() {
  els.clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function startPhone() {
  tickClock()
  window.setInterval(tickClock, 15_000)
  loadOptions().then(setOptions, () => {
    els.note.textContent = 'Não deu para carregar as categorias. Recarregue a página em instantes.'
  })
}
