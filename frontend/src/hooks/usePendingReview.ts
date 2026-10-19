import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useEventStream } from './useEventStream'
import { DEMO } from '@/lib/demo'

/** Evento disparado pela fila quando um item é resolvido. */
export const REVIEW_CHANGED = 'nasfinance:review-changed'

/**
 * Quantos lançamentos aguardam revisão.
 *
 * Endpoint próprio, separado da fila em si: a navegação mostra o número em
 * toda tela, e baixar a fila inteira a cada troca de página para exibir um
 * contador seria desperdício.
 *
 * Falha em silêncio de propósito. É um badge — se a chamada der errado, o
 * número some e nada mais acontece. Um erro na tela por causa disso seria
 * pior que a ausência do contador.
 */
export function usePendingReview(): number {
  const [pending, setPending] = useState(0)

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ pending: number }>('/api/v1/review/count')
      setPending(result.pending)
    } catch {
      setPending(0)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Um lançamento vindo do Atalho pode criar — ou resolver — uma suspeita de
  // duplicata, então o contador acompanha o mesmo canal que já mantém o
  // dashboard vivo.
  // Na demonstracao, nada que um visitante lanca entra na fila (origem nunca
  // e o Open Finance), entao nao ha o que ouvir — e cada aba ouvindo era uma
  // recarga a mais por lancamento, gasta da cota gratuita.
  useEventStream(useCallback(() => void load(), [load]), { enabled: !DEMO })

  // As ações da própria fila não passam pelo SSE: elas acontecem no navegador
  // e o servidor não emite evento para elas. Sem isto, o badge continuava
  // mostrando 3 depois de resolver um item, contradizendo a tela ao lado.
  useEffect(() => {
    const onChanged = () => void load()
    window.addEventListener(REVIEW_CHANGED, onChanged)
    return () => window.removeEventListener(REVIEW_CHANGED, onChanged)
  }, [load])

  return pending
}
