package br.com.ebls.nasfinance.api;

import java.util.List;

import br.com.ebls.nasfinance.api.dto.AccountDto;
import br.com.ebls.nasfinance.api.dto.AccountRequest;
import br.com.ebls.nasfinance.service.AccountService;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Endpoints de contas.
 * <p>
 * O resource e uma casca fina: traduz HTTP para chamadas de servico e volta.
 * Toda regra vive em {@link AccountService}.
 */
@Path("/api/v1/accounts")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AccountResource {

    @Inject
    AccountService service;

    @GET
    public List<AccountDto> list(@QueryParam("includeArchived") boolean includeArchived) {
        return service.listAll(includeArchived);
    }

    @POST
    public Response create(@Valid AccountRequest request) {
        AccountDto created = service.create(request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @PUT
    @Path("/{id}")
    public AccountDto update(@PathParam("id") Long id, @Valid AccountRequest request) {
        return service.update(id, request);
    }

    @POST
    @Path("/{id}/archive")
    public Response archive(@PathParam("id") Long id) {
        service.archive(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/{id}/unarchive")
    public Response unarchive(@PathParam("id") Long id) {
        service.unarchive(id);
        return Response.noContent().build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") Long id) {
        service.delete(id);
        return Response.noContent().build();
    }
}
