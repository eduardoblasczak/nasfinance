package br.com.ebls.nasfinance.api;

import java.util.List;
import java.util.Map;

import br.com.ebls.nasfinance.api.dto.TransactionDto;
import br.com.ebls.nasfinance.service.ReviewService;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/**
 * Fila de revisao: o que a sincronizacao trouxe e nao pode decidir sozinha.
 */
@Path("/api/v1/review")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ReviewResource {

    @Inject
    ReviewService service;

    @GET
    public List<TransactionDto> pending() {
        return service.pending();
    }

    /**
     * So a contagem.
     * <p>
     * Existe separado do {@code GET /} para a navegacao poder mostrar um
     * contador sem baixar a fila inteira em toda troca de tela.
     */
    @GET
    @Path("/count")
    public Map<String, Long> count() {
        return Map.of("pending", service.pendingCount());
    }

    @POST
    @Path("/{id}/categorize/{categoryId}")
    public TransactionDto categorize(@PathParam("id") Long id,
            @PathParam("categoryId") Long categoryId) {
        return service.categorize(id, categoryId);
    }

    @POST
    @Path("/{id}/dismiss")
    public TransactionDto dismiss(@PathParam("id") Long id) {
        return service.dismiss(id);
    }

    /** Confirma a duplicata e consolida. Ver {@code ReviewService#merge}. */
    @POST
    @Path("/{id}/merge")
    public TransactionDto merge(@PathParam("id") Long id) {
        return service.merge(id);
    }
}
