import type { DemoStore } from './store'

/** Bindings declarados em wrangler.jsonc. */
export interface Env {
  DEMO: DurableObjectNamespace<DemoStore>
  ASSETS: Fetcher
  /**
   * Contador de rajada por IP, na borda. Opcional de propósito: a
   * documentação não diz se o binding existe no plano gratuito. Sem ele, o
   * limite exato do Durable Object continua valendo sozinho.
   */
  BURST?: RateLimit
}
