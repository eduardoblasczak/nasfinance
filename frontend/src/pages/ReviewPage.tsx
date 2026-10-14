import { useCallback, useEffect, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { useReferenceData } from '@/hooks/useReferenceData'
import { REVIEW_CHANGED } from '@/hooks/usePendingReview'
import type { Transaction } from '@/types'

/**
 * Fila de revisão: o que a sincronização trouxe e não pôde decidir sozinha.
 *
 * Três situações caem aqui, e a tela diz qual é em cada linha. Duas delas a
 * máquina poderia ter "resolvido" sozinha e deliberadamente não resolve:
 * fundir duplicatas automaticamente apagaria compras legítimas (dois cafés de
 * R$ 12 no mesmo dia são duas compras), e classificar com a categoria da
 * Pluggy produziria um dashboard que parece certo e não é.
 */
export function ReviewPage() {
  const [items, setItems] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const { categories } = useReferenceData()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await api.get<Transaction[]>('/api/v1/review'))
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

  async function act(id: number, run: () => Promise<unknown>) {
    setBusy(id)
    try {
      await run()
      setError(null)
      await load()
      // Avisa o contador da navegação: estas ações não passam pelo SSE.
      window.dispatchEvent(new Event(REVIEW_CHANGED))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Não foi possível concluir')
    } finally {
      setBusy(null)
    }
  }

  const selectClass =
    'min-h-11 border border-border bg-void px-3 font-mono text-2xs text-dim outline-none transition-colors duration-300 hover:border-faint hover:text-fg focus:border-accent/50'

  const actionClass =
    'min-h-11 border border-border px-4 font-mono text-2xs tracking-[0.08em] uppercase text-dim transition-all duration-400 hover:border-faint hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="mx-auto max-w-[1200px] px-8 pb-24 sm:px-12">
      <div className="rise pt-20 pb-12">
        <div className="eyebrow mb-5">revisão</div>
        <p className="font-mono text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.9] font-light tracking-[-0.045em] text-fg tabular">
          {String(items.length).padStart(2, '0')}
        </p>
        <p className="mt-5 max-w-[46rem] text-sm text-faint">
          Lançamentos importados que precisam de uma decisão sua. A sincronização
          propõe; ela nunca funde nem classifica sozinha.
        </p>
      </div>

      {error && (
        <p className="mb-6 border border-negative/40 bg-negative/10 px-5 py-4 text-sm text-fg">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-px border border-ghost p-5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse bg-white/2" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-ghost px-6 py-24 text-center">
          <p className="text-sm text-dim">Nada para revisar.</p>
          <p className="mt-3 text-xs text-faint">
            Tudo que a Pluggy trouxe já está classificado e conferido.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const expense = item.flow === 'EXPENSE'
            const working = busy === item.id

            return (
              <li key={item.id} className="panel px-7 py-6">
                {/* ---- o lançamento ---- */}
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">{item.description || '—'}</p>
                    <p className="mt-2 font-mono text-2xs tracking-[0.08em] text-faint uppercase">
                      {formatDate(item.occurredOn)} · {item.accountName} · {item.source}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 font-mono text-lg tabular ${expense ? 'text-fg' : 'text-accent'}`}
                  >
                    {expense ? '−' : '+'} {formatCurrency(item.amount)}
                  </p>
                </div>

                {/* ---- por que está aqui ---- */}
                {item.reviewReason === 'POSSIBLE_DUPLICATE' && item.duplicateOfId && (
                  <div className="mt-5 border border-border/60 bg-white/2 px-4 py-3">
                    <p className="eyebrow mb-2">possível duplicata</p>
                    <p className="text-xs text-dim">
                      Parece o mesmo gasto de{' '}
                      <span className="text-fg">
                        {item.duplicateOfDescription || 'um lançamento sem descrição'}
                      </span>{' '}
                      em {item.duplicateOfDate ? formatDate(item.duplicateOfDate) : '—'}, lançado
                      por {item.duplicateOfSource}.
                    </p>
                    <p className="mt-2 text-2xs text-faint">
                      Consolidar mantém este e apaga o outro — a chave que impede a reimportação
                      vive neste aqui.
                    </p>
                  </div>
                )}

                {item.reviewReason === 'POSSIBLE_TRANSFER' && (
                  <div className="mt-5 border border-border/60 bg-white/2 px-4 py-3">
                    <p className="eyebrow mb-2">possível transferência</p>
                    <p className="text-xs text-dim">
                      O valor e a data batem com um pagamento de fatura visto no cartão. Se for
                      isso, não é uma despesa nova: as compras já entraram uma a uma.
                    </p>
                  </div>
                )}

                {!item.reviewReason && !item.categoryId && (
                  <div className="mt-5 border border-border/60 bg-white/2 px-4 py-3">
                    <p className="eyebrow mb-2">sem categoria</p>
                    {item.notes?.includes('categoria sugerida') && (
                      <p className="text-xs text-dim">
                        {item.notes.split('|').find((part) => part.includes('categoria sugerida'))}
                      </p>
                    )}
                  </div>
                )}

                {/* ---- ações ---- */}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {!item.categoryId && (
                    <select
                      defaultValue=""
                      disabled={working}
                      onChange={(event) => {
                        if (!event.target.value) return
                        void act(item.id, () =>
                          api.post(`/api/v1/review/${item.id}/categorize/${event.target.value}`),
                        )
                      }}
                      aria-label={`Categoria para ${item.description || 'o lançamento'}`}
                      className={selectClass}
                    >
                      <option value="">classificar como…</option>
                      {categories
                        .filter((category) => category.flow === item.flow && !category.archived)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                  )}

                  {item.duplicateOfId && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void act(item.id, () => api.post(`/api/v1/review/${item.id}/merge`))}
                      className={actionClass}
                    >
                      é duplicata — consolidar
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={working}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Tirar este lançamento de todos os totais?\n\nEle continua no banco de propósito: é o que impede a sincronização de trazê-lo de volta amanhã.',
                        )
                      )
                        return
                      void act(item.id, () => api.post(`/api/v1/review/${item.id}/ignore`))
                    }}
                    className={actionClass}
                  >
                    não contar
                  </button>

                  {item.reviewStatus === 'PENDING' && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void act(item.id, () => api.post(`/api/v1/review/${item.id}/dismiss`))}
                      className={actionClass}
                    >
                      está certo assim
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
