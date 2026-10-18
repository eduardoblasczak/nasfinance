// Monta dist/, o que a Cloudflare serve como arquivo estatico:
//
//   dist/          a landing           (copiada de landing/)
//   dist/app/      o app REAL          (frontend/, com VITE_BASE=/app/ e VITE_DEMO=true)
//
// O app nao e copiado nem adaptado: e o mesmo codigo do frontend, compilado em
// modo demonstracao (ver frontend/src/lib/demo.ts). Uso: `npm run build`.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const result = spawnSync(process.execPath, [vite, 'build', '--outDir', distApp, '--emptyOutDir'], {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: '/app/', VITE_DEMO: 'true' },
})
if (result.status !== 0) {
  console.error(`Build do app falhou (exit ${result.status}).`)
  process.exit(result.status ?? 1)
}

cpSync(join(here, 'landing'), dist, { recursive: true })

// O manifest e copiado de frontend/public sem passar pelo Vite, entao continua
// apontando para a raiz — onde na demo mora a landing, nao o app.
const manifestPath = join(distApp, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.name = 'nasFinance — demonstracao'
manifest.start_url = '/app/'
manifest.scope = '/app/'
manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `/app${icon.src}` }))
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

for (const required of [join(dist, 'index.html'), join(distApp, 'index.html')]) {
  if (!existsSync(required)) {
    console.error(`Faltou ${required}`)
    process.exit(1)
  }
}
console.log('dist/ pronto: landing em /, app em /app/')
