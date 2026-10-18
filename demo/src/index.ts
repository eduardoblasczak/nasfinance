/**
 * Ponto de entrada do Worker da demonstração.
 *
 * Só chega aqui o que não é arquivo: a Cloudflare serve a landing e o app
 * direto do armazenamento estático, antes do Worker e fora da cota diária
 * (ver wrangler.jsonc). Sobram dois casos:
 *
 *   /api/...   a API espelho, toda no Durable Object
 *   /app/...   link profundo do app (/app/lancamentos), que não é arquivo —
 *              responde com o index.html do app e o roteador assume dali
 */
import type { Env } from './env'

export { DemoStore } from './store'

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      // Um objeto só, sempre o mesmo nome: todo visitante vê o mesmo feed.
      const store = env.DEMO.get(env.DEMO.idFromName('demo'))
      return store.fetch(request)
    }

    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
      // Pede /app/ e não /app/index.html: o armazenamento estático
      // redireciona index.html para a pasta, e o redirecionamento jogaria o
      // visitante para a tela inicial em vez da que ele abriu.
      return env.ASSETS.fetch(new Request(new URL('/app/', url), request))
    }

    return new Response('Nao encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  },
} satisfies ExportedHandler<Env>
