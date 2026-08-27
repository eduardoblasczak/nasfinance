import { useCallback, useEffect, useState } from 'react'
import { api, ApiRequestError, buildQuery } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { useReferenceData } from '@/hooks/useReferenceData'
import { useEventStream } from '@/hooks/useEventStream'
import { TransactionForm } from '@/components/TransactionForm'
import { PeriodPicker, currentMonthPeriod, type Period } from '@/components/PeriodPicker'
import { ArrowIcon, EditIcon, PhoneIcon, TrashIcon } from '@/components/ui/icons'
import type { Flow, PageResponse, Transaction } from '@/types'

const PAGE_SIZE = 25

export function TransactionsPage() {
  const [period, setPeriod] = useState<Period>(currentMonthPeriod)
  const [flow, setFlow] = useState<Flow | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [page, setPage] = useState(0)

  const [result, setResult] = useState<PageResponse<Transaction> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { accounts, categories } = useReferenceData()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = buildQuery({
        from: period.from,
        to: period.to,
        flow: flow || null,
        categoryId: categoryId || null,
        accountId: accountId || null,
        page,
        size: PAGE_SIZE,
      })
      setResult(await api.get<PageResponse<Transaction>>(`/api/v1/transactions${query}`))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao carregar')
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

  async function handleDelete(transaction: Transaction) {
    const label = transaction.description || transaction.categoryName || 'este lançamento'
    if (!window.confirm(`Excluir ${label} (${formatCurrency(transaction.amount)})?`)) return

    try {
      await api.delete(`/api/v1/transactions/${transaction.id}`)
      void load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao excluir')
    }
  }

  const selectClass =
    'border border-ghost bg-void px-3 py-2 font-mono text-[11px] text-dim outline-none transition-colors duration-300 hover:border-faint hover:text-fg focus:border-accent/50'

  const total = result?.items.reduce((sum, item) => sum + item.amount, 0) ?? 0

  return (
    <div className="mx-auto max-w-[1200px] px-8 pb-24 sm:px-12">
      {/* ============ CABEÇALHO ============ */}
      <div className="rise flex flex-wrap items-end justify-between gap-8 pt-20 pb-12">
        <div>
          <div className="eyebrow mb-5">registros</div>
          <p className="font-mono text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.9] font-light tracking-[-0.045em] text-fg tabular">
            {result ? String(result.total).padStart(2, '0') : '—'}
          </p>
          <p className="mt-5 text-sm text-faint">
            {formatCurrency(total)} nesta página · {period.label.toLowerCase()}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          className="bg-accent px-6 py-3.5 font-mono text-[11px] tracking-[0.1em] text-void uppercase transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-accent-2"
        >
          + novo lançamento
        </button>
      </div>

      {/* ============ FILTROS ============ */}
      <div className="mb-8 space-y-3">
        <PeriodPicker value={period} onChange={setPeriod} />

        <div className="flex flex-wrap items-center gap-2">
          {(['', 'EXPENSE', 'INCOME'] as const).map((option) => (
            <button
              key={option || 'all'}
              type="button"
              onClick={() => setFlow(option)}
              aria-pressed={flow === option}
              className={`border px-4 py-2 font-mono text-[11px] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                flow === option
                  ? 'border-accent/50 bg-accent/12 text-accent'
                  : 'border-ghost text-dim hover:border-faint hover:text-fg'
              }`}
            >
              {option === '' ? 'Tudo' : option === 'EXPENSE' ? 'Despesas' : 'Receitas'}
            </button>
          ))}

          <span className="mx-2 h-5 w-px bg-ghost" />

          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            aria-label="Filtrar por conta"
            className={selectClass}
          >
            <option value="">Todas as contas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-label="Filtrar por categoria"
            className={selectClass}
          >
            <option value="">Todas as categorias</option>
            {categories
              .filter((category) => !flow || category.flow === flow)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mb-6 border border-negative/40 bg-negative/10 px-5 py-4 text-sm text-fg">
          {error}
        </p>
      )}

      {/* ============ TABELA ============ */}
      <div className="border border-ghost">
        {loading && !result ? (
          <div className="space-y-px p-5">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-14 animate-pulse bg-white/2" />
            ))}
          </div>
        ) : !result || result.items.length === 0 ? (
          <p className="px-6 py-20 text-center text-sm text-faint">
            Nenhum lançamento com esses filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem]">
              <thead>
                <tr className="border-b border-ghost">
                  <th scope="col" className="eyebrow px-6 py-4 text-left">data</th>
                  <th scope="col" className="eyebrow px-6 py-4 text-left">descrição</th>
                  <th scope="col" className="eyebrow px-6 py-4 text-left">categoria</th>
                  <th scope="col" className="eyebrow px-6 py-4 text-left">conta</th>
                  <th scope="col" className="eyebrow px-6 py-4 text-right">valor</th>
                  <th scope="col" className="px-6 py-4">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="group border-b border-ghost/50 transition-colors duration-300 last:border-0 hover:bg-white/2"
                  >
                    <td className="px-6 py-4 font-mono text-xs whitespace-nowrap text-faint tabular">
                      {formatDate(transaction.occurredOn)}
                    </td>

                    <td className="max-w-[16rem] px-6 py-4">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm text-fg">
                          {transaction.description || '—'}
                        </span>
                        {transaction.source === 'SHORTCUT' && <PhoneIcon />}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      {transaction.categoryName ? (
                        <span className="flex items-center gap-2 text-xs text-dim">
                          <span
                            className="size-1.5 shrink-0"
                            style={{ backgroundColor: transaction.categoryColor ?? '#898781' }}
                            aria-hidden="true"
                          />
                          {transaction.categoryName}
                        </span>
                      ) : (
                        <span className="text-xs text-faint">sem categoria</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-xs text-dim">{transaction.accountName}</td>

                    <td
                      className={`px-6 py-4 text-right font-mono text-sm whitespace-nowrap tabular ${
                        transaction.flow === 'EXPENSE' ? 'text-fg' : 'text-accent'
                      }`}
                    >
                      {transaction.flow === 'EXPENSE' ? '−' : '+'}{' '}
                      {formatCurrency(transaction.amount)}
                    </td>

                    <td className="px-6 py-4">
                      {/* Ações sempre no DOM, reveladas no hover e no foco:
                          escondidas de vez ficariam inalcançáveis por teclado
                          e no celular. */}
                      <span className="flex justify-end gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(transaction)
                            setFormOpen(true)
                          }}
                          aria-label={`Editar lançamento de ${formatDate(transaction.occurredOn)}`}
                          className="border border-transparent p-2 text-faint transition-colors duration-300 hover:border-ghost hover:text-fg"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(transaction)}
                          aria-label={`Excluir lançamento de ${formatDate(transaction.occurredOn)}`}
                          className="border border-transparent p-2 text-faint transition-colors duration-300 hover:border-negative/40 hover:text-negative"
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && result.totalPages > 1 && (
          <nav
            aria-label="Paginação"
            className="flex items-center justify-between border-t border-ghost px-6 py-4"
          >
            <p className="eyebrow">
              página {result.page + 1} de {result.totalPages}
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(current - 1, 0))}
                disabled={result.page === 0}
                aria-label="Página anterior"
                className="border border-ghost p-2 text-faint transition-colors duration-300 hover:text-fg disabled:opacity-30"
              >
                <ArrowIcon direction="left" />
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={result.page >= result.totalPages - 1}
                aria-label="Próxima página"
                className="border border-ghost p-2 text-faint transition-colors duration-300 hover:text-fg disabled:opacity-30"
              >
                <ArrowIcon direction="right" />
              </button>
            </div>
          </nav>
        )}
      </div>

      <TransactionForm
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={load}
      />
    </div>
  )
}
