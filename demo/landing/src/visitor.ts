/**
 * A chave do visitante: o que faz o feed marcar "você" no que é seu.
 */

const VISITOR_STORAGE = 'nasfinance-demo:visitante'
const VISITOR_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

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

export const visitor = visitorKey()

/**
 * A mesma conta do servidor (demo/src/contract.ts, `visitorTag`): se a marca
 * do evento bate com a nossa, o lançamento é nosso — inclusive um mandado pelo
 * curl ou pelo Postman com esta chave. Sem crypto.subtle (página fora de
 * HTTPS), o "você" só aparece no que esta página mesma enviou.
 */
export async function isMine(transactionId: number, tag: string): Promise<boolean> {
  if (!crypto.subtle) return false
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${visitor}:${transactionId}`))
  const ours = Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return ours === tag
}
