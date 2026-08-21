package br.com.ebls.nasfinance.api.security;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import io.quarkus.runtime.LaunchMode;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

/**
 * Impede a aplicacao de subir em producao com o token de desenvolvimento.
 * <p>
 * Sem essa verificacao, esquecer de definir {@code SHORTCUT_TOKEN} no
 * {@code .env} do servidor deixaria o endpoint de lancamento protegido por um
 * token que esta escrito, em texto claro, dentro do repositorio. E uma falha
 * silenciosa: tudo funcionaria normalmente, e nada indicaria o problema.
 * <p>
 * Falhar na subida transforma isso em erro imediato e obvio no
 * {@code docker logs}.
 */
@ApplicationScoped
public class ShortcutTokenGuard {

    private static final Logger LOG = Logger.getLogger(ShortcutTokenGuard.class);
    private static final String DEV_DEFAULT = "dev-token-trocar-em-producao";
    private static final int MIN_LENGTH = 24;

    @ConfigProperty(name = "nasfinance.shortcut.token")
    String token;

    void onStart(@Observes StartupEvent event) {
        boolean production = LaunchMode.current() == LaunchMode.NORMAL;

        if (!production) {
            if (DEV_DEFAULT.equals(token)) {
                LOG.info("Usando o token de desenvolvimento para /api/v1/quick-entry");
            }
            return;
        }

        if (DEV_DEFAULT.equals(token)) {
            throw new IllegalStateException("""
                    SHORTCUT_TOKEN nao foi definido: a aplicacao esta usando o token \
                    padrao de desenvolvimento, que e publico (esta versionado no \
                    repositorio). Gere um token e defina-o no .env antes de subir. \
                    Ex.: openssl rand -hex 32""");
        }

        if (token == null || token.length() < MIN_LENGTH) {
            throw new IllegalStateException(
                    "SHORTCUT_TOKEN muito curto: use pelo menos " + MIN_LENGTH
                            + " caracteres. Ex.: openssl rand -hex 32");
        }
    }
}
