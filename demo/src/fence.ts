/**
 * A cerca: o que o Worker barra antes de acordar o Durable Object.
 *
 * Acordar o objeto custa cota e tempo; tudo que dá para recusar olhando só a
 * requisição é recusado aqui. O que exige contar ao longo do tempo com
 * precisão — limite por IP no minuto e no dia, limite global — fica no objeto,
 * que é instância única e vê tudo (ver `Limits` em store.ts).
 *
 * Ordem, da mais barata para a mais cara (LANDING_DEMO.md, 2.3):
 *   rota -> rajada por IP -> token -> tamanho -> JSON -> normalização
 */
import { errorResponse } from './contract'
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

  // ---- rajada por IP: contador aproximado na borda, antes de qualquer outra
  // coisa. Opcional: se o plano não oferecer o binding, o limite exato do
  // objeto continua valendo sozinho.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
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

  // ---- tamanho: pelo cabeçalho, e de novo pelos bytes de fato lidos — um
  // corpo enviado em pedaços não tem Content-Length.
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > MAX_BODY_BYTES) return { reject: tooLarge() }
  const raw = await request.arrayBuffer()
  if (raw.byteLength > MAX_BODY_BYTES) return { reject: tooLarge() }

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

function tooLarge(): Response {
  return errorResponse(413, 'Corpo muito grande', [`Na demonstracao o limite e de ${MAX_BODY_BYTES} bytes`])
}
