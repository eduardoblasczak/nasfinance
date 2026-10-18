import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { AccountForm } from '@/components/AccountForm'
import { CategoryForm } from '@/components/CategoryForm'
import { PluggyLinks } from '@/components/PluggyLinks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Segmented } from '@/components/ui/Segmented'
import { Money } from '@/components/ui/Money'
import { Toast } from '@/components/ui/Toast'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { ChevronRightIcon, PlusIcon } from '@/components/ui/icons'
import { card, quietButton, secondaryButton, sectionTitle } from '@/components/ui/styles'
import { DEMO } from '@/lib/demo'
import type { Account, Category, Flow } from '@/types'

/** O que está esperando confirmação de exclusão. */
type PendingDelete = { kind: 'account'; item: Account } | { kind: 'category'; item: Category } | null

/**
 * Ajustes: contas, categorias e a conexão com o banco.
 *
 * Arquivar e excluir são ações diferentes e a interface precisa deixar isso
 * óbvio. A FK da conta usa `ON DELETE RESTRICT`: excluir uma conta com
 * lançamentos é recusado. A da categoria é `SET NULL`: a exclusão passa e os
 * lançamentos ficam sem categoria. Por isso:
 *  - arquivar tem volta → acontece na hora, com Desfazer;
 *  - excluir não tem → sheet de confirmação dizendo a consequência concreta.
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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)

  const { toast, show } = useToast()

  const load = useCallback(async () => {
    try {
      // Sempre busca arquivados: o filtro é visual. Reconsultar a API a cada
      // toque em "mostrar arquivadas" seria ida e volta de rede para esconder
      // linhas que já estão na memória.
      const [accountList, categoryList] = await Promise.all([
        api.get<Account[]>('/api/v1/accounts?includeArchived=true'),
        api.get<Category[]>('/api/v1/categories?includeArchived=true'),
      ])
      setAccounts(accountList)
      setCategories(categoryList)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'O servidor não respondeu.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Executa, recarrega e avisa. A mensagem de erro da API é melhor que
   * qualquer texto genérico aqui: ela diz "existem 12 lançamentos nesta
   * conta", não "erro ao excluir".
   */
  async function act(run: () => Promise<unknown>, done: Parameters<typeof show>[0]) {
    try {
      await run()
      await load()
      show(done, done.onUndo ? 5000 : undefined)
    } catch (err) {
      show({ text: err instanceof ApiRequestError ? err.fullMessage : 'Não deu para concluir. Tente de novo.', tone: 'error' }, 6000)
    }
  }

  function toggleArchive(path: 'accounts' | 'categories', id: number, archived: boolean, name: string) {
    setAccountFormOpen(false)
    setCategoryFormOpen(false)
    const forward = archived ? 'unarchive' : 'archive'
    const back = archived ? 'archive' : 'unarchive'
    void act(() => api.post(`/api/v1/${path}/${id}/${forward}`), {
      text: archived ? `${name} voltou` : `${name} arquivada`,
      onUndo: () => void act(() => api.post(`/api/v1/${path}/${id}/${back}`), { text: 'Desfeito' }),
    })
  }

  function confirmDelete() {
    const target = pendingDelete
    setPendingDelete(null)
    if (!target) return
    if (target.kind === 'account') {
      void act(() => api.delete(`/api/v1/accounts/${target.item.id}`), { text: `Conta ${target.item.name} excluída` })
    } else {
      void act(() => api.delete(`/api/v1/categories/${target.item.id}`), { text: `Categoria ${target.item.name} excluída` })
    }
  }

  const visibleAccounts = accounts.filter((account) => showArchived || !account.archived)
  const visibleCategories = categories.filter(
    (category) => category.flow === categoryFlow && (showArchived || !category.archived),
  )
  const archivedCount = accounts.filter((a) => a.archived).length + categories.filter((c) => c.archived).length
  const activeAccounts = accounts.filter((a) => !a.archived).length
  const activeCategories = categories.filter((c) => !c.archived).length

  // Falhou antes de ter qualquer dado: mostrar "Nenhuma conta ainda" embaixo
  // do erro mentiria — não é que não existam, é que não deu para ler.
  const failed = error !== null && accounts.length === 0 && categories.length === 0

  const summary = loading ? (
    <span className="inline-block h-[1.375rem] w-44 animate-pulse rounded-md bg-surface-2 align-middle" />
  ) : failed ? (
    'Não deu para carregar agora.'
  ) : (
    <>
      {activeAccounts} {activeAccounts === 1 ? 'conta' : 'contas'} · {activeCategories}{' '}
      {activeCategories === 1 ? 'categoria' : 'categorias'}
    </>
  )

  return (
    <>
      <div className="enter mx-auto max-w-[45rem] px-4 font-ui md:px-10 md:pb-16">
        <PageHeader title="Ajustes" summary={summary} />

        {error && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-inset)] bg-negative/12 px-4 py-3">
            <p className="text-[0.9375rem] text-fg">{error}</p>
            <button type="button" onClick={() => void load()} className={secondaryButton}>
              Tentar de novo
            </button>
          </div>
        )}

        {!failed && (
          <>
            {/* ============ CONTAS ============ */}
            <Section
              title="Contas"
              action={
                DEMO ? undefined : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAccount(null)
                      setAccountFormOpen(true)
                    }}
                    className={`${quietButton} -mr-3 text-accent`}
                  >
                    <PlusIcon className="size-4" />
                    Nova conta
                  </button>
                )
              }
            >
              {loading ? (
                <ListSkeleton rows={3} />
              ) : visibleAccounts.length === 0 ? (
                <p className={`${card} px-4 py-8 text-center text-[0.9375rem] text-dim`}>
                  Nenhuma conta ainda. Crie a primeira para registrar lançamentos.
                </p>
              ) : (
                <ul className={`${card} divide-y divide-separator overflow-hidden`}>
                  {visibleAccounts.map((account) => (
                    <SettingsRow
                      key={account.id}
                      color={account.color}
                      title={account.name}
                      subtitle={account.archived ? `${account.kindLabel} · arquivada` : account.kindLabel}
                      dim={account.archived}
                      value={
                        <Money
                          value={account.currentBalance}
                          sign={account.currentBalance < 0 ? '-' : 'none'}
                          negative={account.currentBalance < 0}
                          className="text-dim"
                        />
                      }
                      onSelect={
                        DEMO
                          ? undefined
                          : () => {
                              setEditingAccount(account)
                              setAccountFormOpen(true)
                            }
                      }
                    />
                  ))}
                </ul>
              )}
            </Section>

            {/* ============ CATEGORIAS ============ */}
            <Section
              title="Categorias"
              action={
                DEMO ? undefined : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null)
                      setCategoryFormOpen(true)
                    }}
                    className={`${quietButton} -mr-3 text-accent`}
                  >
                    <PlusIcon className="size-4" />
                    Nova categoria
                  </button>
                )
              }
            >
              <Segmented
                label="Tipo de categoria"
                value={categoryFlow}
                onChange={setCategoryFlow}
                options={[
                  { value: 'EXPENSE', label: 'Despesas' },
                  { value: 'INCOME', label: 'Receitas' },
                ]}
                className="mb-3 flex w-full md:w-auto"
              />
              {loading ? (
                <ListSkeleton rows={5} />
              ) : visibleCategories.length === 0 ? (
                <p className={`${card} px-4 py-8 text-center text-[0.9375rem] text-dim`}>
                  Nenhuma categoria de {categoryFlow === 'EXPENSE' ? 'despesa' : 'receita'} ainda.
                </p>
              ) : (
                <ul className={`${card} divide-y divide-separator overflow-hidden`}>
                  {visibleCategories.map((category) => (
                    <SettingsRow
                      key={category.id}
                      color={category.color}
                      title={category.name}
                      subtitle={category.archived ? 'Arquivada' : undefined}
                      dim={category.archived}
                      value={
                        category.monthlyBudget !== null ? (
                          <span className="text-dim">
                            Teto <Money value={category.monthlyBudget} />
                          </span>
                        ) : null
                      }
                      onSelect={
                        DEMO
                          ? undefined
                          : () => {
                              setEditingCategory(category)
                              setCategoryFormOpen(true)
                            }
                      }
                    />
                  ))}
                </ul>
              )}
            </Section>

            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((current) => !current)}
                aria-pressed={showArchived}
                className={`${quietButton} mt-3 -ml-3`}
              >
                {showArchived ? 'Esconder arquivadas' : `Mostrar arquivadas (${archivedCount})`}
              </button>
            )}
          </>
        )}

        {/* ============ OPEN FINANCE ============ */}
        <PluggyLinks accounts={accounts} onError={setError} notify={show} />

        <AccountForm
          open={accountFormOpen}
          editing={editingAccount}
          onClose={() => {
            setAccountFormOpen(false)
            setEditingAccount(null)
          }}
          onSaved={() => void load()}
          onToggleArchive={(account) => toggleArchive('accounts', account.id, account.archived, account.name)}
          onDelete={(account) => {
            setAccountFormOpen(false)
            setPendingDelete({ kind: 'account', item: account })
          }}
        />

        <CategoryForm
          open={categoryFormOpen}
          editing={editingCategory}
          defaultFlow={categoryFlow}
          onClose={() => {
            setCategoryFormOpen(false)
            setEditingCategory(null)
          }}
          onSaved={() => void load()}
          onToggleArchive={(category) => toggleArchive('categories', category.id, category.archived, category.name)}
          onDelete={(category) => {
            setCategoryFormOpen(false)
            setPendingDelete({ kind: 'category', item: category })
          }}
        />

        <ConfirmSheet
          open={pendingDelete !== null}
          title={pendingDelete?.kind === 'account' ? 'Excluir conta?' : 'Excluir categoria?'}
          consequence={
            pendingDelete?.kind === 'account'
              ? `"${pendingDelete.item.name}" sai de vez. Se ela tiver lançamentos, a exclusão é recusada — nesse caso, arquive.`
              : pendingDelete
                ? `"${pendingDelete.item.name}" sai de vez, e os lançamentos dela ficam sem categoria. Para manter o histórico classificado, arquive em vez de excluir.`
                : ''
          }
          confirmLabel={pendingDelete?.kind === 'account' ? 'Excluir conta' : 'Excluir categoria'}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </div>

      <Toast toast={toast} />
    </>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="mb-8">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3 px-1">
        <h2 className={sectionTitle}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

interface SettingsRowProps {
  color: string
  title: string
  subtitle?: string
  value?: ReactNode
  dim?: boolean
  /** Sem ele, a linha é só leitura: sem seta e sem toque (modo demonstração). */
  onSelect?: () => void
}

/** Linha que abre o item, com seta: o padrão dos Ajustes do iPhone. */
function SettingsRow({ color, title, subtitle, value, dim = false, onSelect }: SettingsRowProps) {
  const content = (
    <>
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[0.9375rem] ${dim ? 'text-faint' : 'text-fg'}`}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[0.8125rem] text-faint">{subtitle}</span>}
      </span>
      {value && <span className="shrink-0 text-[0.9375rem]">{value}</span>}
      {onSelect && <ChevronRightIcon className="size-4 shrink-0 text-faint" />}
    </>
  )

  return (
    <li>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.03] active:bg-white/[0.06]"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5">{content}</div>
      )}
    </li>
  )
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className={`${card} divide-y divide-separator`} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-[3.25rem] animate-pulse" />
      ))}
    </div>
  )
}
