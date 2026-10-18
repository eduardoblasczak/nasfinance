import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiRequestError, buildQuery } from '@/lib/api'
import { formatDayLabel } from '@/lib/format'
import { useReferenceData } from '@/hooks/useReferenceData'
import { useEventStream } from '@/hooks/useEventStream'
import { useToast } from '@/hooks/useToast'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionRow } from '@/components/TransactionRow'
import { PeriodPicker, currentMonthPeriod, type Period } from '@/components/PeriodPicker'
import { PageHeader } from '@/components/ui/PageHeader'
import { Segmented } from '@/components/ui/Segmented'
import { Money } from '@/components/ui/Money'
import { Toast } from '@/components/ui/Toast'
import { ArrowIcon, ChevronDownIcon, PlusIcon } from '@/components/ui/icons'
import { card, secondaryButton } from '@/components/ui/styles'
import type { Flow, PageResponse, Transaction } from '@/types'

const PAGE_SIZE = 25
const UNDO_WINDOW_MS = 5000

/**
 * Lançamentos: tudo o que entrou e saiu, agrupado por dia.
 *
 * A tabela de seis colunas virou lista. Numa tela de 375 a tabela rolava de
 * lado (46 rem de largura mínima) e as ações de editar e excluir dependiam de
 * hover; a lista cabe, lê-se como um extrato de banco e a linha inteira abre
 * o lançamento.
 *
 * Excluir sai da lista na hora e só vai ao servidor depois de 5 s, com
 * Desfazer — o window.confirm interrompia todo o fluxo para proteger o
 * caso raro do toque errado.
 */
export function TransactionsPage() {
  const [period, setPeriod] = useState<Period>(currentMonthPeriod)
  const [flow, setFlow] = useState<Flow | 'ALL'>('ALL')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [page, setPage] = useState(0)

  const [result, setResult] = useState<PageResponse<Transaction> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<number>>(() => new Set())

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { accounts, categories } = useReferenceData()
  const { toast, show, clear } = useToast()
  const pendingDelete = useRef<{ id: number; timer: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = buildQuery({
        from: period.from,
        to: period.to,
        flow: flow === 'ALL' ? null : flow,
        categoryId: categoryId || null,
        accountId: accountId || null,
        page,
        size: PAGE_SIZE,
      })
      setResult(await api.get<PageResponse<Transaction>>(`/api/v1/transactions${query}`))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'O servidor não respondeu.')
    } finally {
      setLoading(false)
    }
  }, [period, flow, categoryId, accountId, page])

  useEffect(() => {
    void load()
  }, [load])

  // Mantém a lista viva quando um lançamento chega pelo Atalho do iPhone
  useEventStream(useCallback(() => void load(), [load]))

  // Qualquer mudança de filtro volta para a primeira página: continuar na
  // página 4 de um resultado que agora tem 2 mostraria uma lista vazia.
  useEffect(() => {
    setPage(0)
  }, [period, flow, categoryId, accountId])

  const unhide = (id: number) =>
    setHidden((set) => {
      const next = new Set(set)
      next.delete(id)
      return next
    })

  // `load` muda a cada troca de filtro, período ou página. Se `flushDelete`
  // dependesse dele, essa troca recriaria o efeito de saída logo abaixo, e a
  // limpeza do efeito antigo enviaria o DELETE na hora — com o toast ainda
  // oferecendo um Desfazer que já não desfazia nada, sobre uma exclusão
  // física. Pelo ref, `flushDelete` fica estável e o efeito só roda ao sair.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  /** Envia a exclusão que estava na janela do Desfazer. */
  const flushDelete = useCallback(
    (keepalive = false) => {
      const current = pendingDelete.current
      if (!current) return
      window.clearTimeout(current.timer)
      pendingDelete.current = null
      // Enviou, não dá mais para desfazer: o botão some junto.
      clear()
      api
        .delete(`/api/v1/transactions/${current.id}`, { keepalive })
        .then(() => loadRef.current())
        .catch((err: unknown) => {
          unhide(current.id)
          show(
            {
              text: err instanceof ApiRequestError ? err.fullMessage : 'Não deu para excluir. O lançamento voltou.',
              tone: 'error',
            },
            5000,
          )
        })
    },
    [show, clear],
  )

  // Sair da tela com um Desfazer aberto confirma a exclusão. `visibilitychange`
  // além de `pagehide`: instalado na tela inicial do iPhone, o app vai para
  // segundo plano sem `pagehide`, e se for encerrado no seletor de apps a
  // exclusão anunciada nunca sairia.
  useEffect(() => {
    const onPageHide = () => flushDelete(true)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushDelete(true)
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      flushDelete()
    }
  }, [flushDelete])

  function requestDelete(transaction: Transaction) {
    flushDelete()
    setFormOpen(false)
    setEditing(null)
    setHidden((set) => new Set(set).add(transaction.id))
    const timer = window.setTimeout(() => flushDelete(), UNDO_WINDOW_MS)
    pendingDelete.current = { id: transaction.id, timer }
    show(
      {
        text: 'Lançamento excluído',
        onUndo: () => {
          if (pendingDelete.current?.id !== transaction.id) return
          window.clearTimeout(pendingDelete.current.timer)
          pendingDelete.current = null
          unhide(transaction.id)
          clear()
        },
      },
      UNDO_WINDOW_MS,
    )
  }

  const visible = useMemo(() => (result?.items ?? []).filter((item) => !hidden.has(item.id)), [result, hidden])

  // Agrupado por dia, com o saldo do dia. Direção pelo flow, nunca pelo
  // sinal do amount — o sinal inverte entre conta e cartão (ver CLAUDE.md).
  const days = useMemo(() => {
    const groups: { date: string; items: Transaction[]; net: number }[] = []
    for (const item of visible) {
      let group = groups.at(-1)
      if (!group || group.date !== item.occurredOn) {
        group = { date: item.occurredOn, items: [], net: 0 }
        groups.push(group)
      }
      group.items.push(item)
      group.net += item.flow === 'EXPENSE' ? -Math.abs(item.amount) : Math.abs(item.amount)
    }
    return groups
  }, [visible])

  const filtered = flow !== 'ALL' || categoryId !== '' || accountId !== ''
  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const summary = loading && !result ? (
    <span className="inline-block h-[1.375rem] w-48 animate-pulse rounded-md bg-surface-2 align-middle" />
  ) : result ? (
    <>
      <span className="font-semibold text-fg tabular">{result.total}</span>{' '}
      {result.total === 1 ? 'lançamento' : 'lançamentos'} · {period.label.toLowerCase()}
    </>
  ) : null

  return (
    <>
      <div className="enter mx-auto max-w-[45rem] px-4 font-ui md:px-10 md:pb-16">
        <PageHeader
          title="Lançamentos"
          summary={summary}
          action={
            <button type="button" onClick={openNew} aria-label="Novo lançamento" className="press flex size-11 items-center justify-center rounded-full bg-accent text-void hover:bg-accent/90">
              <PlusIcon />
            </button>
          }
        />

        {/* ============ FILTROS ============ */}
        <div className="mb-6 space-y-3">
          <Segmented
            label="Tipo"
            value={flow}
            onChange={setFlow}
            options={[
              { value: 'ALL', label: 'Tudo' },
              { value: 'EXPENSE', label: 'Despesas' },
              { value: 'INCOME', label: 'Receitas' },
            ]}
            className="flex w-full md:w-auto"
          />
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker value={period} onChange={setPeriod} />
            <FilterSelect
              label="Conta"
              value={accountId}
              onChange={setAccountId}
              allLabel="Todas as contas"
              options={accounts.map((account) => ({ value: String(account.id), label: account.name }))}
            />
            <FilterSelect
              label="Categoria"
              value={categoryId}
              onChange={setCategoryId}
              allLabel="Todas as categorias"
              options={categories
                .filter((category) => flow === 'ALL' || category.flow === flow)
                .map((category) => ({ value: String(category.id), label: category.name }))}
            />
          </div>
        </div>

        {error && result && (
          <p role="alert" className="mb-6 rounded-[var(--radius-inset)] bg-negative/12 px-4 py-3 text-[0.9375rem] text-fg">
            Não deu para atualizar a lista. {error}
          </p>
        )}

        {/* ============ LISTA ============ */}
        {loading && !result ? (
          <ListSkeleton />
        ) : !result ? (
          <div className={`${card} px-6 py-10 text-center`}>
            <p className="text-[1.0625rem] font-semibold text-fg">Os lançamentos não carregaram</p>
            <p className="mx-auto mt-2 max-w-[22rem] text-[0.9375rem] text-dim">{error}</p>
            <button type="button" onClick={() => void load()} className={`${secondaryButton} mt-6`}>
              Tentar de novo
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className={`${card} px-6 py-10 text-center`}>
            <p className="text-[1.0625rem] font-semibold text-fg">
              {filtered ? 'Nada com esses filtros' : 'Nenhum lançamento no período'}
            </p>
            <p className="mx-auto mt-2 max-w-[22rem] text-[0.9375rem] text-dim">
              {filtered
                ? 'Tente outro tipo, conta ou categoria.'
                : 'O que você registrar aqui, pelo Atalho do iPhone ou pelo banco, aparece nesta lista.'}
            </p>
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setFlow('ALL')
                  setAccountId('')
                  setCategoryId('')
                }}
                className={`${secondaryButton} mt-6`}
              >
                Limpar filtros
              </button>
            ) : (
              <button type="button" onClick={openNew} className={`${secondaryButton} mt-6`}>
                Registrar lançamento
              </button>
            )}
          </div>
        ) : (
          <div className={`space-y-6 transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {days.map((day) => (
              <section key={day.date} aria-labelledby={`tx-day-${day.date}`}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 id={`tx-day-${day.date}`} className="text-[0.9375rem] font-semibold text-fg">
                    {formatDayLabel(day.date)}
                  </h2>
                  <Money
                    value={day.net}
                    sign={day.net < 0 ? '-' : day.net > 0 ? '+' : 'none'}
                    className="text-[0.875rem] text-faint"
                  />
                </div>
                <ul className={`${card} divide-y divide-separator overflow-hidden`}>
                  {day.items.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onSelect={() => {
                        setEditing(transaction)
                        setFormOpen(true)
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {result && result.totalPages > 1 && (
          <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              disabled={result.page === 0}
              className={secondaryButton}
            >
              <ArrowIcon direction="left" className="size-4" />
              Anterior
            </button>
            <p className="text-[0.875rem] text-faint tabular">
              Página {result.page + 1} de {result.totalPages}
            </p>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={result.page >= result.totalPages - 1}
              className={secondaryButton}
            >
              Próxima
              <ArrowIcon direction="right" className="size-4" />
            </button>
          </nav>
        )}

        <TransactionForm
          open={formOpen}
          editing={editing}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSaved={() => void load()}
          onDelete={requestDelete}
        />
      </div>

      <Toast toast={toast} />
    </>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  allLabel: string
  options: Array<{ value: string; label: string }>
}

/**
 * Filtro em cápsula sobre o <select> nativo — a roda do iPhone de graça. A
 * cápsula mostra o nome escolhido e fica verde quando o filtro está ativo:
 * filtro esquecido ligado é a causa número um de "sumiu um lançamento".
 */
function FilterSelect({ label, value, onChange, allLabel, options }: FilterSelectProps) {
  const selected = options.find((option) => option.value === value)
  return (
    <label
      className={`press relative inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full pr-3 pl-4 has-[select:focus-visible]:outline-1 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent ${
        selected ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-fg hover:bg-white/12'
      }`}
    >
      <span className="truncate text-[0.9375rem] font-semibold">{selected?.label ?? label}</span>
      <ChevronDownIcon className="size-4 shrink-0 opacity-70" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Filtrar por ${label.toLowerCase()}`}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full text-base opacity-0"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-6">
      {[3, 2].map((rows, index) => (
        <div key={index}>
          <div className="mb-2 h-5 w-24 animate-pulse rounded-md bg-surface-2" />
          <div className={`${card} divide-y divide-separator`}>
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="h-[3.75rem] animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
