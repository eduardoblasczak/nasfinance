import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

/**
 * Alvo do proxy da API durante o desenvolvimento.
 *
 * O padrao 8080 e o `quarkus dev`, que e o loop normal de trabalho. Mas o
 * `docker-compose.yml` local sobe a imagem de producao publicando 8092 — e
 * contra ela o proxy apontaria para uma porta vazia, devolvendo 500 em toda
 * chamada e parecendo um erro do frontend.
 *
 *   VITE_API_TARGET=http://localhost:8092 npm run dev
 */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    // Permite importar como "@/components/Card" em vez de "../../components/Card".
    //
    // Resolvido a partir de import.meta.url, e nao de __dirname: este arquivo e
    // um modulo ES ("type": "module" no package.json), onde __dirname nao existe.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    // Encaminha /api para o Quarkus durante o desenvolvimento.
    //
    // Sem o proxy, o navegador trataria :5173 e :8080 como origens distintas e
    // toda chamada exigiria CORS. Com ele, o frontend chama caminhos relativos
    // ("/api/v1/dashboard") tanto em desenvolvimento quanto em producao — onde
    // o proprio Quarkus serve os arquivos estaticos e nao ha duas portas.
    // Resultado: nenhuma URL de API precisa mudar entre os dois ambientes.
    proxy: {
      // O proxy do Vite ja repassa a resposta em streaming, entao o canal SSE
      // (/api/v1/events/stream) atravessa sem configuracao adicional.
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/q': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // Separa as bibliotecas grandes do codigo da aplicacao: o bundle do
    // Recharts muda raramente, entao o navegador o mantem em cache mesmo
    // quando o app e reconstruido. Importa num servidor caseiro atras de
    // tunel, onde a banda de subida e limitada.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
})
