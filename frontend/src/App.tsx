import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { LogoMark } from './components/ui/icons'

const NAV_ITEMS = [
  { to: '/', label: 'Visão geral', end: true },
  { to: '/lancamentos', label: 'Lançamentos', end: false },
]

export function App() {
  return (
    <div className="min-h-full bg-void">
      <header className="relative z-20 border-b border-ghost/60">
        <div className="mx-auto flex max-w-[1200px] items-center gap-10 px-8 py-5 sm:px-12">
          {/* A marca é o único lugar que usa Clash — a fonte de display do
              portfólio. É o trabalho certo para ela: identidade, não texto
              corrido nem número. O resto da interface é Satoshi (prosa) e
              Mono (dados). */}
          <div className="flex items-center gap-2.5 text-accent">
            <LogoMark />
            <span className="font-display text-base font-medium tracking-[0.02em] text-fg">
              nasFinance
            </span>
          </div>

          <nav aria-label="Navegação principal" className="flex gap-6">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `border-b py-1.5 font-mono text-2xs tracking-[0.12em] uppercase transition-colors duration-400 ${
                    isActive
                      ? 'border-accent text-fg'
                      : 'border-transparent text-faint hover:text-dim'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/lancamentos" element={<TransactionsPage />} />
        {/* Rota desconhecida volta para a inicial em vez de renderizar uma
            tela em branco sem explicação. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
