import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiRequestError, buildQuery } from '@/lib/api'
import type { DashboardSummary } from '@/types'
import { useEventStream } from './useEventStream'

interface UseDashboardResult {
  data: DashboardSummary | null
  loading: boolean
  error: string | null
  /** true durante uma revalidacao disparada por evento, com dados ja na tela */
  refreshing: boolean
  reload: () => void
  streamStatus: ReturnType<typeof useEventStream>
}

/**
 * Carrega o resumo do dashboard e o mantem atualizado em tempo real.
 *
 * Quando chega um evento pelo SSE, recarregamos o resumo inteiro em vez de
 * aplicar a mudanca incrementalmente no estado local. Parece desperdicio, mas
 * e a escolha certa aqui: o resumo contem totais, medias, comparativo com o
 * periodo anterior e percentual de orcamento. Recalcular tudo isso no cliente
 * duplicaria a logica do backend — e as duas versoes divergiriam na primeira
 * regra nova. A resposta e pequena e a consulta e indexada.
 */
export function useDashboard(from: string, to: string): UseDashboardResult {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Evita que uma resposta lenta de um periodo antigo sobrescreva a de um
  // periodo novo (condicao de corrida ao trocar o filtro rapidamente).
  const requestIdRef = useRef(0)

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const requestId = ++requestIdRef.current

      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const query = buildQuery({ from, to })
        const summary = await api.get<DashboardSummary>(`/api/v1/dashboard${query}`)

        if (requestId === requestIdRef.current) {
          setData(summary)
          setError(null)
        }
      } catch (err) {
        if (requestId === requestIdRef.current) {
          setError(
            err instanceof ApiRequestError ? err.fullMessage : 'Erro inesperado ao carregar',
          )
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [from, to],
  )

  useEffect(() => {
    void load('initial')
  }, [load])

  const handleEvent = useCallback(() => {
    void load('refresh')
  }, [load])

  const streamStatus = useEventStream(handleEvent)

  return {
    data,
    loading,
    error,
    refreshing,
    reload: () => void load('refresh'),
    streamStatus,
  }
}
