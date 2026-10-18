import type { ComponentType } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ReviewPage } from './pages/ReviewPage'
import { InboxIcon, ListIcon, LogoMark, OverviewIcon, SettingsIcon } from './components/ui/icons'
import { usePendingReview } from './hooks/usePendingReview'
import { MoneyVisibilityProvider } from './hooks/useMoneyVisibility'

interface NavItem {
  to: string
  label: string
  end: boolean
  Icon: ComponentType<{ className?: string; active?: boolean }>
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Visão geral', end: true, Icon: OverviewIcon },
  { to: '/lancamentos', label: 'Lançamentos', end: false, Icon: ListIcon },
  { to: '/revisao', label: 'Revisão', end: false, Icon: InboxIcon },
  // "Ajustes", e não "Configuração": é o nome que o iPhone usa, e cabe na
  // tab bar. O mesmo nome no celular e no desktop — a tela não muda de nome
  // conforme a largura.
  { to: '/configuracoes', label: 'Ajustes', end: false, Icon: SettingsIcon },
]

/**
 * O contador só aparece quando há algo — um "0" permanente vira ruído que se
 * aprende a ignorar, e aí o badge perde a função no dia em que importa.
 */
function Badge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[0.75rem] leading-none font-semibold text-void tabular ${className}`}
    >
      <span className="sr-only">, </span>
      {count > 99 ? '99+' : count}
      <span className="sr-only"> para revisar</span>
    </span>
  )
}

/**
 * Desktop e tablet: barra lateral fixa. Sólida, não vidro — ela não flutua
 * sobre o conteúdo, divide a tela com ele.
 */
function Sidebar({ pending }: { pending: number }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ghost/70 bg-void px-3 pt-7 font-ui md:flex">
      {/* A marca é o único lugar que segue em Clash: identidade, não texto
          corrido. O resto da interface nova é a fonte do sistema. */}
      <div className="mb-8 flex items-center gap-2.5 px-3 text-accent">
        <LogoMark className="size-5" />
        <span className="font-display text-[1.0625rem] font-medium tracking-[0.01em] text-fg">nasFinance</span>
      </div>

      <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, label, end, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `press flex min-h-11 items-center gap-3 rounded-[0.625rem] px-3 text-[0.9375rem] ${
                isActive ? 'bg-surface-2 font-semibold text-fg' : 'text-dim hover:bg-surface hover:text-fg'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`size-5 ${isActive ? 'text-accent' : ''}`} active={isActive} />
                <span className="flex-1">{label}</span>
                {to === '/revisao' && <Badge count={pending} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

/**
 * Celular: tab bar flutuante na zona do polegar, no material translúcido.
 * Substitui a navegação de topo de 400 px que vazava da tela de 375.
 *
 * A aba ativa muda ícone (preenchido), cor e fundo ao mesmo tempo: a
 * diferença não pode depender só do verde.
 */
function TabBar({ pending }: { pending: number }) {
  return (
    <nav
      aria-label="Navegação principal"
      className="chrome fixed inset-x-4 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[26rem] rounded-full p-1 font-ui md:hidden"
    >
      {NAV_ITEMS.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `press relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-full ${
              isActive ? 'bg-white/10 text-accent' : 'text-dim'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className="relative">
                <Icon className="size-6" active={isActive} />
                {to === '/revisao' && <Badge count={pending} className="absolute -top-1 -right-3" />}
              </span>
              <span className={`text-[0.75rem] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function App() {
  const pendingReview = usePendingReview()

  return (
    <MoneyVisibilityProvider>
      <div className="min-h-dvh bg-void">
        <Sidebar pending={pendingReview} />

        {/* O recuo de baixo reserva a altura da tab bar mais a área do
            indicador de início: o último item da lista nunca fica atrás dela. */}
        <main className="pt-[env(safe-area-inset-top)] pb-[calc(max(12px,env(safe-area-inset-bottom))+88px)] md:pb-0 md:pl-60">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/lancamentos" element={<TransactionsPage />} />
            <Route path="/revisao" element={<ReviewPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            {/* Rota desconhecida volta para a inicial em vez de renderizar uma
                tela em branco sem explicação. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <TabBar pending={pendingReview} />
      </div>
    </MoneyVisibilityProvider>
  )
}
