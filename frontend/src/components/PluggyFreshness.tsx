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
 *
 * Fresco, é uma linha discreta — não compete com a fila. Velho, ganha cor de
 * atenção e as instruções; a cor nunca vem sozinha, o título também muda.
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
        text: err instanceof ApiRequestError ? err.fullMessage : 'Não foi possível sincronizar. Tente de novo em instantes.',
        failed: true,
      })
    } finally {
      setSyncing(false)
    }
  }

  const title =
    freshness === 'unknown'
      ? 'Não deu para ler a última coleta'
      : stale
        ? 'Dados desatualizados'
        : `Atualizado ${age}`

  // O rótulo não muda durante a sincronização: só o ícone gira. Trocar para
  // "Sincronizando…" alargava o botão 25 px no clique e empurrava o texto ao
  // lado; quem usa leitor de tela ouve o estado pelo aria-label e aria-busy.
  const syncButton = (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={syncing}
      aria-busy={syncing}
      aria-label={syncing ? 'Sincronizando' : 'Sincronizar agora'}
      className={`press flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-surface-2 px-4 text-[0.9375rem] font-semibold text-fg hover:bg-white/12 disabled:cursor-wait disabled:text-dim ${
        stale ? 'mt-3 w-full' : ''
      }`}
    >
      <RefreshIcon className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
      Sincronizar
    </button>
  )

  return (
    <section
      role={stale ? 'alert' : undefined}
      aria-label="Dados do banco"
      className={`rounded-[var(--radius-card)] p-4 font-ui ${
        stale ? 'bg-warning/[0.09] ring-1 ring-warning/30 ring-inset' : 'bg-surface'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* O ponto repete o estado em forma (anel vazado quando velho) além
            da cor, para não depender só dela. */}
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-full ${
            stale ? 'mt-[0.4rem] self-start ring-2 ring-warning ring-inset' : freshness === 'unknown' ? 'bg-faint' : 'bg-accent'
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-[0.9375rem] font-semibold ${stale ? 'text-warning' : 'text-fg'}`}>{title}</p>
          <p className="mt-0.5 text-[0.875rem] text-faint">
            {freshness === 'unknown'
              ? 'A Pluggy não respondeu agora. A fila continua valendo.'
              : stale
                ? `Última coleta ${age}. O normal é a cada 24 h.`
                : 'Dados do banco, via Open Finance'}
          </p>
        </div>

        {!stale && syncButton}
      </div>

      {stale && (
        <p className="mt-3 border-t border-separator pt-3 text-[0.875rem] leading-relaxed text-dim">
          Abra{' '}
          <a
            href={MEU_PLUGGY_CONNECTIONS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            o Meu Pluggy
          </a>
          , entre na conexão do banco e toque em <span className="text-fg">Atualizar</span> (não em
          Excluir, que quebra os vínculos). Quando terminar, volte e sincronize aqui.
        </p>
      )}

      {/* Velho, o botão desce para baixo das instruções, na largura toda: é o
          passo seguinte delas, e ao lado do título ele espremia o texto em
          três linhas numa tela de 375. */}
      {stale && syncButton}

      <p
        role="status"
        className={`text-[0.875rem] ${result ? 'mt-3 border-t border-separator pt-3' : 'sr-only'} ${
          result?.failed ? 'text-negative' : 'text-dim'
        }`}
      >
        {result?.text}
      </p>
    </section>
  )
}
