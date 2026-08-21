package br.com.ebls.nasfinance.api;

import java.time.LocalDate;

import org.jboss.resteasy.reactive.RestQuery;

import br.com.ebls.nasfinance.api.dto.PageResponse;
import br.com.ebls.nasfinance.api.dto.TransactionDto;
import br.com.ebls.nasfinance.api.dto.TransactionRequest;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.service.TransactionService;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/** Endpoints de transacoes usados pela interface web. */
@Path("/api/v1/transactions")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class TransactionResource {

    @Inject
    TransactionService service;

    /**
     * Listagem paginada. Todos os filtros sao opcionais e combinaveis.
     * <p>
     * Datas em ISO-8601 ({@code 2026-08-21}); o Quarkus converte para
     * {@link LocalDate} automaticamente.
     */
    @GET
    public PageResponse<TransactionDto> list(@RestQuery LocalDate from,
                                             @RestQuery LocalDate to,
                                             @RestQuery Long accountId,
                                             @RestQuery Long categoryId,
                                             @RestQuery Flow flow,
                                             @RestQuery @DefaultValue("0") int page,
                                             @RestQuery @DefaultValue("50") int size) {
        return service.search(from, to, accountId, categoryId, flow, page, size);
    }

    @GET
    @Path("/{id}")
    public TransactionDto findById(@PathParam("id") Long id) {
        return service.findById(id);
    }

    @POST
    public Response create(@Valid TransactionRequest request) {
        TransactionDto created = service.create(request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @PUT
    @Path("/{id}")
    public TransactionDto update(@PathParam("id") Long id, @Valid TransactionRequest request) {
        return service.update(id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") Long id) {
        service.delete(id);
        return Response.noContent().build();
    }
}
