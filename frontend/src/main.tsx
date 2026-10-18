import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './index.css'

// Em produção o app mora na raiz; na demonstração pública, em /app/. O Vite
// entrega o `base` do build em BASE_URL, sempre com barra no fim.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Elemento #root nao encontrado em index.html')
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
