package br.com.ebls.nasfinance.api;

import java.util.List;

import br.com.ebls.nasfinance.api.dto.CategoryDto;
import br.com.ebls.nasfinance.api.dto.CategoryRequest;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.service.CategoryService;
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

/** Endpoints de categorias. */
@Path("/api/v1/categories")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class CategoryResource {

    @Inject
    CategoryService service;

    /**
     * @param flow filtro opcional; omitido devolve despesas e receitas juntas
     */
    @GET
    public List<CategoryDto> list(@QueryParam("flow") Flow flow,
                                  @QueryParam("includeArchived") boolean includeArchived) {
        return service.list(flow, includeArchived);
    }

    @POST
    public Response create(@Valid CategoryRequest request) {
        CategoryDto created = service.create(request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @PUT
    @Path("/{id}")
    public CategoryDto update(@PathParam("id") Long id, @Valid CategoryRequest request) {
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
