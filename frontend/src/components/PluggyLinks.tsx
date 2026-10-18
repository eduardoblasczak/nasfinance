import { useCallback, useEffect, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import {
  describeAge,
  hoursSince,
  itemStatusLabel,
  pluggyAccountKind,
  runStatusLabel,
  type StatusLabel,
} from '@/lib/pluggy'
import { PluggyFreshness } from './PluggyFreshness'
import { Money } from './ui/Money'
import { ChevronDownIcon } from './ui/icons'
import { card, primaryButton, quietButton, sectionTitle } from './ui/styles'
import type { ToastMessage } from './ui/Toast'
import type { Account, PluggyAccount, PluggyStatus } from '@/types'

interface PluggyLinksProps {
  accounts: Account[]
  onError: (message: string | null) => void
  notify: (message: Omit<ToastMessage, 'key'>, duration?: number) => void
}

const TONE: Record<StatusLabel['tone'], string> = {
  ok: 'text-accent',
  warn: 'text-warning',
  bad: 'text-negative',
  neutral: 'text-fg',
}

/**
 * Vínculo entre contas da Pluggy e contas daqui, e o estado da conexão.
 *
 * A Pluggy devolve "PICPAY INSTITUIÇÃO DE PAGAMENTO S.A"; só você sabe que
 * aquilo é a sua "Conta corrente". Sem este vínculo a sincronização não tem
 * onde gravar.
 *
 * O vínculo é explícito, e não adivinhado por tipo: casar BANK com CHECKING
 * funcionaria hoje, com duas contas, e quebraria em silêncio no dia em que
 * houvesse duas correntes — arquivando lançamentos na conta errada.
 */
export function PluggyLinks({ accounts, onError, notify }: PluggyLinksProps) {
  const [status, setStatus] = useState<PluggyStatus | null>(null)
  const [pluggyAccounts, setPluggyAccounts] = useState<PluggyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [choice, setChoice] = useState<Record<string, string>>({})

  // Sem setLoading(true) aqui: o esqueleto é só da primeira carga. Recarregar
  // depois de uma ação trocaria o painel pelo esqueleto, desmontando o
  // PluggyFreshness — e o resultado da sincronização sumiria na hora.
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
      onError(err instanceof ApiRequestError ? err.fullMessage : 'Não deu para ler a Pluggy agora.')
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  async function link(pluggyAccountId: string, accountId: number) {
    await api.post('/api/v1/pluggy/links', { pluggyAccountId, accountId })
  }

  async function act(run: () => Promise<unknown>, done?: Omit<ToastMessage, 'key'>) {
    try {
      await run()
      onError(null)
      await load()
      if (done) notify(done, done.onUndo ? 5000 : undefined)
    } catch (err) {
      notify({ text: err instanceof ApiRequestError ? err.fullMessage : 'Não deu para concluir. Tente de novo.', tone: 'error' }, 5000)
    }
  }

  /**
   * Desvincular tem volta — basta vincular de novo à mesma conta —, então
   * acontece na hora, com Desfazer, em vez de perguntar antes.
   */
  function unlink(pluggy: PluggyAccount) {
    if (pluggy.linkId === null || pluggy.accountId === null) return
    const accountId = pluggy.accountId
    void act(() => api.delete(`/api/v1/pluggy/links/${pluggy.linkId}`), {
      text: `Desvinculada de ${pluggy.accountName}`,
      onUndo: () => void act(() => link(pluggy.pluggyAccountId, accountId), { text: 'Vínculo refeito' }),
    })
  }

  const item = status ? itemStatusLabel(status.itemStatus) : null
  const run = status ? runStatusLabel(status.lastRunStatus) : null

  return (
    <section aria-labelledby="pluggy-title" className="mt-10">
      <div className="mb-2 flex min-h-11 items-center px-1">
        <h2 id="pluggy-title" className={sectionTitle}>
          Open Finance
        </h2>
      </div>

      {loading ? (
        <div className={`${card} h-[12rem] animate-pulse`} aria-busy="true" aria-label="Carregando" />
      ) : !status ? (
        <p className={`${card} px-4 py-6 text-[0.9375rem] text-dim`}>Não deu para ler o estado da Pluggy agora.</p>
      ) : !status.enabled ? (
        <div className={`${card} px-4 py-5 text-[0.9375rem] text-dim`}>
          <p className="font-semibold text-fg">Integração desligada</p>
          <p className="mt-1">
            Para ligar, defina <code className="font-mono text-[0.875rem] text-fg">PLUGGY_ENABLED=true</code> no{' '}
            <code className="font-mono text-[0.875rem] text-fg">.env</code> do servidor, junto com as credenciais.
          </p>
        </div>
      ) : !status.configured ? (
        <div className={`${card} px-4 py-5 text-[0.9375rem] text-dim`}>
          <p className="font-semibold text-negative">Faltam as credenciais</p>
          <p className="mt-1">
            Defina <code className="font-mono text-[0.875rem] text-fg">PLUGGY_CLIENT_ID</code> e{' '}
            <code className="font-mono text-[0.875rem] text-fg">PLUGGY_CLIENT_SECRET</code> no{' '}
            <code className="font-mono text-[0.875rem] text-fg">.env</code> do servidor.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <PluggyFreshness status={status} onSynced={() => void load()} />

          {/* Estado em linhas de valor, como os Ajustes do iPhone: responde de
              uma vez o que se pergunta quando a sincronização parece parada. */}
          <dl className={`${card} divide-y divide-separator`}>
            <Row label="Conexão">
              <span className={item ? TONE[item.tone] : ''}>{item?.text}</span>
            </Row>
            <Row label="Última coleta no banco">
              {status.itemLastUpdate ? describeAge(hoursSince(status.itemLastUpdate)) : 'Sem informação'}
            </Row>
            <Row label="Última sincronização">
              {status.lastRunAt ? describeAge(hoursSince(status.lastRunAt)) : 'Nunca'}
            </Row>
            <Row label="Resultado">
              <span className={run ? TONE[run.tone] : ''}>{run?.text}</span>
            </Row>
          </dl>

          {status.lastRunError && (
            <p role="alert" className="rounded-[var(--radius-inset)] bg-negative/12 px-4 py-3 text-[0.9375rem] text-fg">
              {status.lastRunError}
            </p>
          )}

          <h3 className="px-1 pt-4 text-[0.9375rem] font-semibold text-fg">Contas no banco</h3>
          {pluggyAccounts.length === 0 ? (
            <p className={`${card} px-4 py-6 text-center text-[0.9375rem] text-faint`}>
              A Pluggy não devolveu nenhuma conta.
            </p>
          ) : (
            <ul className={`${card} divide-y divide-separator`}>
              {pluggyAccounts.map((pluggy) => (
                <li key={pluggy.pluggyAccountId} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.9375rem] text-fg">{pluggy.name}</p>
                      <p className="mt-0.5 text-[0.8125rem] text-faint">
                        {pluggyAccountKind(pluggy.type, pluggy.subtype)}
                        {pluggy.balance !== null && (
                          <>
                            {' · '}
                            <Money value={pluggy.balance} sign={pluggy.balance < 0 ? '-' : 'none'} />
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {pluggy.linkId !== null ? (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-[0.875rem] text-accent">
                        Vinculada a <span className="font-semibold">{pluggy.accountName}</span>
                      </p>
                      <button type="button" onClick={() => unlink(pluggy)} className={`${quietButton} -mr-3 shrink-0`}>
                        Desvincular
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="press relative inline-flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1.5 rounded-full bg-surface-2 pr-3 pl-4 text-fg has-[select:focus-visible]:outline-1 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent">
                        <span className="truncate text-[0.9375rem]">
                          {accounts.find((account) => String(account.id) === choice[pluggy.pluggyAccountId])?.name ??
                            'Escolha a conta daqui'}
                        </span>
                        <ChevronDownIcon className="size-4 shrink-0 text-dim" />
                        <select
                          value={choice[pluggy.pluggyAccountId] ?? ''}
                          onChange={(event) =>
                            setChoice((current) => ({ ...current, [pluggy.pluggyAccountId]: event.target.value }))
                          }
                          aria-label={`Conta daqui para ${pluggy.name}`}
                          className="absolute inset-0 cursor-pointer appearance-none rounded-full text-base opacity-0"
                        >
                          <option value="">Escolha a conta daqui</option>
                          {accounts
                            .filter((account) => !account.archived)
                            .map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!choice[pluggy.pluggyAccountId]}
                        onClick={() =>
                          void act(() => link(pluggy.pluggyAccountId, Number(choice[pluggy.pluggyAccountId])), {
                            text: 'Conta vinculada',
                          })
                        }
                        className={primaryButton}
                      >
                        Vincular
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-[0.9375rem] text-dim">{label}</dt>
      <dd className="text-right text-[0.9375rem] text-fg">{children}</dd>
    </div>
  )
}
