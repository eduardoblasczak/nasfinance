package br.com.ebls.nasfinance.api;

import java.util.List;

import io.vertx.ext.web.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

/**
 * Faz as rotas do React funcionarem quando acessadas diretamente.
 * <p>
 * <b>O problema:</b> em producao quem serve a interface e o proprio Quarkus,
 * a partir dos arquivos estaticos. Ele procura no disco um arquivo com o nome
 * do caminho pedido — e {@code /lancamentos} nao existe como arquivo, porque
 * essa rota so existe dentro do React Router, no navegador. Resultado: 404.
 * <p>
 * O sintoma e traicoeiro porque a navegacao <i>dentro</i> do app funciona: o
 * React troca a tela sem pedir nada ao servidor. Quebra apenas quando o
 * navegador realmente faz a requisicao — F5 na pagina, link salvo nos
 * favoritos, ou URL compartilhada. E nao aparece em desenvolvimento, porque
 * la quem serve e o Vite, que ja resolve isso sozinho.
 * <p>
 * <b>A correcao:</b> para cada rota do cliente, devolver o {@code index.html}.
 * O {@code reroute} e interno ao servidor — a URL no navegador continua sendo
 * {@code /lancamentos}, entao o React Router le o caminho e abre a tela certa.
 * <p>
 * <b>Ao criar uma pagina nova no React, adicione a rota aqui.</b> A lista e
 * explicita, e nao um curinga do tipo {@code /*}, porque um curinga
 * capturaria tambem {@code /api} e {@code /q} e exigiria excecoes cuidadosas
 * — trocando um erro visivel (404 na tela nova) por um invisivel (a API
 * respondendo HTML). Esquecer de adicionar aqui falha de forma obvia.
 */
@ApplicationScoped
public class SpaRoutes {

    /** Precisa espelhar as rotas declaradas em {@code frontend/src/App.tsx}. */
    private static final List<String> CLIENT_ROUTES = List.of(
            "/lancamentos");

    void registerClientRoutes(@Observes Router router) {
        for (String route : CLIENT_ROUTES) {
            router.get(route).handler(context -> context.reroute("/"));
        }
    }
}
