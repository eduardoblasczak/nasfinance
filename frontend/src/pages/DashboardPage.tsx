import { useState } from 'react'
import { Plus, RefreshCw, WifiOff, AlertCircle } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { PeriodPicker, currentMonthPeriod, type Period } from '@/components/PeriodPicker'
import { StatTile } from '@/components/StatTile'
import { CategoryBarChart } from '@/components/CategoryBarChart'
import { SpendingTrendChart } from '@/components/SpendingTrendChart'
import { AccountBalances } from '@/components/AccountBalances'
import { RecentTransactions } from '@/components/RecentTransactions'
import { TransactionForm } from '@/components/TransactionForm'
import { formatCurrency } from '@/lib/format'

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>(currentMonthPeriod)
  const [formOpen, setFormOpen] = useState(false)

  const { data, loading, error, refreshing, reload, streamStatus } = useDashboard(
    period.from,
    period.to,
  )

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Visao geral</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {data
              ? `${data.transactionCount} lancamento(s) no periodo`
              : 'Carregando periodo...'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* O estado da conexao em tempo real precisa ser visivel: se o SSE
              cair, os numeros param de se atualizar sozinhos, e o usuario
              precisa saber disso em vez de confiar num dado congelado. */}
          {streamStatus !== 'open' && (
            <span
              className="flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink-muted"
              title="A atualizacao automatica esta indisponivel; use o botao de recarregar"
            >
              <WifiOff className="size-3.5" aria-hidden="true" />
              Offline
            </span>
          )}

          <button
            type="button"
            onClick={reload}
            aria-label="Recarregar"
            className="rounded-lg border border-hairline p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-series-1 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" aria-hidden="true" />
            Novo lancamento
          </button>
        </div>
      </header>

      <PeriodPicker value={period} onChange={setPeriod} />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-critical/40 bg-critical/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
          <div>
            <p className="text-sm text-ink">Nao foi possivel carregar o dashboard</p>
            <p className="mt-0.5 text-xs text-ink-muted">{error}</p>
          </div>
        </div>
      )}

      {loading && !data ? (
        <SkeletonDashboard />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Despesas"
              value={data.totalExpense}
              deltaPct={data.comparisonPct}
              higherIsBetter={false}
              hint={`Periodo anterior: ${formatCurrency(data.previousExpense)}`}
            />
            <StatTile label="Receitas" value={data.totalIncome} higherIsBetter />
            <StatTile
              label="Saldo do periodo"
              value={data.balance}
              higherIsBetter
              hint="Receitas menos despesas"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <SpendingTrendChart series={data.dailySeries} />
            </div>
            <div className="lg:col-span-2">
              <CategoryBarChart slices={data.expenseByCategory} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AccountBalances balances={data.accountBalances} />
            <RecentTransactions transactions={data.recentTransactions} />
          </div>
        </>
      ) : null}

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  )
}

/**
 * Esqueleto de carregamento com a MESMA geometria do conteudo real.
 *
 * Um spinner centralizado faria a pagina inteira saltar quando os dados
 * chegassem. Reservar o espaco final elimina esse deslocamento.
 */
function SkeletonDashboard() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-hairline bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-80 animate-pulse rounded-xl border border-hairline bg-surface lg:col-span-3" />
        <div className="h-80 animate-pulse rounded-xl border border-hairline bg-surface lg:col-span-2" />
      </div>
    </div>
  )
}
