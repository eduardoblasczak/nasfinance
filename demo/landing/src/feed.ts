/**
 * O feed "Chegando agora": o que os visitantes mandaram nos últimos 10
 * minutos, atualizado ao vivo pelo mesmo canal SSE do app.
 *
 * A lista é reconciliada por id, e não redesenhada inteira: linha que já
 * está na tela continua sendo o mesmo elemento. É isso que deixa a linha
 * nova empurrar as outras (FLIP) e o lançamento do celular pousar num lugar
 * que já existe.
 */
import type { Transaction, TransactionEvent, TransactionSource } from '../../../frontend/src/types'
import { formatCurrency } from '../../../frontend/src/lib/format'
import { flipList, reduced } from './motion'
import { isMine, visitor } from './visitor'

const TTL_MS = 10 * 60 * 1000
const FEED_CAP = 30

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  feed: $<HTMLUListElement>('feed'),
  dot: $<HTMLSpanElement>('feed-dot'),
  statusText: $<HTMLSpanElement>('feed-status-text'),
  announcer: $<HTMLParagraphElement>('feed-announcer'),
}

const items = new Map<number, Transaction>()
const mine = new Set<number>()
let failed = false

/**
 * Lançamentos do celular esperando o voo pousar. Enquanto o celular envia,
 * um evento ao vivo que seja nosso pode chegar antes da resposta do POST:
 * ele entra na lista (abrindo o lugar) mas fica invisível até o pouso.
 */
const held = new Set<number>()
let holding = 0

/**
 * O mesmo canal ao vivo, repassado ao diagrama e ao painel: uma conexão SSE
 * só por página. Uma segunda EventSource seria outra vaga no Durable Object
 * e outro motivo para ele ficar acordado.
 */
export type LiveEvent = { type: 'CREATED'; transaction: Transaction } | { type: 'DELETED'; id: number }
const liveListeners = new Set<(event: LiveEvent) => void>()

export function onLive(listener: (event: LiveEvent) => void) {
  liveListeners.add(listener)
}

function emit(event: LiveEvent) {
  for (const listener of liveListeners) listener(event)
}

/** O que o feed mostra agora (o painel precisa saber o que já está contado). */
export function snapshot(): Transaction[] {
  return [...items.values()]
}

// ============================================================ linha

const SVG = 'http://www.w3.org/2000/svg'

/** A porta por onde o lançamento entrou: nome, cor e ícone, os mesmos da página toda. */
const SOURCES: Partial<Record<TransactionSource, { label: string; color: string; icon: string }>> = {
  SHORTCUT: { label: 'Atalho', color: 'var(--color-atalho)', icon: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5ZM10.5 18.5h3' },
  MANUAL: { label: 'Tela', color: 'var(--color-tela)', icon: 'M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1ZM8.5 20.5h7M12 16.5v4' },
  AGGREGATOR: { label: 'Open Finance', color: 'var(--color-extrato)', icon: 'M3.5 9.5 12 4l8.5 5.5M5.5 10v8M18.5 10v8M10 10v8M14 10v8M3.5 20h17' },
}

function sourceNode(source: TransactionSource): HTMLElement | null {
  const info = SOURCES[source]
  if (!info) return null
  const span = document.createElement('span')
  span.className = 'inline-flex items-center gap-1 font-medium'
  span.style.setProperty('color', info.color)
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'size-3.5 shrink-0')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', info.icon)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.75')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.append(path)
  span.append(svg, info.label)
  return span
}

function expiresAt(transaction: Transaction): number {
  return new Date(transaction.createdAt).getTime() + TTL_MS
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Valor com sinal E cor, centavos menores — o mesmo desenho do Money do app. */
function amountNode(transaction: Transaction): HTMLElement {
  const expense = transaction.flow === 'EXPENSE'
  const formatted = formatCurrency(Math.abs(transaction.amount))
  const comma = formatted.lastIndexOf(',')
  const span = document.createElement('span')
  span.className = `shrink-0 text-[0.9375rem] font-semibold tabular whitespace-nowrap ${expense ? 'text-fg' : 'text-accent'}`
  span.append(`${expense ? '−' : '+'} ${formatted.slice(0, comma)}`)
  const cents = document.createElement('span')
  cents.className = 'text-[0.82em]'
  cents.textContent = formatted.slice(comma)
  span.append(cents)
  return span
}

function row(transaction: Transaction, fresh: boolean): HTMLLIElement {
  const li = document.createElement('li')
  li.dataset.id = String(transaction.id)
  li.dataset.mine = String(mine.has(transaction.id))
  li.className = `feed-row flex min-h-[3.75rem] items-center gap-3 px-4 py-2.5${fresh ? ' is-new' : ''}`
  // A cor do destaque de chegada é a da porta de entrada (CSSOM: a CSP
  // barra atributo style no HTML, não propriedade definida por script).
  li.style.setProperty('--flash', SOURCES[transaction.source]?.color ?? 'var(--color-accent)')

  const dot = document.createElement('span')
  dot.className = 'size-2.5 shrink-0 rounded-full'
  dot.style.setProperty('background-color', transaction.categoryColor ?? 'var(--color-faint)')
  dot.setAttribute('aria-hidden', 'true')

  const text = document.createElement('span')
  text.className = 'min-w-0 flex-1'
  const title = document.createElement('span')
  title.className = 'flex items-center gap-2'
  const name = document.createElement('span')
  name.className = 'truncate text-[0.9375rem] text-fg'
  name.textContent = transaction.categoryName ?? (transaction.flow === 'EXPENSE' ? 'Despesa' : 'Receita')
  title.append(name)
  if (mine.has(transaction.id)) {
    const you = document.createElement('span')
    you.className = 'shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[0.75rem] font-semibold text-accent'
    you.textContent = 'você'
    title.append(you)
  }
  // Por onde entrou e de que conta. A conta é o que corta quando falta largura.
  const meta = document.createElement('span')
  meta.className = 'mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-faint'
  const source = sourceNode(transaction.source)
  if (source) meta.append(source, '·')
  const account = document.createElement('span')
  account.className = 'truncate'
  account.textContent = transaction.accountName
  meta.append(account)
  text.append(title, meta)

  // Valor e tempo restante à direita, como no extrato: o contador não some
  // no corte da linha em tela estreita.
  const side = document.createElement('span')
  side.className = 'flex shrink-0 flex-col items-end'
  const left = document.createElement('span')
  left.className = 'mt-0.5 text-[0.75rem] text-faint tabular'
  left.dataset.expires = String(expiresAt(transaction))
  left.textContent = `some em ${countdown(expiresAt(transaction) - Date.now())}`
  side.append(amountNode(transaction), left)

  li.append(dot, text, side)
  return li
}

// ============================================================ lista

function stateNode(kind: 'empty' | 'failed'): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'px-4 py-6'
  const p = document.createElement('p')
  p.className = 'text-[0.9375rem] text-dim'
  if (kind === 'failed') {
    p.textContent = 'Não deu para carregar o feed agora.'
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'press mt-3 inline-flex min-h-11 items-center rounded-full bg-surface-2 px-4 font-semibold text-fg hover:bg-white/12'
    retry.textContent = 'Tentar de novo'
    retry.addEventListener('click', () => void loadFeed())
    li.append(p, retry)
    return li
  }
  p.textContent = 'Nada nos últimos 10 minutos. Toque em Lançar no celular e o próximo é o seu.'
  const link = document.createElement('a')
  link.href = '#teste'
  link.className = 'mt-2 inline-flex min-h-11 items-center text-[0.9375rem] text-dim underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg'
  link.textContent = 'Ou mande pelo curl ou pelo Postman'
  li.append(p, link)
  return li
}

/**
 * Reconcilia a lista com `items`: tira o que saiu, insere o que chegou no
 * lugar certo e mantém o resto. `fresh` são os ids que acabaram de chegar e
 * ganham o destaque de entrada.
 */
function render(fresh: number[] = []) {
  const list = [...items.values()].sort((a, b) => b.id - a.id).slice(0, FEED_CAP)
  if (list.length === 0) {
    els.feed.replaceChildren(stateNode(failed ? 'failed' : 'empty'))
    return
  }

  const current = new Map<number, HTMLLIElement>()
  for (const li of els.feed.querySelectorAll<HTMLLIElement>(':scope > li[data-id]')) current.set(Number(li.dataset.id), li)
  const firstPaint = current.size === 0

  const apply = () => {
    const keep = new Set(list.map((transaction) => transaction.id))
    for (const child of [...els.feed.children]) {
      if (!keep.has(Number((child as HTMLElement).dataset.id))) child.remove()
    }
    list.forEach((transaction, index) => {
      let li = current.get(transaction.id)
      // O "você" pode ser descoberto depois (a leitura do feed traz `mine`).
      if (li && li.dataset.mine !== String(mine.has(transaction.id))) {
        const replacement = row(transaction, false)
        li.replaceWith(replacement)
        li = replacement
      }
      if (!li) {
        // Linha segurada para o voo não entra com animação: ela apareceria
        // por cima da própria opacidade 0 e piscaria antes do pouso.
        li = row(transaction, fresh.includes(transaction.id) && !held.has(transaction.id))
        if (firstPaint && index < 6 && !reduced()) {
          // Primeira leitura: as linhas entram em sequência curta, uma a uma.
          li.classList.add('is-enter')
          li.style.setProperty('animation-delay', `${index * 40}ms`)
        }
      }
      li.classList.toggle('is-held', held.has(transaction.id))
      const at = els.feed.children[index]
      if (at !== li) els.feed.insertBefore(li, at ?? null)
    })
  }

  if (firstPaint) apply()
  else flipList(els.feed, apply)
}

function announce(transaction: Transaction) {
  // Anúncio próprio, e não aria-live na lista: a lista muda a cada chegada,
  // e o leitor de tela releria tudo a cada lançamento.
  const kind = transaction.flow === 'EXPENSE' ? 'despesa' : 'receita'
  els.announcer.textContent = `Novo lançamento: ${kind} de ${formatCurrency(Math.abs(transaction.amount))} em ${
    transaction.categoryName ?? 'sem categoria'
  }${mine.has(transaction.id) ? ', enviado por você' : ''}.`
}

function upsert(transaction: Transaction, fresh: boolean) {
  const isNew = !items.has(transaction.id)
  items.set(transaction.id, transaction)
  render(isNew && fresh ? [transaction.id] : [])
  if (isNew && fresh && !held.has(transaction.id)) announce(transaction)
}

/** Recomeça a animação de uma classe já presente. */
function restart(element: HTMLElement, className: string) {
  element.classList.remove(className)
  void element.offsetWidth
  element.classList.add(className)
}

// ============================================================ o que o resto da página usa

/** Enviado por esta página pelo formulário: entra direto, marcado como "você". */
export function addOwn(transaction: Transaction) {
  mine.add(transaction.id)
  upsert(transaction, true)
}

/** O celular vai enviar: o que for nosso e chegar ao vivo espera o pouso. */
export function hold() {
  holding++
}

/**
 * Abre o lugar do lançamento no topo do feed, invisível, e devolve a linha
 * onde o voo deve pousar.
 */
export function prepareLanding(transaction: Transaction): HTMLLIElement | null {
  mine.add(transaction.id)
  held.add(transaction.id)
  items.set(transaction.id, transaction)
  // O destino é o topo da lista; se a pessoa rolou o feed, ele volta.
  els.feed.scrollTop = 0
  render()
  return els.feed.querySelector<HTMLLIElement>(`:scope > li[data-id="${transaction.id}"]`)
}

/** Pousou (ou não houve voo): a linha aparece com o destaque da sua porta. */
export function release(id: number, landed: boolean) {
  if (!held.delete(id)) return
  const li = els.feed.querySelector<HTMLLIElement>(`:scope > li[data-id="${id}"]`)
  if (li) {
    li.classList.remove('is-held')
    // Pousou: a cópia em voo já mostrou a chegada, então só o destaque.
    // Sem voo: entra com a animação de qualquer linha nova.
    restart(li, landed ? 'is-landed' : 'is-new')
  }
  const transaction = items.get(id)
  if (transaction) announce(transaction)
}

/** Fim do envio do celular: o que ficou segurado sem ser dele aparece. */
export function unhold() {
  holding = Math.max(0, holding - 1)
  if (holding === 0) for (const id of [...held]) release(id, false)
}

// ============================================================ leitura e tempo real

export async function loadFeed() {
  try {
    const response = await fetch('/api/v1/demo/feed', { headers: { 'X-Demo-Visitante': visitor } })
    if (!response.ok) throw new Error(String(response.status))
    const data = (await response.json()) as { items: Transaction[]; mine: number[] }
    // Some quem não está mais lá; quem continua mantém o elemento (e a animação).
    const ids = new Set(data.items.map((transaction) => transaction.id))
    for (const id of [...items.keys()]) if (!ids.has(id) && !held.has(id)) items.delete(id)
    for (const transaction of data.items) items.set(transaction.id, transaction)
    for (const id of data.mine) mine.add(id)
    failed = false
  } catch {
    failed = true
  }
  render()
}

// O contador regressivo anda sozinho; o que zera sai da tela mesmo antes do
// DELETED chegar (o alarme do servidor pode atrasar alguns segundos).
window.setInterval(() => {
  const now = Date.now()
  let expired = false
  for (const span of els.feed.querySelectorAll<HTMLSpanElement>('[data-expires]')) {
    const left = Number(span.dataset.expires) - now
    if (left <= 0) expired = true
    span.textContent = `some em ${countdown(left)}`
  }
  if (expired) {
    for (const [id, transaction] of items) if (expiresAt(transaction) <= now) items.delete(id)
    render()
  }
}, 1000)

let live = false

function setStatus(state: 'open' | 'connecting' | 'paused') {
  live = state === 'open'
  els.statusText.textContent = state === 'open' ? 'Ao vivo' : state === 'paused' ? 'Pausado' : 'Reconectando…'
  // Estado em forma e cor: ponto cheio ao vivo, anel vazado fora.
  els.dot.className = `live-dot size-2 rounded-full ${live ? 'bg-accent' : 'ring-2 ring-faint ring-inset'}`
}

/** O ponto pulsa quando chega mensagem de verdade: lançamento ou o sinal de vida (25 s). */
function ping() {
  if (live) restart(els.dot, 'ping')
}

let stream: EventSource | null = null

export function openStream() {
  if (stream) return
  setStatus('connecting')
  stream = new EventSource('/api/v1/events/stream')
  stream.onopen = () => setStatus('open')
  stream.onerror = () => setStatus('connecting')
  stream.onmessage = (message) => {
    let event: TransactionEvent & { visitorTag?: string }
    try {
      event = JSON.parse(message.data) as TransactionEvent & { visitorTag?: string }
    } catch {
      return
    }
    ping()
    if (event.type === 'CREATED' && event.transaction) {
      const transaction = event.transaction
      emit({ type: 'CREATED', transaction })
      // Nada de perguntar ao servidor a cada evento: com muita gente olhando,
      // isso multiplicava as requisições e esgotava a cota do dia. A marca no
      // próprio evento basta.
      if (event.visitorTag && !mine.has(transaction.id)) {
        void isMine(transaction.id, event.visitorTag).then((ours) => {
          // Se a resposta do POST chegou primeiro, o celular já cuidou desta
          // linha (e talvez já tenha pousado): segurar de novo a esconderia.
          if (ours && !mine.has(transaction.id)) {
            mine.add(transaction.id)
            if (holding > 0) held.add(transaction.id)
          }
          upsert(transaction, true)
        })
      } else {
        upsert(transaction, true)
      }
    } else if (event.type === 'DELETED' && event.transactionId !== null) {
      emit({ type: 'DELETED', id: event.transactionId })
      held.delete(event.transactionId)
      if (items.delete(event.transactionId)) render()
    }
  }
}

function closeStream() {
  stream?.close()
  stream = null
  setStatus('paused')
}

// Aba escondida não precisa de conexão aberta: cada SSE mantém o Durable Object
// acordado, e isso gasta a cota gratuita. Ao voltar, reconecta; só relê o feed
// se ficou fora tempo bastante para ter perdido algo, senão quem alterna de aba
// gera uma leitura a cada volta.
const RELOAD_AFTER_MS = 30_000
let hiddenAt = 0
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now()
    closeStream()
  } else {
    if (Date.now() - hiddenAt > RELOAD_AFTER_MS) void loadFeed()
    openStream()
  }
})
