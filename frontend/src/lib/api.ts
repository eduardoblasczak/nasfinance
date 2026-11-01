import type {
  ApiError,
  BudgetPace,
  Cashflow,
  CategoryTrends,
  EntrySources,
  RecurringExpenses,
  SpendingCalendar,
  TopMerchants,
} from '@/types'

/**
 * Cliente HTTP da aplicacao.
 *
 * As URLs sao sempre RELATIVAS ("/api/v1/..."). Em desenvolvimento o proxy do
 * Vite encaminha para o Quarkus em :8080; em producao o proprio Quarkus serve
 * o frontend, entao a mesma URL ja aponta para o lugar certo. Nenhuma variavel
 * de ambiente com URL de API, nenhum if de ambiente.
 */

/** Erro de API com o corpo estruturado preservado. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly details: string[]

  constructor(status: number, message: string, details: string[] = []) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.details = details
  }

  /** Mensagem pronta para exibir, incluindo os detalhes quando houver. */
  get fullMessage(): string {
    return this.details.length > 0
      ? `${this.message}: ${this.details.join('; ')}`
      : this.message
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    // fetch so rejeita por falha de rede; erro HTTP vem como resposta normal.
    throw new ApiRequestError(0, 'Nao foi possivel conectar ao servidor')
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  // 204 No Content nao tem corpo: tentar .json() aqui lancaria erro de parse.
  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/**
 * Converte uma resposta de erro no nosso tipo de erro.
 *
 * O corpo pode nao ser JSON (um 502 do proxy devolve HTML, por exemplo),
 * entao o parse fica protegido.
 */
async function toApiError(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as ApiError
    return new ApiRequestError(
      response.status,
      body.message ?? `Erro ${response.status}`,
      body.details ?? [],
    )
  } catch {
    return new ApiRequestError(response.status, `Erro ${response.status} ao chamar a API`)
  }
}

/** Monta query string ignorando valores nulos/vazios. */
export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  // `keepalive` deixa a requisicao terminar mesmo se a aba fechar no meio:
  // e o que a fila usa para confirmar uma acao com "Desfazer" pendente quando
  // a pessoa sai da pagina antes dos 5 s.
  post: <T>(path: string, body?: unknown, options?: { keepalive?: boolean }) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      keepalive: options?.keepalive,
    }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

  delete: <T>(path: string, options?: { keepalive?: boolean }) =>
    request<T>(path, { method: 'DELETE', keepalive: options?.keepalive }),
}

// ------------------------------------------------------------ análises
// Uma função por rota do contrato (ver ANALYTICS.md). Os parâmetros são
// opcionais como na API: omitido, vale o padrão do servidor — o front não
// repete aqui a regra de "mês corrente" nem o tamanho padrão da base.

export function getCategoryTrends(params: { month?: string; baseline?: number } = {}) {
  return api.get<CategoryTrends>(`/api/v1/analytics/categories${buildQuery(params)}`)
}

export function getRecurringExpenses(params: { months?: number } = {}) {
  return api.get<RecurringExpenses>(`/api/v1/analytics/recurring${buildQuery(params)}`)
}

export function getCashflow(params: { months?: number } = {}) {
  return api.get<Cashflow>(`/api/v1/analytics/cashflow${buildQuery(params)}`)
}

// Leva 2 (ver ANALYTICS.md): mesma regra — parâmetro omitido vale o padrão do servidor.

export function getBudgetPace() {
  return api.get<BudgetPace>('/api/v1/analytics/budget-pace')
}

export function getSpendingCalendar(params: { months?: number } = {}) {
  return api.get<SpendingCalendar>(`/api/v1/analytics/calendar${buildQuery(params)}`)
}

export function getTopMerchants(params: { months?: number; limit?: number } = {}) {
  return api.get<TopMerchants>(`/api/v1/analytics/merchants${buildQuery(params)}`)
}

export function getEntrySources(params: { months?: number } = {}) {
  return api.get<EntrySources>(`/api/v1/analytics/sources${buildQuery(params)}`)
}
