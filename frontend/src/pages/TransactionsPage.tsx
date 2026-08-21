import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Smartphone } from 'lucide-react'
import { api, ApiRequestError, buildQuery } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { useReferenceData } from '@/hooks/useReferenceData'
import { useEventStream } from '@/hooks/useEventStream'
import { TransactionForm } from '@/components/TransactionForm'
import { Card } from '@/components/ui/Card'
import { PeriodPicker, currentMonthPeriod, type Period } from '@/components/PeriodPicker'
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

  // Mantem a lista viva quando um lancamento chega pelo Atalho do iPhone
  useEventStream(useCallback(() => void load(), [load]))

  // Qualquer mudanca de filtro volta para a primeira pagina: continuar na
  // pagina 4 de um resultado que agora tem 2 paginas mostraria uma lista vazia.
  useEffect(() => {
    setPage(0)
  }, [period, flow, categoryId, accountId])

  async function handleDelete(transaction: Transaction) {
    const label = transaction.description || transaction.categoryName || 'este lancamento'
    if (!window.confirm(`Excluir ${label} (${formatCurrency(transaction.amount)})?`)) {
      return
    }
    try {
      await api.delete(`/api/v1/transactions/${transaction.id}`)
      void load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao excluir')
    }
  }

  const selectClass =
    'rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs text-ink-soft outline-none focus:border-series-1'

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Lancamentos</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {result ? `${result.total} registro(s) encontrado(s)` : 'Carregando...'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-series-1 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden="true" />
          Novo lancamento
        </button>
      </header>

      {/* Filtros numa linha so, acima da tabela */}
      <div className="space-y-3">
        <PeriodPicker value={period} onChange={setPeriod} />

        <div className="flex flex-wrap gap-2">
          <select
            value={flow}
            onChange={(e) => setFlow(e.target.value as Flow | '')}
            aria-label="Filtrar por tipo"
            className={selectClass}
          >
            <option value="">Todos os tipos</option>
            <option value="EXPENSE">Apenas despesas</option>
            <option value="INCOME">Apenas receitas</option>
          </select>

          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
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
            onChange={(e) => setCategoryId(e.target.value)}
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
        <p className="rounded-lg border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-ink-soft">
          {error}
        </p>
      )}

      <Card>
        {loading && !result ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-raised" />
            ))}
          </div>
        ) : !result || result.items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">
            Nenhum lancamento encontrado com esses filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th scope="col" className="px-5 py-3 font-medium">Data</th>
                  <th scope="col" className="px-5 py-3 font-medium">Descricao</th>
                  <th scope="col" className="px-5 py-3 font-medium">Categoria</th>
                  <th scope="col" className="px-5 py-3 font-medium">Conta</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    <span className="sr-only">Acoes</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {result.items.map((transaction) => (
                  <tr key={transaction.id} className="group transition-colors hover:bg-raised/50">
                    <td className="px-5 py-3 whitespace-nowrap text-ink-muted tabular">
                      {formatDate(transaction.occurredOn)}
                    </td>

                    <td className="max-w-[16rem] px-5 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-ink">
                          {transaction.description || '—'}
                        </span>
                        {transaction.source === 'SHORTCUT' && (
                          <Smartphone
                            className="size-3 shrink-0 text-ink-muted"
                            aria-label="Registrado pelo atalho do iPhone"
                          />
                        )}
                      </span>
                    </td>

                    <td className="px-5 py-3">
                      {transaction.categoryName ? (
                        <span className="flex items-center gap-1.5 text-ink-soft">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: transaction.categoryColor ?? '#898781' }}
                            aria-hidden="true"
                          />
                          {transaction.categoryName}
                        </span>
                      ) : (
                        <span className="text-ink-muted">Sem categoria</span>
                      )}
                    </td>

                    <td className="px-5 py-3 text-ink-muted">{transaction.accountName}</td>

                    <td
                      className={`px-5 py-3 text-right font-medium whitespace-nowrap tabular ${
                        transaction.flow === 'EXPENSE' ? 'text-ink' : 'text-good'
                      }`}
                    >
                      {transaction.flow === 'EXPENSE' ? '−' : '+'}{' '}
                      {formatCurrency(transaction.amount)}
                    </td>

                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {/* Acoes sempre no DOM, visiveis no hover e no foco:
                          escondidas de vez, ficariam inalcancaveis por teclado
                          e no celular. */}
                      <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(transaction)
                            setFormOpen(true)
                          }}
                          aria-label={`Editar lancamento de ${formatDate(transaction.occurredOn)}`}
                          className="rounded p-1.5 text-ink-muted transition-colors hover:bg-overlay hover:text-ink"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(transaction)}
                          aria-label={`Excluir lancamento de ${formatDate(transaction.occurredOn)}`}
                          className="rounded p-1.5 text-ink-muted transition-colors hover:bg-overlay hover:text-critical"
                        >
                          <Trash2 className="size-3.5" />
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
            aria-label="Paginacao"
            className="flex items-center justify-between border-t border-hairline px-5 py-3"
          >
            <p className="text-xs text-ink-muted">
              Pagina {result.page + 1} de {result.totalPages}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={result.page === 0}
                aria-label="Pagina anterior"
                className="rounded-lg border border-hairline p-1.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={result.page >= result.totalPages - 1}
                aria-label="Proxima pagina"
                className="rounded-lg border border-hairline p-1.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </nav>
        )}
      </Card>

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
