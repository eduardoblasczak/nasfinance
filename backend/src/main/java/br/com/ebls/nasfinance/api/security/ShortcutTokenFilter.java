package br.com.ebls.nasfinance.api.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import br.com.ebls.nasfinance.api.error.ErrorResponse;
import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

/**
 * Valida o token Bearer estatico dos endpoints marcados com
 * {@link ShortcutSecured}.
 * <p>
 * <b>Por que um token estatico basta aqui:</b> a aplicacao e monousuario e nunca
 * fica exposta diretamente na internet — o acesso passa pelo Cloudflare Tunnel.
 * Montar login com sessao, hash de senha e refresh de token seria complexidade
 * sem beneficio real, e o Atalho do iOS nao teria como manter sessao mesmo.
 * <p>
 * O que <b>nao</b> pode acontecer: o token ir para o repositorio. Ele vem de
 * variavel de ambiente e o valor padrao serve apenas ao desenvolvimento local
 * — a aplicacao recusa esse padrao quando roda em producao.
 */
@Provider
@ShortcutSecured
@Priority(Priorities.AUTHENTICATION)
public class ShortcutTokenFilter implements ContainerRequestFilter {

    private static final Logger LOG = Logger.getLogger(ShortcutTokenFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    @ConfigProperty(name = "nasfinance.shortcut.token")
    String expectedToken;

    @Override
    public void filter(ContainerRequestContext requestContext) {
        String header = requestContext.getHeaderString(HttpHeaders.AUTHORIZATION);

        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            LOG.warnf("Requisicao ao endpoint do Atalho sem header Authorization valido (origem: %s)",
                    requestContext.getUriInfo().getRequestUri());
            abort(requestContext, "Token de acesso ausente");
            return;
        }

        String provided = header.substring(BEARER_PREFIX.length()).trim();

        if (!constantTimeEquals(provided, expectedToken)) {
            LOG.warn("Token invalido no endpoint do Atalho");
            abort(requestContext, "Token de acesso invalido");
        }
    }

    /**
     * Compara em tempo constante.
     * <p>
     * {@code String.equals} retorna assim que encontra o primeiro caractere
     * diferente. A diferenca de tempo entre "errou no 1o caractere" e "errou no
     * 20o" e mensuravel pela rede e permite descobrir o token caractere a
     * caractere. {@link MessageDigest#isEqual} percorre sempre o buffer inteiro.
     */
    private static boolean constantTimeEquals(String provided, String expected) {
        byte[] a = provided.getBytes(StandardCharsets.UTF_8);
        byte[] b = expected.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(a, b);
    }

    private static void abort(ContainerRequestContext context, String message) {
        context.abortWith(Response
                .status(Response.Status.UNAUTHORIZED)
                .type(MediaType.APPLICATION_JSON)
                .entity(ErrorResponse.of(401, message))
                .build());
    }
}
