/**
 * A parte viva da landing: o celular da abertura, o feed em tempo real, o
 * formulário, a requisição que ele monta e o curl.
 *
 * TypeScript sem framework, de propósito. O conteúdo da página é HTML estático
 * — lê-se e indexa-se sem JavaScript —, e o que precisa de script é pouco:
 * levar React (~50 kB) para três caixas seria pagar a conta do app numa página
 * que não é o app. As animações também não trazem biblioteca: CSS, Web
 * Animations API e o FLIP de motion.ts.
 *
 * Os tipos e a formatação vêm do próprio frontend: se o contrato do
 * `Transaction` mudar, a landing deixa de compilar junto com o Worker.
 *
 *   api.ts      o envio para quick-entry e a leitura de cada resposta
 *   feed.ts     "Chegando agora" e o canal ao vivo (o único EventSource)
 *   phone.ts    o celular e o voo até o feed
 *   flow.ts     o diagrama do "Como funciona", movido pelo canal ao vivo
 *   panel.ts    o pedaço do painel: uma leitura por visita, depois ao vivo
 *   stories.ts  o "antes e depois" do sinal que inverte
 *   reveal.ts   as entradas ao rolar, os números que sobem, listas em escada
 *   cards.ts    o brilho e a inclinação que seguem o cursor (ponteiro fino)
 *   motion.ts   durações, curva, FLIP, o voo e a interpolação de números
 *   visitor.ts  a chave que marca "você"
 */
import './landing.css'
import type { Flow } from '../../../frontend/src/types'
import { parseDecimal } from '../../../frontend/src/lib/format'
import { OFFLINE, TOKEN, type Options, loadOptions, lock, send, verdictOf } from './api'
import { startCards } from './cards'
import { addOwn, loadFeed, openStream } from './feed'
import { startFlow } from './flow'
import { startPanel } from './panel'
import { startPhone } from './phone'
import { armReveals, startExtras } from './reveal'
import { startStories } from './stories'
import { visitor } from './visitor'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
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
  flows: [...document.querySelectorAll<HTMLButtonElement>('button.flow')],
}

els.visitor.textContent = visitor

// ============================================================ formulário

let flow: Flow = 'EXPENSE'
let options: Options | null = null

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

// O limite é por IP, então vale também para um 429 vindo do celular.
lock.subscribe((left) => {
  if (left > 0) {
    els.send.disabled = true
    setResult(`Limite de envios atingido. Tente de novo em ${left} s.`, 'error')
    return
  }
  els.send.disabled = !options
  setResult('Pode enviar de novo.')
})

els.form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (lock.active()) return
  const problem = amountProblem()
  if (problem) {
    setResult(problem, 'error')
    els.amount.focus()
    return
  }

  els.send.disabled = true
  setResult('Enviando…')

  const sent = await send(body())
  if (!sent) {
    els.send.disabled = false
    setResult(OFFLINE, 'error')
    return
  }

  const { response, elapsed, text, data } = sent
  const ignored = response.headers.get('X-Demo-Ignorado')
  els.response.classList.replace('text-faint', 'text-dim')
  els.response.textContent = [
    `HTTP/1.1 ${response.status} ${response.statusText}  ·  ${elapsed} ms`,
    ...(ignored ? [`X-Demo-Ignorado: ${ignored}`] : []),
    ...(response.headers.get('Retry-After') ? [`Retry-After: ${response.headers.get('Retry-After')}`] : []),
    '',
    data ? JSON.stringify(data, null, 2) : text.slice(0, 300),
  ].join('\n')

  els.send.disabled = false
  const verdict = verdictOf(sent)
  if (verdict.kind === 'created') {
    addOwn(verdict.transaction)
    setResult('Enviado. Já está no feed, marcado como “você”.', 'ok')
  } else if (verdict.kind === 'wait') {
    lock.start(verdict.seconds)
  } else {
    setResult(verdict.message, 'error')
  }
})

async function startForm() {
  try {
    options = await loadOptions()
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
    els.send.disabled = lock.active()
  } catch {
    setResult('Não deu para carregar as contas e categorias. Recarregue a página em instantes.', 'error')
  }
  renderRequest()
}

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

// Primeiro as entradas ao rolar: elas medem o que está abaixo da dobra antes
// de qualquer dado chegar e mudar alturas.
armReveals()
renderRequest()
startPhone()
startFlow()
startPanel()
startStories()
startCards()
startExtras()
void startForm()
void loadFeed()
openStream()
