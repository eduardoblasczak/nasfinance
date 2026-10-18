import type { DemoStore } from './store'

/** Bindings declarados em wrangler.jsonc. */
export interface Env {
  DEMO: DurableObjectNamespace<DemoStore>
  ASSETS: Fetcher
}
