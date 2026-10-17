import { useCallback, useEffect, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { PluggyFreshness } from './PluggyFreshness'
import { TrashIcon } from './ui/icons'
import type { Account, PluggyAccount, PluggyStatus } from '@/types'

interface PluggyLinksProps {
  accounts: Account[]
  onError: (message: string | null) => void
}

/**
 * Vínculo entre contas da Pluggy e contas daqui.
 *
 * A Pluggy devolve "PICPAY INSTITUIÇÃO DE PAGAMENTO S.A"; só você sabe que
 * aquilo é a sua "Conta Corrente". Sem este vínculo a sincronização não tem
 * onde gravar, e é por isso que esta seção vem antes de qualquer importação.
 *
 * O vínculo é explícito, e não adivinhado por tipo: casar BANK com CHECKING
 * funcionaria hoje, com duas contas, e quebraria em silêncio no dia em que
 * houvesse duas correntes — arquivando lançamentos na conta errada sem
 * nenhum erro aparente.
 */
export function PluggyLinks({ accounts, onError }: PluggyLinksProps) {
  const [status, setStatus] = useState<PluggyStatus | null>(null)
  const [pluggyAccounts, setPluggyAccounts] = useState<PluggyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [choice, setChoice] = useState<Record<string, string>>({})

  // Sem setLoading(true) aqui: o esqueleto é só da primeira carga (o estado
  // já nasce true). Recarregar depois de uma ação trocaria o painel inteiro
  // pelo esqueleto, desmontando o PluggyFreshness — e a mensagem com o
  // resultado da sincronização sumiria no mesmo instante em que apareceu.
  const load = useCallback(async () => {
    try {
      // O status nunca deve derrubar a tela: ele é justamente o que se abre
      // quando se desconfia que a integração parou.
      const current = await api.get<PluggyStatus>('/api/v1/pluggy/status')
      setStatus(current)

      if (current.enabled && current.configured) {
        setPluggyAccounts(await api.get<PluggyAccount[]>('/api/v1/pluggy/accounts'))
      } else {
        setPluggyAccounts([])
      }
    } catch (err) {
      onError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao ler a Pluggy')
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  async function act(run: () => Promise<unknown>) {
    try {
      await run()
      onError(null)
      await load()
    } catch (err) {
      onError(err instanceof ApiRequestError ? err.fullMessage : 'Não foi possível concluir')
    }
  }

  const selectClass =
    'min-h-11 border border-border bg-void px-3 font-mono text-2xs text-dim outline-none transition-colors duration-300 hover:border-faint hover:text-fg focus:border-accent/50'

  return (
    <section className="panel mt-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ghost px-7 py-5">
        <h2 className="eyebrow">open finance — pluggy</h2>
        {status && (
          <span className="font-mono text-2xs tracking-[0.1em] uppercase">
            {!status.enabled ? (
              <span className="text-faint">desligada</span>
            ) : !status.configured ? (
              <span className="text-negative">sem credenciais</span>
            ) : (
              <span className="text-accent">ativa</span>
            )}
          </span>
        )}
      </header>

      {loading ? (
        <div className="space-y-px p-5">
          <div className="h-14 animate-pulse bg-white/2" />
        </div>
      ) : !status?.enabled ? (
        <p className="px-7 py-10 text-sm text-faint">
          Integração desligada. Defina <code className="font-mono text-dim">PLUGGY_ENABLED=true</code>{' '}
          no <code className="font-mono text-dim">.env</code> do servidor, junto com as credenciais.
        </p>
      ) : !status.configured ? (
        <p className="px-7 py-10 text-sm text-faint">
          Faltam <code className="font-mono text-dim">PLUGGY_CLIENT_ID</code> e{' '}
          <code className="font-mono text-dim">PLUGGY_CLIENT_SECRET</code> no{' '}
          <code className="font-mono text-dim">.env</code> do servidor.
        </p>
      ) : (
        <>
          {/* Painel de estado: responde de uma vez as perguntas que surgem
              quando alguém desconfia que a sincronização parou. */}
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-ghost/50 px-7 py-5 sm:grid-cols-4">
            <div>
              <dt className="eyebrow mb-2">item</dt>
              <dd
                className={`font-mono text-xs ${
                  status.itemStatus === 'UPDATED' ? 'text-accent' : 'text-negative'
                }`}
              >
                {status.itemStatus ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="eyebrow mb-2">última coleta</dt>
              <dd className="font-mono text-xs text-dim tabular">
                {status.itemLastUpdate
                  ? new Date(status.itemLastUpdate).toLocaleString('pt-BR')
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="eyebrow mb-2">última sincronização</dt>
              <dd className="font-mono text-xs text-dim tabular">
                {status.lastRunAt ? new Date(status.lastRunAt).toLocaleString('pt-BR') : 'nunca'}
              </dd>
            </div>
            <div>
              <dt className="eyebrow mb-2">resultado</dt>
              <dd
                className={`font-mono text-xs ${
                  status.lastRunStatus === 'FAILED' ? 'text-negative' : 'text-dim'
                }`}
              >
                {status.lastRunStatus ?? '—'}
              </dd>
            </div>
          </dl>

          {status.lastRunError && (
            <p className="border-b border-ghost/50 px-7 py-4 text-xs text-negative">
              {status.lastRunError}
            </p>
          )}

          <div className="border-b border-ghost/50 px-7 py-5">
            <PluggyFreshness status={status} onSynced={() => void load()} />
          </div>

          {pluggyAccounts.length === 0 ? (
            <p className="px-7 py-10 text-center text-sm text-faint">
              Nenhuma conta retornada pela Pluggy.
            </p>
          ) : (
            <ul>
              {pluggyAccounts.map((pluggy) => (
                <li
                  key={pluggy.pluggyAccountId}
                  className="flex flex-wrap items-center gap-4 border-b border-ghost/50 px-7 py-4 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{pluggy.name}</p>
                    <p className="mt-1 font-mono text-2xs tracking-[0.08em] text-faint uppercase">
                      {pluggy.type}
                      {pluggy.subtype ? ` · ${pluggy.subtype}` : ''}
                      {pluggy.balance !== null ? ` · ${formatCurrency(pluggy.balance)}` : ''}
                    </p>
                  </div>

                  {pluggy.linkId !== null ? (
                    <>
                      <p className="shrink-0 font-mono text-xs text-accent">
                        → {pluggy.accountName}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Desvincular "${pluggy.name}" de "${pluggy.accountName}"?\n\nOs lançamentos já importados permanecem. A sincronização para de trazer novidades desta conta.`,
                            )
                          )
                            return
                          void act(() => api.delete(`/api/v1/pluggy/links/${pluggy.linkId}`))
                        }}
                        aria-label={`Desvincular ${pluggy.name}`}
                        className="border border-transparent p-2 text-faint transition-colors duration-300 hover:border-negative/40 hover:text-negative"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  ) : (
                    <>
                      <select
                        value={choice[pluggy.pluggyAccountId] ?? ''}
                        onChange={(event) =>
                          setChoice((current) => ({
                            ...current,
                            [pluggy.pluggyAccountId]: event.target.value,
                          }))
                        }
                        aria-label={`Conta local para ${pluggy.name}`}
                        className={selectClass}
                      >
                        <option value="">escolha a conta…</option>
                        {accounts
                          .filter((account) => !account.archived)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                      </select>

                      <button
                        type="button"
                        disabled={!choice[pluggy.pluggyAccountId]}
                        onClick={() =>
                          void act(() =>
                            api.post('/api/v1/pluggy/links', {
                              pluggyAccountId: pluggy.pluggyAccountId,
                              accountId: Number(choice[pluggy.pluggyAccountId]),
                            }),
                          )
                        }
                        className="min-h-11 border-none px-5 font-mono text-2xs tracking-[0.1em] uppercase transition-colors duration-400 enabled:bg-accent enabled:text-void enabled:hover:bg-accent-2 disabled:cursor-not-allowed disabled:bg-ghost disabled:text-faint"
                      >
                        vincular
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
