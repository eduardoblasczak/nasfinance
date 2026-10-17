package br.com.ebls.nasfinance.api;

import java.util.List;

import br.com.ebls.nasfinance.api.dto.PluggyAccountDto;
import br.com.ebls.nasfinance.api.dto.PluggyLinkRequest;
import br.com.ebls.nasfinance.api.dto.PluggyStatusDto;
import br.com.ebls.nasfinance.api.dto.PluggySyncRunDto;
import br.com.ebls.nasfinance.service.PluggyLinkService;
import br.com.ebls.nasfinance.service.PluggySyncService;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Configuracao da integracao com a Pluggy.
 * <p>
 * Protegido pelo Cloudflare Access como todo o resto do site — nao tem (nem
 * precisa de) o token do Atalho, porque e consumido pelo navegador ja
 * autenticado na borda.
 */
@Path("/api/v1/pluggy")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PluggyResource {

    @Inject
    PluggyLinkService service;

    @Inject
    PluggySyncService syncService;

    /** Estado da integracao: ligada, configurada, ultima coleta, ultima execucao. */
    @GET
    @Path("/status")
    public PluggyStatusDto status() {
        return service.status();
    }

    /**
     * Contas da Pluggy, com o vinculo de cada uma.
     * <p>
     * Devolve lista vazia quando a integracao esta desligada ou sem
     * credenciais, em vez de erro: a tela de configuracao precisa abrir
     * normalmente antes de a integracao existir.
     */
    @GET
    @Path("/accounts")
    public List<PluggyAccountDto> accounts() {
        return service.listPluggyAccounts();
    }

    @POST
    @Path("/links")
    public Response link(@Valid PluggyLinkRequest request) {
        service.link(request);
        return Response.status(Response.Status.CREATED).build();
    }

    @DELETE
    @Path("/links/{id}")
    public Response unlink(@PathParam("id") Long id) {
        service.unlink(id);
        return Response.noContent().build();
    }

    /**
     * Roda a sincronizacao agora, sem esperar o horario agendado.
     * <p>
     * Devolve 200 mesmo quando a sincronizacao falha: o resultado esta no
     * corpo ({@code status = FAILED} e a mensagem). Transformar em 5xx faria a
     * tela mostrar "erro de servidor" quando o servidor funcionou
     * perfeitamente e quem esta fora do ar e a Pluggy.
     */
    @POST
    @Path("/sync")
    public PluggySyncRunDto syncNow() {
        return PluggySyncRunDto.from(syncService.sync());
    }
}
