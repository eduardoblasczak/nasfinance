/**
 * A cerca: o que o Worker barra antes de acordar o Durable Object.
 *
 * Acordar o objeto custa cota e tempo; tudo que dá para recusar olhando só a
 * requisição é recusado aqui. O que exige contar ao longo do tempo com
 * precisão — limite por IP no minuto e no dia, limite global — fica no objeto,
 * que é instância única e vê tudo (ver `Limits` em store.ts).
 *
 * Ordem, da mais barata para a mais cara (LANDING_DEMO.md, 2.3):
 *   rota -> origem -> tipo -> rajada por cliente -> token -> tamanho -> JSON -> normalização
 *
 * Leitura tem a sua própria guarda (`guardRead`): sem ela, um único notebook
 * em laço esgotava a cota do dia só com GET.
 */
import { clientKey, errorResponse } from './contract'
import type { Env } from './env'

/**
 * O token do Atalho na demonstração. Público por definição: aparece na landing
 * para o exemplo ser idêntico ao do Atalho de verdade. Formato propositalmente
 * diferente do token real, para que um nunca seja confundido com o outro.
 */
export const PUBLIC_TOKEN = 'demo-publico-nasfinance'

/** As duas portas de escrita: o Atalho e o + do próprio app. */
export const WRITE_ROUTES = new Set(['/api/v1/quick-entry', '/api/v1/transactions'])

/** Um lançamento cabe em menos de 200 bytes; 1 KB é folga, não convite. */
export const MAX_BODY_BYTES = 1024

/** Valor máximo aceito na demonstração. */
export const MAX_AMOUNT = 10_000

/**
 * Campos que a demo descarta. Texto livre num feed público vira pichação em
 * minutos, e uma data arbitrária tira o lançamento da tela de quem o enviou.
 */
export const DROPPED_FIELDS = ['description', 'occurredOn', 'notes'] as const

/** Chave que a landing gera para destacar os lançamentos de quem enviou. */
export const VISITOR_HEADER = 'X-Demo-Visitante'
const VISITOR_KEY = /^[A-Za-z0-9_-]{8,64}$/

/** Diz em que camada um 429 aconteceu: útil para quem testa pelo Postman. */
export const LIMIT_LAYER_HEADER = 'X-Demo-Limite'

/** Lista os campos descartados, para o visitante não achar que foi bug. */
export const IGNORED_HEADER = 'X-Demo-Ignorado'

export type FenceResult =
  | { pass: Request; ignored: string[] }
  | { reject: Response }

/** Só escritas passam por aqui; leitura vai direto ao objeto. */
export async function fence(request: Request, env: Env, path: string): Promise<FenceResult> {
  // ---- rota: escrita fora das duas portas morre aqui, sem acordar o objeto.
  if (request.method !== 'POST' || !WRITE_ROUTES.has(path)) {
    return {
      reject: errorResponse(403, 'Somente leitura na demonstracao', [
        'Na demonstracao so lancamentos novos gravam: POST /api/v1/quick-entry ou POST /api/v1/transactions.',
      ]),
    }
  }

  // ---- origem: escrita disparada por outro site usaria o IP de cada visitante
  // daquele site, e o limite por cliente deixaria de valer.
  const crossSite = rejectCrossSite(request)
  if (crossSite) return { reject: crossSite }

  // ---- tipo: só JSON, como o backend real (415). E é isto que fecha a porta
  // ao formulário ou fetch `no-cors` de outro site: `application/json` exige
  // preflight, e sem CORS o preflight falha.
  const type = (request.headers.get('Content-Type') ?? '').toLowerCase()
  if (!type.startsWith('application/json')) {
    return {
      reject: errorResponse(415, 'Tipo de conteudo nao suportado', ['Envie o corpo como JSON, com Content-Type: application/json']),
    }
  }

  // ---- rajada por cliente: contador aproximado na borda. Opcional: se o
  // plano não oferecer o binding, o limite exato do objeto vale sozinho.
  const ip = clientKey(request.headers.get('CF-Connecting-IP'))
  if (env.BURST) {
    const { success } = await env.BURST.limit({ key: ip })
    if (!success) {
      return { reject: tooMany('Limite da demonstracao: 10 lancamentos por minuto. Tente de novo em instantes.', 60, 'worker') }
    }
  }

  // ---- token: só no Atalho, como no app real (@ShortcutSecured).
  if (path === '/api/v1/quick-entry') {
    const header = request.headers.get('Authorization')
    if (!header?.startsWith('Bearer ')) {
      return { reject: errorResponse(401, 'Token de acesso ausente') }
    }
    if (header.slice('Bearer '.length).trim() !== PUBLIC_TOKEN) {
      return { reject: errorResponse(401, 'Token de acesso invalido', [`Na demonstracao o token e publico: ${PUBLIC_TOKEN}`]) }
    }
  }

  // ---- tamanho: pelo cabeçalho, e de novo enquanto lê — um corpo em pedaços
  // não tem Content-Length, e `arrayBuffer()` carregaria 90 MB inteiros na
  // memória do isolate antes de qualquer conferência.
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > MAX_BODY_BYTES) return { reject: tooLarge() }
  const raw = await readLimited(request, MAX_BODY_BYTES)
  if (raw === null) return { reject: tooLarge() }

  // ---- JSON
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return { reject: errorResponse(400, 'Dados invalidos na requisicao', ['corpo: JSON invalido']) }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { reject: errorResponse(400, 'Dados invalidos na requisicao', ['corpo: esperado um objeto JSON']) }
  }
  const fields = body as Record<string, unknown>

  // ---- normalização
  const ignored = DROPPED_FIELDS.filter((field) => fields[field] != null && fields[field] !== '')
  for (const field of DROPPED_FIELDS) delete fields[field]

  const amount = typeof fields.amount === 'number' ? fields.amount : Number(fields.amount)
  if (Number.isFinite(amount) && amount > MAX_AMOUNT) {
    return {
      reject: errorResponse(400, 'Dados invalidos na requisicao', [
        `amount: na demonstracao o valor maximo e ${MAX_AMOUNT.toFixed(2)}`,
      ]),
    }
  }

  // ---- repasse: corpo já limpo, e só os cabeçalhos que o objeto usa.
  const headers = new Headers({ 'Content-Type': 'application/json', 'CF-Connecting-IP': ip })
  const visitor = request.headers.get(VISITOR_HEADER)
  if (visitor && VISITOR_KEY.test(visitor)) headers.set(VISITOR_HEADER, visitor)

  return {
    pass: new Request(request.url, { method: 'POST', headers, body: JSON.stringify(fields) }),
    ignored,
  }
}

export function tooMany(detail: string, retryAfterSeconds: number, layer: 'worker' | 'objeto'): Response {
  const response = errorResponse(429, 'Muitas requisicoes', [detail])
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterSeconds))))
  response.headers.set(LIMIT_LAYER_HEADER, layer)
  return response
}

/**
 * Guarda das leituras, antes de acordar o objeto: origem e um teto por
 * cliente bem mais folgado que o da escrita — abrir o app faz meia dúzia de
 * GET de uma vez.
 */
export async function guardRead(request: Request, env: Env): Promise<Response | null> {
  const crossSite = rejectCrossSite(request)
  if (crossSite) return crossSite
  if (env.READS) {
    const { success } = await env.READS.limit({ key: clientKey(request.headers.get('CF-Connecting-IP')) })
    if (!success) {
      return tooMany('Limite da demonstracao: 120 leituras por minuto. Tente de novo em instantes.', 60, 'worker')
    }
  }
  return null
}

/**
 * Pedido que outro site fez o navegador do visitante disparar — um `<img>`
 * apontando para a API, um fetch `no-cors`. Ninguém quis aquilo. Postman, curl
 * e o Atalho não mandam `Sec-Fetch-Site`, e passam.
 */
function rejectCrossSite(request: Request): Response | null {
  if (request.headers.get('Sec-Fetch-Site') !== 'cross-site') return null
  return errorResponse(403, 'Requisicao entre sites recusada', [
    'A API da demonstracao responde a esta pagina, ao Postman, ao curl e ao Atalho — nao a outros sites.',
  ])
}

async function readLimited(request: Request, max: number): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

function tooLarge(): Response {
  return errorResponse(413, 'Corpo muito grande', [`Na demonstracao o limite e de ${MAX_BODY_BYTES} bytes`])
}
