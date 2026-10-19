/**
 * A parte viva da landing: o formulário, a requisição que ele monta, o curl e
 * o feed em tempo real.
 *
 * TypeScript sem framework, de propósito. O conteúdo da página é HTML estático
 * — lê-se e indexa-se sem JavaScript —, e o que precisa de script é pouco:
 * levar React (~50 kB) para três caixas seria pagar a conta do app numa página
 * que não é o app.
 *
 * Os tipos e a formatação vêm do próprio frontend: se o contrato do
 * `Transaction` mudar, a landing deixa de compilar junto com o Worker.
 */
import './landing.css'
import type { ApiError, Flow, Transaction, TransactionEvent } from '../../../frontend/src/types'
import { formatCurrency, parseDecimal } from '../../../frontend/src/lib/format'

/** Público e exibido na página: ver "Regras desta demonstração". */
const TOKEN = 'demo-publico-nasfinance'
const VISITOR_STORAGE = 'nasfinance-demo:visitante'
const VISITOR_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const TTL_MS = 10 * 60 * 1000
const FEED_CAP = 30

interface Options {
  accounts: string[]
  expenseCategories: string[]
  incomeCategories: string[]
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  feed: $<HTMLUListElement>('feed'),
  dot: $<HTMLSpanElement>('feed-dot'),
  statusText: $<HTMLSpanElement>('feed-status-text'),
  form: $<HTMLFormElement>('form'),
  amount: $<HTMLInputElement>('amount'),
  account: $<HTMLSelectElement>('account'),
  category: $<HTMLSelectElement>('category'),
  send: $<HTMLButtonElement>('send'),
  result: $<HTMLParagraphElement>('result'),
  request: $<HTMLPreElement>('request'),
  response: $<HTMLPreElement>('response'),
  curl: $<HTMLPreElement>('curl'),
  copyCurl: $<HTMLButtonElement>('copy-curl'),
  visitor: $<HTMLElement>('visitor'),
  announcer: $<HTMLParagraphElement>('feed-announcer'),
  flows: [...document.querySelectorAll<HTMLButtonElement>('button.flow')],
}

// ============================================================ chave do visitante

/**
 * Gerada uma vez e lembrada no aparelho. Serve só para o feed marcar o que é
 * seu; não identifica ninguém. O localStorage lança em aba anônima do Safari e
 * com dados do site bloqueados — sem ele, a chave vale até recarregar.
 */
function visitorKey(): string {
  try {
    const stored = window.localStorage.getItem(VISITOR_STORAGE)
    if (stored && VISITOR_PATTERN.test(stored)) return stored
  } catch {
    // segue sem storage
  }
  const key =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  try {
    window.localStorage.setItem(VISITOR_STORAGE, key)
  } catch {
    // idem
  }
  return key
}

const visitor = visitorKey()
els.visitor.textContent = visitor

/**
 * A mesma conta do servidor (demo/src/contract.ts, `visitorTag`): se a marca
 * do evento bate com a nossa, o lançamento é nosso — inclusive um mandado pelo
 * curl ou pelo Postman com esta chave. Sem crypto.subtle (página fora de
 * HTTPS), o "você" só aparece no que esta página mesma enviou.
 */
async function isMine(transactionId: number, tag: string): Promise<boolean> {
  if (!crypto.subtle) return false
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${visitor}:${transactionId}`))
  const ours = Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return ours === tag
}

// ============================================================ formulário

let flow: Flow = 'EXPENSE'
let options: Options | null = null
let retryUntil = 0

function body() {
  const amount = parseDecimal(els.amount.value)
  return {
    amount: Number.isFinite(amount) ? amount : els.amount.value,
    account: els.account.value,
    category: els.category.value,
    flow,
  }
}

/** Mesma regra da API, dita antes de enviar: valor > 0, até R$ 10.000,00, 2 casas. */
function amountProblem(): string | null {
  const raw = els.amount.value.trim()
  if (!raw) return 'Informe o valor.'
  const amount = parseDecimal(raw)
  if (!Number.isFinite(amount) || amount <= 0) return 'O valor precisa ser maior que zero.'
  if (amount > 10_000) return 'O máximo na demonstração é R$ 10.000,00.'
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return 'Use no máximo 2 casas decimais.'
  }
  return null
}

function renderCategories() {
  if (!options) return
  const list = flow === 'EXPENSE' ? options.expenseCategories : options.incomeCategories
  const previous = els.category.value
  els.category.replaceChildren(
    ...list.map((name) => {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      return option
    }),
  )
  if (list.includes(previous)) els.category.value = previous
}

function renderRequest() {
  const json = JSON.stringify(body(), null, 2)
  els.request.textContent = [
    'POST /api/v1/quick-entry HTTP/1.1',
    `Host: ${location.host}`,
    'Content-Type: application/json',
    `Authorization: Bearer ${TOKEN}`,
    `X-Demo-Visitante: ${visitor}`,
    '',
    json,
  ].join('\n')

  // O curl usa a origem de onde a página foi aberta: o mesmo comando serve no
  // wrangler dev local e em produção.
  const curlBody = JSON.stringify({ amount: 12.5, account: els.account.value, category: els.category.value, flow })
  els.curl.textContent = [
    `curl -X POST ${location.origin}/api/v1/quick-entry \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer ${TOKEN}" \\`,
    `  -H "X-Demo-Visitante: ${visitor}" \\`,
    `  -d '${curlBody.replace(/'/g, "'\\''")}'`,
  ].join('\n')
}

for (const button of els.flows) {
  button.addEventListener('click', () => {
    flow = button.dataset.flow as Flow
    for (const other of els.flows) other.setAttribute('aria-pressed', String(other === button))
    renderCategories()
    renderRequest()
  })
}
for (const control of [els.amount, els.account, els.category]) {
  control.addEventListener('input', renderRequest)
  control.addEventListener('change', renderRequest)
}

function setResult(text: string, tone: 'ok' | 'error' | 'neutral' = 'neutral') {
  els.result.textContent = text
  els.result.className = `mt-3 min-h-[1.5rem] text-[0.9375rem] ${
    tone === 'ok' ? 'text-accent' : tone === 'error' ? 'text-negative' : 'text-dim'
  }`
}

/** Meia-noite UTC no relógio de quem lê: quando a cota diária volta. */
function quotaBack(): string {
  const next = new Date()
  next.setUTCHours(24, 0, 0, 0)
  return next.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function lockFor(seconds: number) {
  retryUntil = Date.now() + seconds * 1000
  els.send.disabled = true
  const tick = () => {
    const left = Math.ceil((retryUntil - Date.now()) / 1000)
    if (left <= 0) {
      els.send.disabled = false
      setResult('Pode enviar de novo.')
      return
    }
    setResult(`Limite de envios atingido. Tente de novo em ${left} s.`, 'error')
    window.setTimeout(tick, 1000)
  }
  tick()
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (Date.now() < retryUntil) return
  const problem = amountProblem()
  if (problem) {
    setResult(problem, 'error')
    els.amount.focus()
    return
  }

  els.send.disabled = true
  setResult('Enviando…')
  const started = performance.now()

  let response: Response
  try {
    response = await fetch('/api/v1/quick-entry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        'X-Demo-Visitante': visitor,
      },
      body: JSON.stringify(body()),
    })
  } catch {
    els.send.disabled = false
    setResult('Sem conexão com a demonstração. Confira a internet e tente de novo.', 'error')
    return
  }

  const elapsed = Math.round(performance.now() - started)
  const text = await response.text()
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    // Resposta que não é JSON vem da própria Cloudflare (cota esgotada), não da API.
  }

  const ignored = response.headers.get('X-Demo-Ignorado')
  els.response.classList.replace('text-faint', 'text-dim')
  els.response.textContent = [
    `HTTP/1.1 ${response.status} ${response.statusText}  ·  ${elapsed} ms`,
    ...(ignored ? [`X-Demo-Ignorado: ${ignored}`] : []),
    ...(response.headers.get('Retry-After') ? [`Retry-After: ${response.headers.get('Retry-After')}`] : []),
    '',
    data ? JSON.stringify(data, null, 2) : text.slice(0, 300),
  ].join('\n')

  if (response.status === 201 && data) {
    const created = data as Transaction
    mine.add(created.id)
    upsert(created, true)
    els.send.disabled = false
    setResult('Enviado. Já está no feed, marcado como “você”.', 'ok')
    return
  }

  els.send.disabled = false
  const error = (data as ApiError | null) ?? null
  if (response.status === 429) {
    const retry = Number(response.headers.get('Retry-After'))
    if (error && Number.isFinite(retry) && retry > 0) {
      lockFor(retry)
    } else {
      setResult(`A demonstração esgotou a cota de hoje. Volta às ${quotaBack()}.`, 'error')
    }
    return
  }
  if (!error) {
    setResult(`A demonstração não respondeu agora (HTTP ${response.status}). Tente de novo em instantes.`, 'error')
    return
  }
  if (response.status === 422) {
    setResult(`Fora da lista. Opções válidas: ${error.details.join(', ')}.`, 'error')
    return
  }
  setResult(error.details.length ? `${error.message}: ${error.details.join('; ')}` : error.message, 'error')
})

async function loadOptions() {
  try {
    const response = await fetch('/api/v1/quick-entry/options')
    if (!response.ok) throw new Error(String(response.status))
    options = (await response.json()) as Options
    els.account.replaceChildren(
      ...options.accounts.map((name) => {
        const option = document.createElement('option')
        option.value = name
        option.textContent = name
        return option
      }),
    )
    renderCategories()
    els.account.disabled = false
    els.category.disabled = false
    els.send.disabled = false
  } catch {
    setResult('Não deu para carregar as contas e categorias. Recarregue a página em instantes.', 'error')
  }
  renderRequest()
}

// ============================================================ feed ao vivo

const items = new Map<number, Transaction>()
const mine = new Set<number>()
let feedFailed = false

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
  li.className = `flex min-h-[3.75rem] items-center gap-3 px-4 py-2.5 ${fresh ? 'feed-in' : ''}`

  const dot = document.createElement('span')
  dot.className = 'size-2.5 shrink-0 rounded-full'
  dot.style.backgroundColor = transaction.categoryColor ?? 'var(--color-faint)'
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
  const meta = document.createElement('span')
  meta.className = 'mt-0.5 block truncate text-[0.8125rem] text-faint'
  const left = document.createElement('span')
  left.className = 'tabular'
  left.dataset.expires = String(expiresAt(transaction))
  left.textContent = `some em ${countdown(expiresAt(transaction) - Date.now())}`
  meta.append(`${transaction.accountName} · `, left)
  text.append(title, meta)

  li.append(dot, text, amountNode(transaction))
  return li
}

function renderFeed(freshId?: number) {
  const list = [...items.values()].sort((a, b) => b.id - a.id).slice(0, FEED_CAP)
  if (feedFailed && list.length === 0) {
    const li = document.createElement('li')
    li.className = 'px-4 py-6 text-[0.9375rem] text-dim'
    li.append('Não deu para carregar o feed agora. ')
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'press inline-flex min-h-11 items-center rounded-full bg-surface-2 px-4 font-semibold text-fg hover:bg-white/12'
    retry.textContent = 'Tentar de novo'
    retry.addEventListener('click', () => void loadFeed())
    li.append(retry)
    els.feed.replaceChildren(li)
    return
  }
  if (list.length === 0) {
    const li = document.createElement('li')
    li.className = 'px-4 py-6'
    const p = document.createElement('p')
    p.className = 'text-[0.9375rem] text-dim'
    p.textContent = 'Nada nos últimos 10 minutos. O próximo pode ser o seu.'
    const link = document.createElement('a')
    link.href = '#teste'
    link.className = 'press mt-3 inline-flex min-h-11 items-center rounded-full bg-surface-2 px-4 text-[0.9375rem] font-semibold text-fg hover:bg-white/12'
    link.textContent = 'Testar agora'
    li.append(p, link)
    els.feed.replaceChildren(li)
    return
  }
  els.feed.replaceChildren(...list.map((transaction) => row(transaction, transaction.id === freshId)))
}

function upsert(transaction: Transaction, fresh: boolean) {
  const isNew = !items.has(transaction.id)
  items.set(transaction.id, transaction)
  renderFeed(isNew && fresh ? transaction.id : undefined)
  // Anúncio próprio, e não aria-live na lista: a lista é redesenhada inteira,
  // e o leitor de tela releria tudo a cada lançamento.
  if (isNew && fresh) {
    const kind = transaction.flow === 'EXPENSE' ? 'despesa' : 'receita'
    els.announcer.textContent = `Novo lançamento: ${kind} de ${formatCurrency(Math.abs(transaction.amount))} em ${
      transaction.categoryName ?? 'sem categoria'
    }${mine.has(transaction.id) ? ', enviado por você' : ''}.`
  }
}

async function loadFeed() {
  try {
    const response = await fetch('/api/v1/demo/feed', { headers: { 'X-Demo-Visitante': visitor } })
    if (!response.ok) throw new Error(String(response.status))
    const data = (await response.json()) as { items: Transaction[]; mine: number[] }
    items.clear()
    for (const transaction of data.items) items.set(transaction.id, transaction)
    for (const id of data.mine) mine.add(id)
    feedFailed = false
  } catch {
    feedFailed = true
  }
  renderFeed()
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
    renderFeed()
  }
}, 1000)

function setStatus(state: 'open' | 'connecting' | 'paused') {
  els.statusText.textContent = state === 'open' ? 'Ao vivo' : state === 'paused' ? 'Pausado' : 'Reconectando…'
  // Estado em forma e cor: ponto cheio ao vivo, anel vazado fora.
  els.dot.className = `size-2 rounded-full ${state === 'open' ? 'bg-accent' : 'ring-2 ring-faint ring-inset'}`
}

let stream: EventSource | null = null

function openStream() {
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
    if (event.type === 'CREATED' && event.transaction) {
      const transaction = event.transaction
      // Nada de perguntar ao servidor a cada evento: com muita gente olhando,
      // isso multiplicava as requisições e esgotava a cota do dia. A marca no
      // próprio evento basta.
      if (event.visitorTag && !mine.has(transaction.id)) {
        void isMine(transaction.id, event.visitorTag).then((ours) => {
          if (ours) mine.add(transaction.id)
          upsert(transaction, true)
        })
      } else {
        upsert(transaction, true)
      }
    } else if (event.type === 'DELETED' && event.transactionId !== null) {
      if (items.delete(event.transactionId)) renderFeed()
    }
  }
}

function closeStream() {
  stream?.close()
  stream = null
  setStatus('paused')
}

// Aba escondida não precisa de conexão aberta: cada SSE mantém o Durable Object
// acordado, e isso gasta a cota gratuita. Ao voltar, relê e reconecta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') closeStream()
  else {
    void loadFeed()
    openStream()
  }
})

els.copyCurl.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.curl.textContent ?? '')
    els.copyCurl.textContent = 'Copiado'
  } catch {
    // Sem permissão de área de transferência: seleciona para o Ctrl+C.
    const range = document.createRange()
    range.selectNodeContents(els.curl)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    els.copyCurl.textContent = 'Selecionado'
  }
  window.setTimeout(() => (els.copyCurl.textContent = 'Copiar curl'), 2000)
})

renderRequest()
void loadOptions()
void loadFeed()
openStream()
