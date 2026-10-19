import { useEffect, useRef, useState } from 'react'
import { DEMO } from '@/lib/demo'
import type { TransactionEvent } from '@/types'

export type StreamStatus = 'connecting' | 'open' | 'closed'

/**
 * Na demonstração pública, no máximo uma recarga a cada 15 s por aba. Cada
 * evento faz a tela buscar dados de novo, e numa demo aberta a qualquer um o
 * custo crescia com (abas abertas × lançamentos): 20 abas e um atacante no
 * teto global esgotavam a cota gratuita do dia em minutos. O primeiro evento
 * chega na hora; os seguintes da janela viram uma recarga só, no fim dela.
 */
const DEMO_MIN_INTERVAL_MS = 15_000

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
 *
 * `enabled: false` nao abre conexao nenhuma — para quem, na demonstracao, nao
 * tem o que ouvir.
 */
export function useEventStream(
  onEvent: (event: TransactionEvent) => void,
  { enabled = true }: { enabled?: boolean } = {},
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const callbackRef = useRef(onEvent)

  // Mantem a ref sempre com a versao mais recente do callback
  useEffect(() => {
    callbackRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!enabled) return

    let source: EventSource | null = null
    let lastDelivered = 0
    let pending: ReturnType<typeof setTimeout> | undefined

    const deliver = (event: TransactionEvent) => {
      if (!DEMO) {
        callbackRef.current(event)
        return
      }
      const wait = DEMO_MIN_INTERVAL_MS - (Date.now() - lastDelivered)
      if (wait <= 0) {
        lastDelivered = Date.now()
        callbackRef.current(event)
      } else if (pending === undefined) {
        pending = setTimeout(() => {
          pending = undefined
          lastDelivered = Date.now()
          callbackRef.current(event)
        }, wait)
      }
    }

    const open = () => {
      const current = new EventSource('/api/v1/events/stream')
      source = current

      current.onopen = () => setStatus('open')

      current.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as TransactionEvent

          // O heartbeat existe apenas para manter a conexao viva atraves do
          // Cloudflare Tunnel; nao representa mudanca nenhuma nos dados.
          if (event.type === 'HEARTBEAT') {
            return
          }

          deliver(event)
        } catch {
          // Uma mensagem malformada nao pode derrubar o stream inteiro
        }
      }

      current.onerror = () => {
        // O EventSource ja vai tentar reconectar sozinho
        setStatus(current.readyState === EventSource.CLOSED ? 'closed' : 'connecting')
      }
    }

    const close = () => {
      source?.close()
      source = null
    }

    open()
    if (!DEMO) return close

    // Na demonstracao, aba escondida nao segura conexao: cada uma mantem o
    // Durable Object escrevendo para ela. Ao voltar, reabre e recarrega uma
    // vez, porque o que aconteceu enquanto isso nao foi ouvido.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        close()
        setStatus('closed')
      } else if (!source) {
        open()
        deliver({ type: 'UPDATED', transaction: null, transactionId: null, at: new Date().toISOString() })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(pending)
      close()
    }
  }, [enabled])

  return status
}
