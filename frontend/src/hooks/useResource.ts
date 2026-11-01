import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '@/lib/api'

interface Resource<T> {
  data: T | null
  /** Primeira carga, sem nada na tela ainda: hora do esqueleto. */
  loading: boolean
  /** Troca de filtro com a resposta anterior ainda na tela. */
  refreshing: boolean
  error: string | null
  reload: () => void
}

/**
 * Uma leitura da API presa a uma chave (os filtros dela).
 *
 * Ao trocar o filtro, a resposta anterior fica na tela, esmaecida, até a nova
 * chegar: trocar por um esqueleto a cada toque faria a página pular e o
 * gráfico perder o lugar de onde anima. Resposta lenta de um filtro antigo
 * não sobrescreve a do novo (o mesmo cuidado do `useDashboard`).
 */
export function useResource<T>(key: string, load: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const loader = useRef(load)
  loader.current = load

  const run = useCallback(async () => {
    const id = ++requestId.current
    setPending(true)
    try {
      const result = await loader.current()
      if (id !== requestId.current) return
      setData(result)
      setError(null)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro inesperado ao carregar')
    } finally {
      if (id === requestId.current) setPending(false)
    }
  }, [])

  useEffect(() => {
    void run()
  }, [key, run])

  return {
    data,
    loading: pending && data === null,
    refreshing: pending && data !== null,
    error,
    reload: () => void run(),
  }
}
