import { useEffect, useRef, useState } from 'react'
import { useDashboard } from '@/hooks/useDashboard'
import { PeriodPicker, currentMonthPeriod, type Period } from '@/components/PeriodPicker'
import { Constellation } from '@/components/Constellation'
import { StatTile } from '@/components/StatTile'
import { CategoryBarChart } from '@/components/CategoryBarChart'
import { SpendingTrendChart } from '@/components/SpendingTrendChart'
import { AccountBalances } from '@/components/AccountBalances'
import { RecentTransactions } from '@/components/RecentTransactions'
import { TransactionForm } from '@/components/TransactionForm'
import { RefreshIcon } from '@/components/ui/icons'
import { formatCurrency, formatPercent } from '@/lib/format'

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>(currentMonthPeriod)
  const [formOpen, setFormOpen] = useState(false)
  const [highlight, setHighlight] = useState<number | null>(null)

  const { data, loading, error, refreshing, reload, streamStatus } = useDashboard(
    period.from,
    period.to,
  )

  // Detecta o lançamento que acabou de chegar para destacá-lo por um instante.
  // Sem isso a tela muda sozinha e o usuário não percebe o que mudou.
  const [flashId, setFlashId] = useState<number | null>(null)
  const knownIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!data) return
    const incoming = data.recentTransactions.map((transaction) => transaction.id)

    if (knownIds.current.size > 0) {
      const fresh = incoming.find((id) => !knownIds.current.has(id))
      if (fresh !== undefined) {
        setFlashId(fresh)
        const timer = setTimeout(() => setFlashId(null), 2000)
        knownIds.current = new Set(incoming)
        return () => clearTimeout(timer)
      }
    }
    knownIds.current = new Set(incoming)
  }, [data])

  // Trocar de período invalida o destaque: o índice apontaria para outra
  // categoria depois que a lista for reordenada.
  useEffect(() => {
    setHighlight(null)
  }, [period])

  const balance = data?.balance ?? 0

  return (
    <div className="relative overflow-hidden">
      {/* A constelação vive atrás de tudo, alimentada pelas categorias reais. */}
      {data && (
        <Constellation slices={data.expenseByCategory} highlight={highlight} centerY={380} />
      )}

      <div className="relative z-10 mx-auto max-w-[1200px] px-8 pb-24 sm:px-12">
        {/* ============ HERO ============ */}
        <div className="rise max-w-[620px] pt-24 pb-16">
          <div className="eyebrow mb-5">
            saldo · {period.label.toLowerCase()}
          </div>

          <p
            className="font-mono text-[clamp(3rem,8vw,6.5rem)] leading-[0.92] font-light tracking-[-0.045em] tabular"
            style={{ color: balance < 0 ? '#e66767' : '#f0f0f0' }}
          >
            {loading && !data ? '—' : formatCurrency(balance)}
          </p>

          {data && (
            <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
              {data.comparisonPct !== null ? (
                <>
                  <span
                    className="font-mono tabular"
                    style={{ color: data.comparisonPct > 0 ? '#e66767' : '#25d98a' }}
                  >
                    {data.comparisonPct > 0 ? '↑' : '↓'} {formatPercent(data.comparisonPct)}
                  </span>
                  <span className="text-faint">em despesas contra o período anterior</span>
                </>
              ) : (
                <span className="text-faint">
                  {data.transactionCount} lançamento(s) no período
                </span>
              )}
            </div>
          )}
        </div>

        {/* ============ CONTROLES ============ */}
        <div className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <PeriodPicker value={period} onChange={setPeriod} />

          <div className="flex items-center gap-3">
            {/* O estado da conexão precisa ser visível: se o canal cair, os
                números param de se atualizar sozinhos e o usuário precisa
                saber disso em vez de confiar num dado congelado. */}
            <span className="flex items-center gap-2" title={
              streamStatus === 'open'
                ? 'Atualizando em tempo real'
                : 'Atualização automática indisponível — use o botão recarregar'
            }>
              <span
                className={`size-[5px] rounded-full ${streamStatus === 'open' ? 'pulse bg-accent' : 'bg-faint'}`}
              />
              <span className="eyebrow">
                {streamStatus === 'open' ? 'ao vivo' : 'offline'}
              </span>
            </span>

            <button
              type="button"
              onClick={reload}
              aria-label="Recarregar"
              className="flex size-11 items-center justify-center border border-border text-faint transition-colors duration-400 hover:border-faint hover:text-fg"
            >
              <RefreshIcon className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-8 border border-negative/40 bg-negative/10 px-5 py-4 text-sm text-fg">
            {error}
          </p>
        )}

        {loading && !data ? (
          <SkeletonDashboard />
        ) : data ? (
          <>
            {/* ============ INDICADORES ============ */}
            <div className="mb-16 grid gap-px border border-ghost bg-ghost sm:grid-cols-3">
              <StatTile
                label="despesas"
                value={data.totalExpense}
                deltaPct={data.comparisonPct}
                higherIsBetter={false}
                hint={`anterior: ${formatCurrency(data.previousExpense)}`}
              />
              <StatTile label="receitas" value={data.totalIncome} higherIsBetter />
              <StatTile
                label="lançamentos"
                value={data.transactionCount}
                currency={false}
                hint="registros no período"
              />
            </div>

            {/* ============ GRÁFICOS ============ */}
            <div className="mb-7 grid gap-7 lg:grid-cols-[1.45fr_1fr]">
              <SpendingTrendChart series={data.dailySeries} />
              <CategoryBarChart
                slices={data.expenseByCategory}
                highlight={highlight}
                onHighlight={setHighlight}
              />
            </div>

            {/* ============ CONTAS + LANÇAMENTOS ============ */}
            <div className="grid gap-7 lg:grid-cols-[1fr_1.45fr]">
              <AccountBalances balances={data.accountBalances} />
              <RecentTransactions
                transactions={data.recentTransactions}
                flashId={flashId}
                onNew={() => setFormOpen(true)}
              />
            </div>
          </>
        ) : null}
      </div>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  )
}

/**
 * Esqueleto com a MESMA geometria do conteúdo real.
 *
 * Um spinner centralizado faria a página inteira saltar quando os dados
 * chegassem. Reservar o espaço final elimina esse deslocamento.
 */
function SkeletonDashboard() {
  return (
    <div className="space-y-7" aria-busy="true" aria-label="Carregando">
      <div className="grid gap-px border border-ghost bg-ghost sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-32 animate-pulse bg-void" />
        ))}
      </div>
      <div className="grid gap-7 lg:grid-cols-[1.45fr_1fr]">
        <div className="h-96 animate-pulse border border-ghost" />
        <div className="h-96 animate-pulse border border-ghost" />
      </div>
    </div>
  )
}
