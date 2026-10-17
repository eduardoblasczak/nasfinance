package br.com.ebls.nasfinance.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import br.com.ebls.nasfinance.api.dto.PluggyAccountDto;
import br.com.ebls.nasfinance.api.dto.PluggyLinkRequest;
import br.com.ebls.nasfinance.api.dto.PluggyStatusDto;
import br.com.ebls.nasfinance.api.error.BusinessException;
import br.com.ebls.nasfinance.domain.Account;
import br.com.ebls.nasfinance.domain.PluggyAccountLink;
import br.com.ebls.nasfinance.domain.PluggySyncRun;
import br.com.ebls.nasfinance.pluggy.PluggyClient;
import br.com.ebls.nasfinance.pluggy.PluggyException;
import br.com.ebls.nasfinance.pluggy.PluggyModels;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

/**
 * Vinculo entre contas da Pluggy e contas daqui.
 * <p>
 * Esta e a peca que a sincronizacao inteira depende: a Pluggy devolve
 * {@code "PICPAY INSTITUICAO DE PAGAMENTO S.A"}, e so o dono sabe que aquilo e
 * a "Conta Corrente" dele. Sem o vinculo, nao ha onde gravar.
 */
@ApplicationScoped
public class PluggyLinkService {

    private static final Logger LOG = Logger.getLogger(PluggyLinkService.class);

    @ConfigProperty(name = "nasfinance.pluggy.enabled")
    boolean enabled;

    // Optional pelo mesmo motivo do PluggyClient: `${PLUGGY_ITEM_ID:}` vira
    // string vazia, que o SmallRye converte em null.
    @ConfigProperty(name = "nasfinance.pluggy.item-id")
    Optional<String> itemIdConfig;

    @Inject
    PluggyClient client;

    private String itemId() {
        return itemIdConfig.orElse("");
    }

    /**
     * Contas da Pluggy, cada uma com o vinculo que tem (ou nao) aqui.
     * <p>
     * Chama a API a cada carregamento de proposito: sao duas contas e uma
     * requisicao, e o custo de mostrar uma lista desatualizada — alguem
     * tentando vincular uma conta que nao existe mais — e maior.
     */
    public List<PluggyAccountDto> listPluggyAccounts() {
        if (!enabled || !client.isConfigured() || itemId().isBlank()) {
            return List.of();
        }

        String apiKey = client.authenticate();
        List<PluggyModels.Account> remote = client.fetchAccounts(apiKey, itemId());

        Map<String, PluggyAccountLink> links = PluggyAccountLink.<PluggyAccountLink>listAll()
                .stream()
                .collect(Collectors.toMap(link -> link.pluggyAccountId, Function.identity()));

        return remote.stream()
                .map(account -> {
                    PluggyAccountLink link = links.get(account.id());
                    return new PluggyAccountDto(
                            account.id(),
                            account.name(),
                            account.type(),
                            account.subtype(),
                            account.balance(),
                            link == null ? null : link.id,
                            link == null ? null : link.account.id,
                            link == null ? null : link.account.name);
                })
                .toList();
    }

    @Transactional
    public void link(PluggyLinkRequest request) {
        Account account = Account.<Account>findByIdOptional(request.accountId())
                .orElseThrow(() -> BusinessException.notFound(
                        "Conta " + request.accountId() + " nao encontrada"));

        if (PluggyAccountLink.isLinked(request.pluggyAccountId())) {
            throw BusinessException.conflict(
                    "Esta conta da Pluggy ja esta vinculada. Remova o vinculo antes de criar outro.");
        }

        // Busca o nome e o tipo na API em vez de aceitar do cliente: sao
        // dados de exibicao, e deixar o frontend enviá-los abriria espaco
        // para um vinculo que mostra "Conta Corrente" e aponta para o cartao.
        String apiKey = client.authenticate();
        PluggyModels.Account remote = client.fetchAccounts(apiKey, itemId()).stream()
                .filter(a -> a.id().equals(request.pluggyAccountId()))
                .findFirst()
                .orElseThrow(() -> BusinessException.notFound(
                        "Conta " + request.pluggyAccountId() + " nao existe na Pluggy"));

        PluggyAccountLink link = new PluggyAccountLink();
        link.pluggyAccountId = remote.id();
        link.account = account;
        link.pluggyName = remote.name();
        link.pluggyType = remote.type();
        link.persist();

        LOG.infof("Conta da Pluggy '%s' vinculada a '%s'", remote.name(), account.name);
    }

    @Transactional
    public void unlink(Long linkId) {
        PluggyAccountLink link = PluggyAccountLink.<PluggyAccountLink>findByIdOptional(linkId)
                .orElseThrow(() -> BusinessException.notFound("Vinculo " + linkId + " nao encontrado"));
        link.delete();
    }

    /** Estado da integracao para a tela de configuracao. */
    public PluggyStatusDto status() {
        long linked = PluggyAccountLink.count();
        PluggySyncRun last = PluggySyncRun.last();

        String itemStatus = null;
        java.time.OffsetDateTime itemLastUpdate = null;

        if (enabled && client.isConfigured() && !itemId().isBlank()) {
            try {
                PluggyModels.Item item = client.fetchItem(client.authenticate(), itemId());
                itemStatus = item.status();
                itemLastUpdate = item.lastUpdatedAt();
            } catch (PluggyException e) {
                // A tela de status nao pode quebrar porque a Pluggy esta fora:
                // e justamente quando ela mais precisa ser aberta.
                LOG.warnf("Nao foi possivel ler o item da Pluggy: %s", e.getMessage());
                itemStatus = "INDISPONIVEL";
            }
        }

        return new PluggyStatusDto(
                enabled,
                client.isConfigured(),
                itemStatus,
                itemLastUpdate,
                last == null ? null : last.startedAt,
                last == null ? null : last.status.name(),
                last == null ? null : last.error,
                linked);
    }
}
