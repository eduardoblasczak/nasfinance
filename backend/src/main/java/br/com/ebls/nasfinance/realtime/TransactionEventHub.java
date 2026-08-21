package br.com.ebls.nasfinance.realtime;

import org.jboss.logging.Logger;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Barramento em memoria que distribui eventos de transacao para todos os
 * navegadores conectados via SSE.
 * <p>
 * <b>Por que {@link BroadcastProcessor}:</b> ele entrega cada evento a todos os
 * assinantes ativos e descarta eventos quando nao ha ninguem escutando — que e
 * exatamente o comportamento desejado aqui. Nao existe replay: quem abre o
 * dashboard depois carrega o estado atual pela API REST e so entao passa a
 * receber as mudancas seguintes.
 * <p>
 * <b>Limite consciente:</b> por ser em memoria, isso funciona com uma unica
 * instancia da aplicacao. Se um dia houver mais de uma replica, os eventos
 * precisariam passar por algo externo (Redis pub/sub, NOTIFY do Postgres).
 * Para um app pessoal rodando num container so, e desnecessario.
 */
@ApplicationScoped
public class TransactionEventHub {

    private static final Logger LOG = Logger.getLogger(TransactionEventHub.class);

    private final BroadcastProcessor<TransactionEvent> processor = BroadcastProcessor.create();

    /** Publica um evento para todos os clientes conectados. */
    public void publish(TransactionEvent event) {
        LOG.debugf("Publicando evento %s para transacao %d", event.type(), event.transactionId());
        processor.onNext(event);
    }

    /** Fluxo consumido pelo endpoint SSE. */
    public Multi<TransactionEvent> stream() {
        return processor;
    }
}
