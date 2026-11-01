/**
 * O envio para `POST /api/v1/quick-entry`, usado pelo formulário e pelo
 * celular da abertura.
 *
 * Um caminho só para os dois, de propósito: a leitura de cada resposta
 * (201, 401, 413, 415, 422, 429 do Worker, 429 da cota da Cloudflare) foi
 * revisada uma vez, e duas cópias dela divergiriam na primeira correção.
 */
import type { ApiError, Flow, Transaction } from '../../../frontend/src/types'
import { visitor } from './visitor'

/** Público e exibido na página: ver "Regras desta demonstração". */
export const TOKEN = 'demo-publico-nasfinance'

export interface Options {
  accounts: string[]
  expenseCategories: string[]
  incomeCategories: string[]
}

export interface QuickEntry {
  amount: number | string
  account: string
  category: string
  flow: Flow
}

/** A resposta crua, para quem quer mostrá-la (o formulário mostra). */
export interface Sent {
  response: Response
  elapsed: number
  text: string
  data: unknown
}

export type Verdict =
  | { kind: 'created'; transaction: Transaction }
  | { kind: 'wait'; seconds: number }
  | { kind: 'failed'; message: string }

let optionsRequest: Promise<Options> | null = null

/** Uma leitura por visita, dividida entre o formulário e o celular. */
export function loadOptions(): Promise<Options> {
  optionsRequest ??= fetch('/api/v1/quick-entry/options').then(async (response) => {
    if (!response.ok) throw new Error(String(response.status))
    return (await response.json()) as Options
  })
  // Falhou: a próxima tentativa pede de novo em vez de herdar o erro.
  optionsRequest.catch(() => (optionsRequest = null))
  return optionsRequest
}

/** `null` quando não houve resposta nenhuma (sem rede). */
export async function send(body: QuickEntry): Promise<Sent | null> {
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
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
  const elapsed = Math.round(performance.now() - started)
  const text = await response.text()
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    // Resposta que não é JSON vem da própria Cloudflare (cota esgotada), não da API.
  }
  return { response, elapsed, text, data }
}

export const OFFLINE = 'Sem conexão com a demonstração. Confira a internet e tente de novo.'

/** Meia-noite UTC no relógio de quem lê: quando a cota diária volta. */
function quotaBack(): string {
  const next = new Date()
  next.setUTCHours(24, 0, 0, 0)
  return next.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** O que a resposta quer dizer para quem enviou, em português de gente. */
export function verdictOf({ response, data }: Sent): Verdict {
  if (response.status === 201 && data) return { kind: 'created', transaction: data as Transaction }

  const error = (data as ApiError | null) ?? null
  if (response.status === 429) {
    const retry = Number(response.headers.get('Retry-After'))
    if (error && Number.isFinite(retry) && retry > 0) return { kind: 'wait', seconds: retry }
    return { kind: 'failed', message: `A demonstração esgotou a cota de hoje. Volta às ${quotaBack()}.` }
  }
  if (!error) {
    return {
      kind: 'failed',
      message: `A demonstração não respondeu agora (HTTP ${response.status}). Tente de novo em instantes.`,
    }
  }
  // Erro JSON da borda (não do Worker) pode vir sem `details` ou sem `message`.
  const details = Array.isArray(error.details) ? error.details.map(String) : []
  const message = typeof error.message === 'string' && error.message ? error.message : `Erro HTTP ${response.status}`
  if (response.status === 422 && details.length) {
    return { kind: 'failed', message: `Fora da lista. Opções válidas: ${details.join(', ')}.` }
  }
  return {
    kind: 'failed',
    message: details.length ? `${message}: ${details.join('; ')}` : message,
  }
}

// ============================================================ limite por IP

type LockListener = (left: number, total: number) => void

let lockedUntil = 0
let lockTotal = 0
let lockTimer = 0
const lockListeners = new Set<LockListener>()

/**
 * O limite é por IP, não por botão: um 429 no celular trava também o
 * formulário, e vice-versa. Cada um desenha a trava do seu jeito.
 */
export const lock = {
  active: () => Date.now() < lockedUntil,
  subscribe(listener: LockListener) {
    lockListeners.add(listener)
  },
  start(seconds: number) {
    lockedUntil = Date.now() + seconds * 1000
    lockTotal = seconds
    window.clearTimeout(lockTimer)
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
      for (const listener of lockListeners) listener(left, lockTotal)
      if (left > 0) lockTimer = window.setTimeout(tick, 1000)
    }
    tick()
  },
}
