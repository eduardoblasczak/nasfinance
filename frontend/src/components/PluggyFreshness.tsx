import { useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import {
  MEU_PLUGGY_CONNECTIONS_URL,
  describeAge,
  describeRun,
  freshnessOf,
  hoursSince,
} from '@/lib/pluggy'
import { RefreshIcon } from './ui/icons'
import type { PluggyStatus, PluggySyncRun } from '@/types'

interface PluggyFreshnessProps {
  status: PluggyStatus
  /** Chamado depois de cada sincronização, para quem exibe a fila recarregar. */
  onSynced: () => void
}

/**
 * Idade do dado do banco, e o botão para importar agora.
 *
 * As duas coisas juntas porque formam um fluxo só: o aviso diz "atualize no
 * Meu Pluggy", você atualiza lá, volta e importa aqui. Sem o botão, o segundo
 * passo era um comando SSH.
 *
 * Recebe o status pronto em vez de buscá-lo: cada leitura do status custa
 * duas chamadas à Pluggy (autenticação e item), e as duas telas que usam isto
 * já têm o status em mãos.
 */
export function PluggyFreshness({ status, onSynced }: PluggyFreshnessProps) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ text: string; failed: boolean } | null>(null)

  const freshness = freshnessOf(status)
  if (freshness === 'off') return null

  const stale = freshness === 'stale'
  const age = status.itemLastUpdate ? describeAge(hoursSince(status.itemLastUpdate)) : null

  async function sync() {
    setSyncing(true)
    setResult(null)
    try {
      const run = await api.post<PluggySyncRun>('/api/v1/pluggy/sync')
      setResult({ text: describeRun(run, freshness), failed: run.status === 'FAILED' })
      onSynced()
    } catch (err) {
      setResult({
        text: err instanceof ApiRequestError ? err.fullMessage : 'Não foi possível sincronizar',
        failed: true,
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div
      role={stale ? 'alert' : undefined}
      className={`border px-5 py-4 ${
        stale ? 'border-negative/40 bg-negative/10' : 'border-ghost bg-white/2'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-2">{stale ? 'dado do banco desatualizado' : 'dado do banco'}</p>

          {freshness === 'unknown' ? (
            <p className="text-xs text-dim">
              Não foi possível ler a última coleta da Pluggy agora.
            </p>
          ) : (
            <p className={`text-xs ${stale ? 'text-fg' : 'text-dim'}`}>
              Última coleta no banco {age}.
              {stale && <> A cadência normal é de 24 h, então o Meu Pluggy parou de coletar.</>}
            </p>
          )}

          {stale && (
            <p className="mt-2 text-xs text-dim">
              Abra{' '}
              <a
                href={MEU_PLUGGY_CONNECTIONS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-fg underline decoration-border underline-offset-4 transition-colors duration-300 hover:decoration-fg"
              >
                o Meu Pluggy
              </a>
              , entre na conexão do banco e clique em <span className="text-fg">Atualizar</span>{' '}
              — não em Excluir, que quebra os vínculos. Quando a janela fechar, volte e
              sincronize aqui.
            </p>
          )}
        </div>

        {/* Largura mínima: "sincronizando…" é mais curto que "sincronizar agora",
            e sem ela o botão encolhia no clique e o texto ao lado mudava de quebra. */}
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="flex min-h-11 min-w-48 shrink-0 items-center justify-center gap-2 border border-border px-4 font-mono text-2xs tracking-[0.08em] text-dim uppercase transition-all duration-400 hover:border-faint hover:text-fg disabled:cursor-wait disabled:opacity-40"
        >
          <RefreshIcon className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'sincronizando…' : 'sincronizar agora'}
        </button>
      </div>

      {result && (
        <p
          role="status"
          className={`mt-3 border-t border-ghost/50 pt-3 text-xs ${
            result.failed ? 'text-negative' : 'text-dim'
          }`}
        >
          {result.text}
        </p>
      )}
    </div>
  )
}
