package br.com.ebls.nasfinance.api;

import java.time.Duration;

import org.jboss.resteasy.reactive.RestStreamElementType;

import br.com.ebls.nasfinance.realtime.TransactionEvent;
import br.com.ebls.nasfinance.realtime.TransactionEventHub;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/**
 * Canal de tempo real do dashboard (Server-Sent Events).
 * <p>
 * <b>Por que SSE e nao WebSocket:</b> o fluxo aqui e unidirecional — o servidor
 * avisa o navegador que algo mudou, e o navegador nunca precisa responder por
 * esse canal. SSE roda sobre HTTP comum, o que significa que atravessa o
 * Cloudflare Tunnel sem configuracao especial de upgrade de protocolo, e o
 * {@code EventSource} do navegador ja reconecta sozinho ao cair. Um WebSocket
 * exigiria mais infraestrutura para entregar menos.
 */
@Path("/api/v1/events")
public class EventStreamResource {

    /** Abaixo do timeout de ocioso do Cloudflare Tunnel, com folga. */
    private static final Duration HEARTBEAT_INTERVAL = Duration.ofSeconds(25);

    @Inject
    TransactionEventHub hub;

    /**
     * Fluxo de eventos consumido pelo {@code EventSource} do navegador.
     * <p>
     * O retorno e um {@link Multi} (fluxo reativo). A conexao fica aberta e cada
     * item emitido vira um evento SSE. Nao ha polling: nada trafega enquanto
     * nada muda, exceto o heartbeat.
     */
    @GET
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<TransactionEvent> stream() {
        Multi<TransactionEvent> heartbeat = Multi.createFrom()
                .ticks().every(HEARTBEAT_INTERVAL)
                .onOverflow().drop()
                .map(tick -> TransactionEvent.heartbeat());

        return Multi.createBy().merging().streams(hub.stream(), heartbeat);
    }
}
