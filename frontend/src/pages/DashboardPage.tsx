import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '@/hooks/useDashboard'
import { PeriodPicker, currentMonthPeriod, type Period } from '@/components/PeriodPicker'
import { CategoryBreakdown } from '@/components/CategoryBreakdown'
import { AccountBalances } from '@/components/AccountBalances'
import { TransactionRow } from '@/components/TransactionRow'
import { TransactionForm } from '@/components/TransactionForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Money } from '@/components/ui/Money'
import { ChevronRightIcon, PlusIcon, RefreshIcon } from '@/components/ui/icons'
import { card, quietButton, secondaryButton, sectionTitle } from '@/components/ui/styles'
import { formatPercent } from '@/lib/format'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import type { Transaction } from '@/types'

// O Recharts pesa ~360 kB e só este gráfico o usa. Carregado sob demanda, as
// outras três telas abrem sem esperar por ele, e aqui o resto da tela já
// aparece enquanto o gráfico chega — num esqueleto da mesma altura.
const SpendingTrendChart = lazy(() => import('@/components/SpendingTrendChart'))

/**
 * Visão geral: quanto sobrou no período, e de onde veio e para onde foi.
 *
 * A constelação 3D que ficava atrás do saldo saiu: era um canvas animado a
 * cada quadro (bateria no celular), não respondia pergunta nenhuma que as
 * barras de categoria não respondessem melhor, e disputava o olhar com o
 * número principal. A tela agora é densa no estilo Wallet/Stocks — um número
 * protagonista e listas agrupadas logo abaixo.
 */
export function DashboardPage() {
  const [period, setPeriod] = useState<Period>(currentMonthPeriod)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { data, loading, error, refreshing, reload, streamStatus } = useDashboard(period.from, period.to)

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

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  // O estado do canal precisa ser visível: se ele cair, os números param de
  // se atualizar sozinhos, e quem olha precisa saber antes de confiar neles.
  const live =
    streamStatus === 'open' ? (
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
        Ao vivo
      </span>
    ) : (
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full ring-2 ring-faint ring-inset" aria-hidden="true" />
        Sem atualização automática
      </span>
    )

  return (
    <div className="enter mx-auto max-w-[72rem] px-4 font-ui md:px-10 md:pb-16">
      <PageHeader
        title="Visão geral"
        summary={live}
        action={
          <button type="button" onClick={openNew} aria-label="Novo lançamento" className="press flex size-11 items-center justify-center rounded-full bg-accent text-void hover:bg-accent/90">
            <PlusIcon />
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <PeriodPicker value={period} onChange={setPeriod} />
        {/* Recarregar só aparece quando o tempo real caiu: com o canal aberto
            os números já se atualizam sozinhos, e o botão seria ruído. */}
        {streamStatus !== 'open' && (
          <button type="button" onClick={reload} className={quietButton}>
            <RefreshIcon className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        )}
      </div>

      {error && data && (
        <p role="alert" className="mb-6 rounded-[var(--radius-inset)] bg-negative/12 px-4 py-3 text-[0.9375rem] text-fg">
          Não deu para atualizar agora; os números abaixo são da última leitura. {error}
        </p>
      )}

      {loading && !data ? (
        <DashboardSkeleton />
      ) : !data ? (
        <div className={`${card} px-6 py-10 text-center`}>
          <p className="text-[1.0625rem] font-semibold text-fg">A visão geral não carregou</p>
          <p className="mx-auto mt-2 max-w-[22rem] text-[0.9375rem] text-dim">{error ?? 'O servidor não respondeu.'}</p>
          <button type="button" onClick={reload} className={`${secondaryButton} mt-6`}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          {/* ============ O NÚMERO ============ */}
          <section aria-label="Resumo do período" className="mb-8">
            <p className="text-[0.9375rem] text-dim">Saldo · {period.label.toLowerCase()}</p>
            <Money
              value={data.balance}
              sign={data.balance < 0 ? '-' : 'none'}
              negative={data.balance < 0}
              className="mt-1 block text-[2.75rem] leading-[1.1] font-bold tracking-[-0.025em] text-fg md:text-[3.5rem]"
            />

            <div className="mt-5 grid grid-cols-2 gap-2.5 md:max-w-[34rem]">
              <Stat label="Entrou">
                <Money value={data.totalIncome} sign="+" />
              </Stat>
              <Stat label="Saiu" delta={data.comparisonPct}>
                <Money value={data.totalExpense} sign="-" />
              </Stat>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* min-w-0: item de grid cresce até o conteúdo por padrão, e o
                gráfico responsivo media a largura dele mesmo — vazava 24 px
                da tela de 375. */}
            <div className="min-w-0 space-y-8">
              <Section title="Ritmo de gasto">
                <div className={`${card} px-2 pt-3 pb-1`}>
                  <Suspense fallback={<div className="h-[13rem] animate-pulse rounded-[var(--radius-inset)] bg-surface-2" aria-hidden="true" />}>
                    <SpendingTrendChart series={data.dailySeries} />
                  </Suspense>
                </div>
              </Section>

              <Section title="Por categoria">
                <div className={card}>
                  <CategoryBreakdown slices={data.expenseByCategory} />
                </div>
              </Section>
            </div>

            <div className="min-w-0 space-y-8">
              <Section title="Contas">
                <div className={card}>
                  <AccountBalances balances={data.accountBalances} />
                </div>
              </Section>

              <Section
                title="Últimos lançamentos"
                aside={
                  <Link to="/lancamentos" className={`${quietButton} -mr-3 text-accent`}>
                    Ver todos
                    <ChevronRightIcon />
                  </Link>
                }
              >
                <div className={card}>
                  {data.recentTransactions.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-[0.9375rem] text-dim">Nenhum lançamento neste período.</p>
                      <button type="button" onClick={openNew} className={`${secondaryButton} mt-4`}>
                        Registrar lançamento
                      </button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-separator">
                      {data.recentTransactions.map((transaction) => (
                        <TransactionRow
                          key={transaction.id}
                          transaction={transaction}
                          showDate
                          flash={flashId === transaction.id}
                          onSelect={() => {
                            setEditing(transaction)
                            setFormOpen(true)
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </Section>
            </div>
          </div>
        </>
      )}

      <TransactionForm
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={reload}
      />
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3 px-1">
        <h2 className={sectionTitle}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * Entrou / Saiu. A variação usa seta + sinal + palavra, nunca só cor: em
 * despesa, subir é ruim — o vermelho reforça, mas "↑ 12%" já diz sozinho.
 */
function Stat({ label, delta, children }: { label: string; delta?: number | null; children: ReactNode }) {
  const { hidden } = useMoneyVisibility()
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta)
  const flat = hasDelta && Math.abs(delta) < 0.05
  const up = hasDelta && delta > 0

  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-[0.8125rem] font-semibold text-dim">{label}</p>
      <p className="mt-0.5 text-[1.25rem] font-semibold">{children}</p>
      {/* Oculto, a variação também some: "↑ 150%" conta quase tanto quanto
          o valor. Fica o "••" para a altura do card não mudar. */}
      {hasDelta && hidden && (
        <p className="mt-0.5 text-[0.8125rem] text-faint">
          <span aria-hidden="true">••</span>
          <span className="sr-only">variação oculta</span>
          <span> vs. anterior</span>
        </p>
      )}
      {hasDelta && !hidden && (
        <p className={`mt-0.5 text-[0.8125rem] tabular ${flat ? 'text-faint' : up ? 'text-negative' : 'text-accent'}`}>
          {flat ? '→' : up ? '↑' : '↓'} {formatPercent(delta)}
          <span className="text-faint"> vs. anterior</span>
        </p>
      )}
    </div>
  )
}

/** Esqueleto com a geometria do conteúdo real: nada salta quando os dados chegam. */
function DashboardSkeleton() {
  const block = 'animate-pulse rounded-[var(--radius-card)] bg-surface'
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="mb-8">
        <div className="h-5 w-40 animate-pulse rounded-md bg-surface-2" />
        <div className="mt-2 h-12 w-64 animate-pulse rounded-lg bg-surface-2" />
        <div className="mt-5 grid grid-cols-2 gap-2.5 md:max-w-[34rem]">
          <div className={`${block} h-[5.5rem]`} />
          <div className={`${block} h-[5.5rem]`} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className={`${block} h-[15rem]`} />
        <div className={`${block} h-[15rem]`} />
      </div>
    </div>
  )
}
