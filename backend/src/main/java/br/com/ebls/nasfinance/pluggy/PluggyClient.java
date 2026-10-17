package br.com.ebls.nasfinance.pluggy;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Cliente da API da Pluggy.
 * <p>
 * <b>Por que o {@link HttpClient} do JDK e nao o REST Client do Quarkus.</b>
 * Dois motivos. O primeiro e a paginacao: o campo {@code next} vem como query
 * string pronta para concatenar literalmente, e isso nao mapeia bem para uma
 * interface declarativa — sairia um metodo artificial recebendo a string
 * inteira. O segundo e o tamanho: a VM tem 954 MiB e o Jackson ja esta
 * presente, entao nao ha motivo para trazer uma extensao inteira para fazer
 * quatro chamadas HTTP.
 * <p>
 * <b>Sobre a apiKey.</b> Ela e de curta duracao e obtida sob demanda. Nao vale
 * a pena cachear com controle de expiracao: a sincronizacao roda uma vez por
 * dia, entao seriam quatro requisicoes a mais por dia em troca de nao ter
 * codigo de renovacao — e codigo de renovacao mal testado e exatamente o que
 * quebra as 3h da manha.
 */
@ApplicationScoped
public class PluggyClient {

    private static final Logger LOG = Logger.getLogger(PluggyClient.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    /** Teto de paginas por conta. Protege contra um `next` que nunca vira nulo. */
    private static final int MAX_PAGES = 40;

    @ConfigProperty(name = "nasfinance.pluggy.base-url")
    String baseUrl;

    /**
     * {@code Optional<String>} e nao {@code String}: a propriedade e definida
     * como {@code ${PLUGGY_CLIENT_ID:}}, que expande para string vazia quando
     * a variavel nao existe — e o SmallRye converte valor vazio em {@code null},
     * fazendo a injecao de {@code String} falhar no boot.
     * <p>
     * O {@code defaultValue} do {@code @ConfigProperty} nao resolve: ele so
     * vale quando a propriedade esta AUSENTE, nao quando esta presente e
     * vazia. Sem isto, a aplicacao inteira se recusava a subir enquanto a
     * Pluggy nao estivesse configurada — o oposto do que ela deve fazer.
     */
    @ConfigProperty(name = "nasfinance.pluggy.client-id")
    Optional<String> clientId;

    @ConfigProperty(name = "nasfinance.pluggy.client-secret")
    Optional<String> clientSecret;

    @Inject
    ObjectMapper mapper;

    private HttpClient http;

    @PostConstruct
    void init() {
        http = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                // A Pluggy responde 3xx em alguns caminhos; seguir redirect
                // evita um erro obscuro que na verdade e so um Location.
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    @PreDestroy
    void shutdown() {
        if (http != null) {
            http.close();
        }
    }

    public boolean isConfigured() {
        return !id().isBlank() && !secret().isBlank();
    }

    private String id() {
        return clientId.orElse("");
    }

    private String secret() {
        return clientSecret.orElse("");
    }

    // ---------------------------------------------------------------
    // Autenticacao
    // ---------------------------------------------------------------

    /** Troca client id/secret por uma apiKey de curta duracao. */
    public String authenticate() {
        if (!isConfigured()) {
            throw new PluggyException("Credenciais da Pluggy nao configuradas");
        }

        String body;
        try {
            body = mapper.writeValueAsString(
                    java.util.Map.of("clientId", id(), "clientSecret", secret()));
        } catch (Exception e) {
            throw new PluggyException("Falha ao montar o corpo de autenticacao", e);
        }

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/auth"))
                .header("Content-Type", "application/json")
                .timeout(TIMEOUT)
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        PluggyModels.AuthResponse auth = send(request, PluggyModels.AuthResponse.class, "/auth");
        if (auth.apiKey() == null || auth.apiKey().isBlank()) {
            throw new PluggyException("A Pluggy respondeu sem apiKey");
        }
        return auth.apiKey();
    }

    // ---------------------------------------------------------------
    // Recursos
    // ---------------------------------------------------------------

    public PluggyModels.Item fetchItem(String apiKey, String itemId) {
        return get(apiKey, "/items/" + itemId, PluggyModels.Item.class);
    }

    public List<PluggyModels.Account> fetchAccounts(String apiKey, String itemId) {
        PluggyModels.AccountPage page =
                get(apiKey, "/accounts?itemId=" + itemId, PluggyModels.AccountPage.class);
        return page.results() == null ? List.of() : page.results();
    }

    /**
     * Todas as transacoes de uma conta na janela, seguindo o cursor.
     * <p>
     * O endpoint antigo ({@code /transactions}, com {@code from}/{@code to} e
     * {@code pageSize}) responde {@code 410 ENDPOINT_DEPRECATED} — inclusive
     * para o exemplo que ainda consta no guia "Personal use" da documentacao.
     */
    public List<PluggyModels.Transaction> fetchTransactions(
            String apiKey, String accountId, LocalDate from, LocalDate to) {

        List<PluggyModels.Transaction> all = new ArrayList<>();

        String path = "/v2/transactions?accountId=" + accountId
                + "&dateFrom=" + from
                + "&dateTo=" + to;

        for (int page = 0; page < MAX_PAGES && path != null; page++) {
            PluggyModels.TransactionPage result =
                    get(apiKey, path, PluggyModels.TransactionPage.class);

            if (result.results() != null) {
                all.addAll(result.results());
            }

            // `next` ja e a query string completa; concatenar como esta e o
            // que a documentacao manda fazer.
            String next = result.next();
            path = (next == null || next.isBlank()) ? null : "/v2/transactions" + next;

            if (path != null && page == MAX_PAGES - 1) {
                LOG.warnf("Teto de %d paginas atingido na conta %s; pode haver mais dados",
                        MAX_PAGES, accountId);
            }
        }

        return all;
    }

    // ---------------------------------------------------------------
    // Transporte
    // ---------------------------------------------------------------

    private <T> T get(String apiKey, String path, Class<T> type) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .header("X-API-KEY", apiKey)
                .header("Accept", "application/json")
                .timeout(TIMEOUT)
                .GET()
                .build();
        return send(request, type, path);
    }

    private <T> T send(HttpRequest request, Class<T> type, String what) {
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new PluggyException("Falha de rede ao chamar " + what, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PluggyException("Interrompido ao chamar " + what, e);
        }

        if (response.statusCode() / 100 != 2) {
            // O corpo do erro entra na mensagem de proposito: foi exatamente
            // ele que revelou o 410 ENDPOINT_DEPRECATED. Um "HTTP 410" seco
            // teria mandado a investigacao para o lado errado.
            throw new PluggyException("HTTP " + response.statusCode() + " em " + what
                    + ": " + truncate(response.body()));
        }

        try {
            return mapper.readValue(response.body(), type);
        } catch (Exception e) {
            throw new PluggyException("Resposta ilegivel de " + what, e);
        }
    }

    private static String truncate(String body) {
        if (body == null) {
            return "(sem corpo)";
        }
        return body.length() <= 300 ? body : body.substring(0, 300) + "...";
    }
}
