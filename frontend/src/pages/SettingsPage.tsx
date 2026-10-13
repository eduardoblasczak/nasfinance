import { useCallback, useEffect, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { AccountForm } from '@/components/AccountForm'
import { CategoryForm } from '@/components/CategoryForm'
import { ArchiveIcon, EditIcon, RefreshIcon, TrashIcon } from '@/components/ui/icons'
import type { Account, Category, Flow } from '@/types'

/**
 * Contas e categorias.
 *
 * Até esta tela existir, criar uma categoria exigia montar um `curl` com três
 * cabeçalhos de autenticação. Os quatorze endpoints já estavam prontos e em
 * produção — o que faltava era alcance.
 *
 * Arquivar e excluir são ações diferentes e a interface precisa deixar isso
 * óbvio: a FK usa `ON DELETE RESTRICT`, então excluir uma conta com lançamentos
 * é recusado pelo banco. Arquivar tira dos formulários e preserva o histórico,
 * que ainda tem de aparecer nos relatórios dos meses em que aconteceu.
 */
export function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showArchived, setShowArchived] = useState(false)
  const [categoryFlow, setCategoryFlow] = useState<Flow>('EXPENSE')

  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Sempre busca arquivados: o filtro é visual. Reconsultar a API a cada
      // clique no botão "mostrar arquivados" seria ida e volta de rede para
      // esconder linhas que já estão na memória.
      const [accountList, categoryList] = await Promise.all([
        api.get<Account[]>('/api/v1/accounts?includeArchived=true'),
        api.get<Category[]>('/api/v1/categories?includeArchived=true'),
      ])
      setAccounts(accountList)
      setCategories(categoryList)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(run: () => Promise<unknown>) {
    try {
      await run()
      setError(null)
      await load()
    } catch (err) {
      // A mensagem da API é melhor do que qualquer texto genérico aqui: ela
      // diz "existem 12 lançamentos nesta conta", não "erro ao excluir".
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Não foi possível concluir')
    }
  }

  const visibleAccounts = accounts.filter((account) => showArchived || !account.archived)
  const visibleCategories = categories.filter(
    (category) => category.flow === categoryFlow && (showArchived || !category.archived),
  )
  const archivedCount =
    accounts.filter((a) => a.archived).length + categories.filter((c) => c.archived).length

  const iconButton =
    'border border-transparent p-2 text-faint transition-colors duration-300 hover:border-ghost hover:text-fg'

  return (
    <div className="mx-auto max-w-[1200px] px-8 pb-24 sm:px-12">
      {/* ============ CABEÇALHO ============ */}
      <div className="rise flex flex-wrap items-end justify-between gap-8 pt-20 pb-12">
        <div>
          <div className="eyebrow mb-5">configuração</div>
          <p className="font-mono text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.9] font-light tracking-[-0.045em] text-fg tabular">
            {String(accounts.length).padStart(2, '0')}
            <span className="text-border"> / </span>
            {String(categories.length).padStart(2, '0')}
          </p>
          <p className="mt-5 text-sm text-faint">contas e categorias cadastradas</p>
        </div>

        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            aria-pressed={showArchived}
            className={`min-h-11 border px-4 font-mono text-2xs tracking-[0.1em] uppercase transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showArchived
                ? 'border-accent/50 bg-accent/12 text-accent'
                : 'border-border text-dim hover:border-faint hover:text-fg'
            }`}
          >
            arquivados ({archivedCount})
          </button>
        )}
      </div>

      {error && (
        <p className="mb-6 border border-negative/40 bg-negative/10 px-5 py-4 text-sm text-fg">
          {error}
        </p>
      )}

      {/* ============ CONTAS ============ */}
      <section className="panel mb-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ghost px-7 py-5">
          <h2 className="eyebrow">contas</h2>
          <button
            type="button"
            onClick={() => {
              setEditingAccount(null)
              setAccountFormOpen(true)
            }}
            className="min-h-11 bg-accent px-5 font-mono text-2xs tracking-[0.1em] text-void uppercase transition-colors duration-400 hover:bg-accent-2"
          >
            + nova conta
          </button>
        </header>

        {loading ? (
          <div className="space-y-px p-5">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-14 animate-pulse bg-white/2" />
            ))}
          </div>
        ) : visibleAccounts.length === 0 ? (
          <p className="px-7 py-16 text-center text-sm text-faint">
            Nenhuma conta cadastrada. Crie a primeira para registrar lançamentos.
          </p>
        ) : (
          <ul>
            {visibleAccounts.map((account) => (
              <li
                key={account.id}
                className="group flex flex-wrap items-center gap-4 border-b border-ghost/50 px-7 py-4 transition-colors duration-300 last:border-0 hover:bg-white/2"
              >
                <span
                  className="size-2 shrink-0"
                  style={{ backgroundColor: account.color }}
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${account.archived ? 'text-faint' : 'text-fg'}`}>
                    {account.name}
                    {account.archived && (
                      <span className="ml-3 font-mono text-2xs tracking-[0.1em] text-faint uppercase">
                        arquivada
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-mono text-2xs tracking-[0.08em] text-faint uppercase">
                    {account.kindLabel}
                  </p>
                </div>

                <p className="shrink-0 font-mono text-sm text-dim tabular">
                  {formatCurrency(account.currentBalance)}
                </p>

                <span className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAccount(account)
                      setAccountFormOpen(true)
                    }}
                    aria-label={`Editar ${account.name}`}
                    className={iconButton}
                  >
                    <EditIcon />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void act(() =>
                        api.post(
                          `/api/v1/accounts/${account.id}/${account.archived ? 'unarchive' : 'archive'}`,
                        ),
                      )
                    }
                    aria-label={`${account.archived ? 'Desarquivar' : 'Arquivar'} ${account.name}`}
                    className={iconButton}
                  >
                    {account.archived ? <RefreshIcon /> : <ArchiveIcon />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Excluir a conta "${account.name}"?\n\nSe houver lançamentos nela, a exclusão será recusada — nesse caso, arquive.`,
                        )
                      )
                        return
                      void act(() => api.delete(`/api/v1/accounts/${account.id}`))
                    }}
                    aria-label={`Excluir ${account.name}`}
                    className="border border-transparent p-2 text-faint transition-colors duration-300 hover:border-negative/40 hover:text-negative"
                  >
                    <TrashIcon />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ============ CATEGORIAS ============ */}
      <section className="panel">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ghost px-7 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="eyebrow">categorias</h2>
            <div className="flex gap-1.5">
              {(['EXPENSE', 'INCOME'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategoryFlow(option)}
                  aria-pressed={categoryFlow === option}
                  className={`min-h-11 border px-4 font-mono text-2xs transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    categoryFlow === option
                      ? 'border-accent/50 bg-accent/12 text-accent'
                      : 'border-border text-dim hover:border-faint hover:text-fg'
                  }`}
                >
                  {option === 'EXPENSE' ? 'Despesas' : 'Receitas'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingCategory(null)
              setCategoryFormOpen(true)
            }}
            className="min-h-11 bg-accent px-5 font-mono text-2xs tracking-[0.1em] text-void uppercase transition-colors duration-400 hover:bg-accent-2"
          >
            + nova categoria
          </button>
        </header>

        {loading ? (
          <div className="space-y-px p-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-12 animate-pulse bg-white/2" />
            ))}
          </div>
        ) : visibleCategories.length === 0 ? (
          <p className="px-7 py-16 text-center text-sm text-faint">
            Nenhuma categoria de {categoryFlow === 'EXPENSE' ? 'despesa' : 'receita'}.
          </p>
        ) : (
          <ul>
            {visibleCategories.map((category) => (
              <li
                key={category.id}
                className="group flex flex-wrap items-center gap-4 border-b border-ghost/50 px-7 py-4 transition-colors duration-300 last:border-0 hover:bg-white/2"
              >
                <span
                  className="size-2 shrink-0"
                  style={{ backgroundColor: category.color }}
                  aria-hidden="true"
                />

                <p
                  className={`min-w-0 flex-1 truncate text-sm ${category.archived ? 'text-faint' : 'text-fg'}`}
                >
                  {category.name}
                  {category.archived && (
                    <span className="ml-3 font-mono text-2xs tracking-[0.1em] text-faint uppercase">
                      arquivada
                    </span>
                  )}
                </p>

                <p className="shrink-0 font-mono text-xs text-faint tabular">
                  {category.monthlyBudget === null
                    ? '—'
                    : `teto ${formatCurrency(category.monthlyBudget)}`}
                </p>

                <span className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(category)
                      setCategoryFormOpen(true)
                    }}
                    aria-label={`Editar ${category.name}`}
                    className={iconButton}
                  >
                    <EditIcon />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void act(() =>
                        api.post(
                          `/api/v1/categories/${category.id}/${category.archived ? 'unarchive' : 'archive'}`,
                        ),
                      )
                    }
                    aria-label={`${category.archived ? 'Desarquivar' : 'Arquivar'} ${category.name}`}
                    className={iconButton}
                  >
                    {category.archived ? <RefreshIcon /> : <ArchiveIcon />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Conta e categoria se comportam de forma OPOSTA aqui, e
                      // a confirmação precisa dizer isso. A FK da conta é
                      // RESTRICT: excluir com lançamentos é recusado. A da
                      // categoria é SET NULL: a exclusão passa e os lançamentos
                      // ficam "sem categoria" — silenciosamente, se a interface
                      // não avisar antes.
                      if (
                        !window.confirm(
                          `Excluir a categoria "${category.name}"?\n\nOs lançamentos que a usam não são apagados: eles ficam sem categoria. Para manter o histórico classificado, arquive em vez de excluir.`,
                        )
                      )
                        return
                      void act(() => api.delete(`/api/v1/categories/${category.id}`))
                    }}
                    aria-label={`Excluir ${category.name}`}
                    className="border border-transparent p-2 text-faint transition-colors duration-300 hover:border-negative/40 hover:text-negative"
                  >
                    <TrashIcon />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountForm
        open={accountFormOpen}
        editing={editingAccount}
        onClose={() => {
          setAccountFormOpen(false)
          setEditingAccount(null)
        }}
        onSaved={load}
      />

      <CategoryForm
        open={categoryFormOpen}
        editing={editingCategory}
        defaultFlow={categoryFlow}
        onClose={() => {
          setCategoryFormOpen(false)
          setEditingCategory(null)
        }}
        onSaved={load}
      />
    </div>
  )
}
