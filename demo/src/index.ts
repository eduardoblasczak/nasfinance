/**
 * Ponto de entrada do Worker da demonstração.
 *
 * Só chega aqui o que não é arquivo: a Cloudflare serve a landing e o app
 * direto do armazenamento estático, antes do Worker e fora da cota diária
 * (ver wrangler.jsonc). Sobram dois casos:
 *
 *   /api/...   a API espelho, toda no Durable Object — leitura pela
 *              `guardRead`, escrita pela `fence`, as duas antes de acordá-lo
 *   /app/...   link profundo do app (/app/lancamentos), que não é arquivo —
 *              responde com o index.html do app e o roteador assume dali
 */
import type { Env } from './env'
import { IGNORED_HEADER, fence, guardRead } from './fence'
import securityHeaders from '../security-headers.json'

export { DemoStore } from './store'

export default {
  async fetch(request, env): Promise<Response> {
    const [response, page] = await route(request, env)
    return secured(response, page)
  },
} satisfies ExportedHandler<Env>

async function route(request: Request, env: Env): Promise<[Response, boolean]> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/api/')) {
    // Um objeto só, sempre o mesmo nome: todo visitante vê o mesmo feed.
    const store = env.DEMO.get(env.DEMO.idFromName('demo'))

    if (request.method === 'GET' || request.method === 'HEAD') {
      const rejected = await guardRead(request, env)
      return [rejected ?? (await store.fetch(request)), false]
    }

    // Escrita passa pela cerca antes de acordar o objeto.
    const result = await fence(request, env, url.pathname.replace(/\/+$/, ''))
    if ('reject' in result) return [result.reject, false]

    const response = await store.fetch(result.pass)
    if (result.ignored.length === 0) return [response, false]
    // Quem testa pelo Postman e manda `description` precisa saber por que ela
    // não voltou na resposta.
    const annotated = new Response(response.body, response)
    annotated.headers.set(IGNORED_HEADER, result.ignored.join(', '))
    return [annotated, false]
  }

  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
    // Pede /app/ e não /app/index.html: o armazenamento estático redireciona
    // index.html para a pasta, e o redirecionamento jogaria o visitante para a
    // tela inicial em vez da que ele abriu.
    return [await env.ASSETS.fetch(new Request(new URL('/app/', url), request)), true]
  }

  return [new Response('Nao encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }), false]
}

/**
 * Os mesmos cabeçalhos que o build grava em dist/_headers para os arquivos
 * estáticos (fonte única: security-headers.json). Resposta gerada pelo Worker
 * não passa pelo `_headers`, então eles são aplicados aqui também; a CSP e
 * as outras regras de página só onde a resposta é uma página.
 */
function secured(response: Response, page: boolean): Response {
  const result = new Response(response.body, response)
  for (const [name, value] of Object.entries(securityHeaders.all)) result.headers.set(name, value)
  if (page) for (const [name, value] of Object.entries(securityHeaders.pages)) result.headers.set(name, value)
  return result
}
