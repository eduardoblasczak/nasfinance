/**
 * O contrato da API espelho.
 *
 * Os tipos vêm do frontend do app real, não de uma cópia: se um DTO mudar lá,
 * este espelho deixa de compilar em vez de divergir em silêncio. As mensagens
 * de erro repetem as do backend Java, sem acento como lá, porque o visitante
 * que testa pelo Postman deve ver exatamente o que o Atalho de verdade veria.
 */
import type { ApiError } from '../../frontend/src/types'

export type * from '../../frontend/src/types'

/** O backend real converte datas para este fuso; o espelho também. */
export const TIMEZONE = 'America/Sao_Paulo'

/** Erro com o mesmo formato do `ErrorResponse` do backend. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message)
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function errorResponse(status: number, message: string, details: string[] = []): Response {
  const body: ApiError = { status, message, details, at: new Date().toISOString() }
  return json(body, status)
}

// ---------------------------------------------------------------- datas

/** Hoje no fuso do app, como `YYYY-MM-DD`. */
export function today(now: Date = new Date()): string {
  // en-CA formata como ISO (2026-10-17); o fuso faz a virada do dia em Brasília.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Datas ISO tratadas como dias de calendário, sem fuso: só aritmética de dia. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Último dia do mês de `iso`: o dia anterior ao primeiro do mês seguinte. */
export function lastOfMonth(iso: string): string {
  const date = new Date(`${firstOfMonth(iso)}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

// ---------------------------------------------------------------- dinheiro

/**
 * Dinheiro anda em centavos inteiros do começo ao fim. Somar `0.1 + 0.2` em
 * ponto flutuante dá 0.30000000000000004; o backend usa BigDecimal, e um
 * espelho que errasse centavo no total seria pior que nenhum espelho.
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

/**
 * Variação percentual como o `DashboardService`: a razão arredondada em 4
 * casas (HALF_UP) e depois multiplicada por 100.
 */
export function percent(part: number, whole: number): number {
  return Math.round((part / whole) * 10_000) / 100
}

// ---------------------------------------------------------------- visitante

/**
 * Marca de um lançamento para quem o enviou: os 16 primeiros dígitos de
 * SHA-256("chave:id"). Vai no evento de tempo real para a landing reconhecer
 * o que é seu sem perguntar ao servidor — perguntar a cada evento fazia o
 * custo crescer com (pessoas olhando × envios) e esgotava a cota diária em
 * minutos numa visita em massa.
 *
 * A chave nunca sai do objeto; a marca muda a cada lançamento, então não liga
 * dois envios à mesma pessoa. A landing faz a mesma conta (landing/src/main.ts).
 */
export async function visitorTag(visitorKey: string, transactionId: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${visitorKey}:${transactionId}`))
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------- texto

/**
 * Igual ao `TextNormalizer` do backend: sem acento, minúsculo, sem espaço nas
 * pontas. "Vale Refeicao", "vale refeição" e "VALE REFEIÇÃO" casam.
 */
export function normalize(value: string | null | undefined): string {
  if (value == null) return ''
  return value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
