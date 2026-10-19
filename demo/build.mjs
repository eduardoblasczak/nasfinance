// Monta dist/, o que a Cloudflare serve como arquivo estatico:
//
//   dist/          a landing           (landing/, compilada pelo Vite do frontend)
//   dist/app/      o app REAL          (frontend/, com VITE_BASE=/app/ e VITE_DEMO=true)
//   dist/favicon.* os icones na raiz   (sem eles, cada visita acordaria o Worker para um 404)
//
// O app nao e copiado nem adaptado: e o mesmo codigo do frontend, compilado em
// modo demonstracao (ver frontend/src/lib/demo.ts). Uso: `npm run build`.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = join(here, '..', 'frontend')
const dist = join(here, 'dist')
const distApp = join(dist, 'app')
const vite = join(frontend, 'node_modules', 'vite', 'bin', 'vite.js')

if (!existsSync(vite)) {
  console.error('Vite nao encontrado em frontend/node_modules. Rode `npm ci` em frontend/ antes.')
  process.exit(1)
}

// Esvazia dist/ em vez de apagar a pasta: no Windows, um `wrangler dev` em
// execucao segura a pasta, e o rmdir falha com EBUSY — deixando o build
// anterior no lugar.
mkdirSync(dist, { recursive: true })
for (const entry of readdirSync(dist)) {
  rmSync(join(dist, entry), { recursive: true, force: true, maxRetries: 3 })
}

// Chamado pelo node diretamente, e nao por `npx`: no Windows, `npx` e um .cmd
// e exigiria shell, e o Git Bash ainda converteria "/app/" num caminho do
// Windows sem avisar.
// ---- 1. Landing ----
// Checa os tipos antes: o Vite so transpila, e a landing importa os tipos do
// contrato do frontend — mudou o DTO, a landing para de compilar aqui.
const tsc = join(here, 'node_modules', 'typescript', 'bin', 'tsc')
const typecheck = spawnSync(process.execPath, [tsc, '-p', join(here, 'landing', 'tsconfig.json')], { stdio: 'inherit' })
if (typecheck.status !== 0) {
  console.error(`Tipos da landing com erro (exit ${typecheck.status}).`)
  process.exit(typecheck.status ?? 1)
}

// Pela API do Vite, e nao por um vite.config na landing: a landing nao tem
// node_modules proprio, e um arquivo de config la nao acharia o 'vite' nem o
// plugin do Tailwind. Os dois vem do frontend, as mesmas versoes do app. O
// build do app (npm run build em frontend/) nao muda nada: config, CSS e
// fontes dele sao outros arquivos.
const { build } = await import(pathToFileURL(join(frontend, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const { default: tailwindcss } = await import(
  pathToFileURL(join(frontend, 'node_modules', '@tailwindcss', 'vite', 'dist', 'index.mjs')).href
)
await build({
  root: join(here, 'landing'),
  base: '/',
  configFile: false,
  logLevel: 'warn',
  plugins: [tailwindcss()],
  publicDir: join(here, 'landing', 'public'),
  build: { outDir: dist, emptyOutDir: false, assetsDir: 'assets' },
})

// O favicon.svg tem uma fonte so (o do app); a Clash da marca tambem. Copiados
// para a raiz porque a landing os pede de la.
cpSync(join(frontend, 'public', 'favicon.svg'), join(dist, 'favicon.svg'))
mkdirSync(join(dist, 'fonts'), { recursive: true })
cpSync(join(frontend, 'public', 'fonts', 'clash-500.woff2'), join(dist, 'fonts', 'clash-500.woff2'))

// ---- 2. App ----
const result = spawnSync(process.execPath, [vite, 'build', '--outDir', distApp, '--emptyOutDir'], {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: '/app/', VITE_DEMO: 'true' },
})
if (result.status !== 0) {
  console.error(`Build do app falhou (exit ${result.status}).`)
  process.exit(result.status ?? 1)
}

// O manifest e copiado de frontend/public sem passar pelo Vite, entao continua
// apontando para a raiz — onde na demo mora a landing, nao o app.
const manifestPath = join(distApp, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.name = 'nasFinance — demonstracao'
manifest.start_url = '/app/'
manifest.scope = '/app/'
manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `/app${icon.src}` }))
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

// ---- 3. Cabecalhos de seguranca dos arquivos estaticos ----
// Arquivo estatico nao passa pelo Worker; o `_headers` e o jeito de a
// Cloudflare aplicar cabecalhos neles. Gerado do mesmo security-headers.json
// que o Worker usa (src/index.ts), para as duas camadas nunca divergirem.
const securityHeaders = JSON.parse(readFileSync(join(here, 'security-headers.json'), 'utf8'))
const headerLines = Object.entries({ ...securityHeaders.all, ...securityHeaders.pages }).map(([name, value]) => `  ${name}: ${value}`)
writeFileSync(join(dist, '_headers'), `/*\n${headerLines.join('\n')}\n`)

for (const required of [join(dist, 'index.html'), join(dist, 'favicon.ico'), join(dist, 'favicon.svg'), join(distApp, 'index.html'), join(dist, '_headers')]) {
  if (!existsSync(required)) {
    console.error(`Faltou ${required}`)
    process.exit(1)
  }
}
console.log('dist/ pronto: landing e favicons em /, app em /app/')
