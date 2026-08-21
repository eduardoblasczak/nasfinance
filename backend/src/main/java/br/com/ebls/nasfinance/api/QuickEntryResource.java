package br.com.ebls.nasfinance.api;

import java.util.List;

import br.com.ebls.nasfinance.api.dto.QuickEntryRequest;
import br.com.ebls.nasfinance.api.dto.TransactionDto;
import br.com.ebls.nasfinance.api.security.ShortcutSecured;
import br.com.ebls.nasfinance.domain.Account;
import br.com.ebls.nasfinance.domain.Category;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.service.TransactionService;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Lancamento rapido a partir do Atalho do iPhone.
 * <p>
 * Protegido por token Bearer estatico ({@link ShortcutSecured}), separado dos
 * endpoints da interface web porque tem um contrato proprio: recebe nomes em
 * vez de ids, para que o Atalho no iOS seja simples de montar e nao quebre
 * quando uma categoria for recadastrada.
 * <p>
 * Exemplo de uso a partir do iPhone (acao "Obter conteudo de URL"):
 * <pre>
 * URL     : https://financas.ebls.com.br/api/v1/quick-entry
 * Metodo  : POST
 * Headers : Authorization: Bearer &lt;SHORTCUT_TOKEN&gt;
 * Corpo   : JSON  { "amount": 45.90, "category": "Mercado", "account": "Vale Refeicao" }
 * </pre>
 */
@Path("/api/v1/quick-entry")
@ShortcutSecured
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class QuickEntryResource {

    @Inject
    TransactionService service;

    /** Registra a transacao e devolve 201 com o lancamento criado. */
    @POST
    public Response create(@Valid QuickEntryRequest request) {
        TransactionDto created = service.quickEntry(request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    /**
     * Opcoes validas de conta e categoria.
     * <p>
     * Serve para o Atalho montar os menus de escolha dinamicamente, em vez de
     * ter a lista escrita a mao dentro do iPhone — que sairia de sincronia no
     * dia em que uma categoria fosse criada pela interface web.
     */
    @GET
    @Path("/options")
    @Transactional
    public Options options() {
        return new Options(
                Account.listActive().stream().map(a -> a.name).toList(),
                Category.listActive(Flow.EXPENSE).stream().map(c -> c.name).toList(),
                Category.listActive(Flow.INCOME).stream().map(c -> c.name).toList());
    }

    /** Listas de nomes que o Atalho pode oferecer ao usuario. */
    public record Options(
            List<String> accounts,
            List<String> expenseCategories,
            List<String> incomeCategories) {
    }
}
