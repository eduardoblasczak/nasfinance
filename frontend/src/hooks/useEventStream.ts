import { useEffect, useRef, useState } from 'react'
import type { TransactionEvent } from '@/types'

export type StreamStatus = 'connecting' | 'open' | 'closed'

/**
 * Assina o canal SSE do backend e chama `onEvent` a cada mudanca de transacao.
 *
 * O `EventSource` do navegador ja reconecta sozinho quando a conexao cai — e
 * ela vai cair, com o servidor em WiFi atras de um tunel. Nao ha necessidade
 * de logica propria de retry; basta refletir o estado na interface.
 *
 * O callback e guardado numa ref, e nao usado direto na dependencia do efeito.
 * Sem isso, uma funcao recriada a cada render (o caso normal) faria o efeito
 * desmontar e remontar a conexao continuamente — abrindo e fechando o stream
 * a cada render em vez de manter uma conexao estavel.
 */
export function useEventStream(onEvent: (event: TransactionEvent) => void): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const callbackRef = useRef(onEvent)

  // Mantem a ref sempre com a versao mais recente do callback
  useEffect(() => {
    callbackRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    const source = new EventSource('/api/v1/events/stream')

    source.onopen = () => setStatus('open')

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TransactionEvent

        // O heartbeat existe apenas para manter a conexao viva atraves do
        // Cloudflare Tunnel; nao representa mudanca nenhuma nos dados.
        if (event.type === 'HEARTBEAT') {
          return
        }

        callbackRef.current(event)
      } catch {
        // Uma mensagem malformada nao pode derrubar o stream inteiro
      }
    }

    source.onerror = () => {
      // O EventSource ja vai tentar reconectar sozinho
      setStatus(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting')
    }

    return () => source.close()
  }, [])

  return status
}
