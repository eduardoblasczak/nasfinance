package br.com.ebls.nasfinance.realtime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.event.TransactionPhase;
import jakarta.inject.Inject;

/**
 * Repassa eventos de transacao para o hub SSE, mas <b>somente apos o commit</b>.
 * <p>
 * <b>Por que isso importa:</b> se o evento fosse publicado dentro do metodo
 * {@code @Transactional}, o navegador receberia a notificacao antes de a
 * transacao ser gravada. O dashboard reagiria recarregando os dados e leria um
 * estado que ainda nao inclui o lancamento novo — mostrando um total defasado,
 * de forma intermitente e dificil de reproduzir. Pior: se a transacao acabasse
 * revertida, o frontend teria exibido um lancamento que nunca existiu.
 * <p>
 * {@link TransactionPhase#AFTER_SUCCESS} resolve: o CDI segura o evento ate a
 * transacao confirmar, e o descarta se houver rollback.
 */
@ApplicationScoped
public class TransactionEventRelay {

    @Inject
    TransactionEventHub hub;

    void onTransactionChanged(@Observes(during = TransactionPhase.AFTER_SUCCESS) TransactionEvent event) {
        hub.publish(event);
    }
}
