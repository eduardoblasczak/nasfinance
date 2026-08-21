import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { LayoutDashboard, Receipt, Wallet } from 'lucide-react'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'

const NAV_ITEMS = [
  { to: '/', label: 'Visao geral', icon: LayoutDashboard, end: true },
  { to: '/lancamentos', label: 'Lancamentos', icon: Receipt, end: false },
]

export function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-hairline bg-page/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Wallet className="size-5 text-series-1" aria-hidden="true" />
            <span className="text-sm font-semibold text-ink">nasFinance</span>
          </div>

          <nav aria-label="Navegacao principal" className="flex gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-raised text-ink'
                      : 'text-ink-muted hover:bg-raised/60 hover:text-ink-soft'
                  }`
                }
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/lancamentos" element={<TransactionsPage />} />
          {/* Qualquer rota desconhecida volta para a inicial em vez de
              renderizar uma tela em branco sem explicacao. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
