package br.com.ebls.nasfinance.realtime;

import java.time.OffsetDateTime;

import br.com.ebls.nasfinance.api.dto.TransactionDto;

/**
 * Evento publicado quando uma transacao muda.
 * <p>
 * E o que trafega pelo canal SSE ate o navegador, permitindo ao dashboard
 * se atualizar sozinho quando um lancamento chega pelo Atalho do iPhone.
 */
public record TransactionEvent(
        Type type,
        TransactionDto transaction,
        Long transactionId,
        OffsetDateTime at) {

    public enum Type {
        CREATED,
        UPDATED,
        DELETED,

        /**
         * Pulso periodico sem significado de dominio.
         * <p>
         * Existe para manter a conexao SSE viva. O Cloudflare Tunnel encerra
         * conexoes ociosas (a casa dos 100 segundos), e um dashboard aberto
         * durante a noite ficaria mudo sem nunca sinalizar erro. O frontend
         * ignora este tipo, mas o trafego impede o encerramento.
         */
        HEARTBEAT
    }

    /** Pulso de keep-alive; nao carrega transacao. */
    public static TransactionEvent heartbeat() {
        return new TransactionEvent(Type.HEARTBEAT, null, null, OffsetDateTime.now());
    }

    public static TransactionEvent created(TransactionDto dto) {
        return new TransactionEvent(Type.CREATED, dto, dto.id(), OffsetDateTime.now());
    }

    public static TransactionEvent updated(TransactionDto dto) {
        return new TransactionEvent(Type.UPDATED, dto, dto.id(), OffsetDateTime.now());
    }

    /** Na exclusao nao ha mais DTO para enviar, so o id que sumiu. */
    public static TransactionEvent deleted(Long id) {
        return new TransactionEvent(Type.DELETED, null, id, OffsetDateTime.now());
    }
}
