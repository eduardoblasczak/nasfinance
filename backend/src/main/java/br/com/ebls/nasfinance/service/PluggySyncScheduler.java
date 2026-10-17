package br.com.ebls.nasfinance.service;

import org.jboss.logging.Logger;

import br.com.ebls.nasfinance.domain.PluggySyncRun;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Dispara a sincronizacao com a Pluggy.
 * <p>
 * <b>Agendado, e nao webhook.</b> O site esta atras do Cloudflare Access: um
 * POST da Pluggy bateria na parede de login. Abrir excecao para ele exigiria
 * uma politica de Bypass, que desliga os controles e nao registra nada —
 * exatamente o que evitamos ao montar o Access. E como o conector pessoal
 * atualiza so a cada 24h, nao se perde nada esperando.
 */
@ApplicationScoped
public class PluggySyncScheduler {

    private static final Logger LOG = Logger.getLogger(PluggySyncScheduler.class);

    @Inject
    PluggySyncService service;

    /**
     * Uma vez por dia.
     * <p>
     * {@code ConcurrentExecution.SKIP}: se a execucao anterior ainda estiver
     * rodando, esta nao comeca. Duas sincronizacoes simultaneas disputariam as
     * mesmas chaves naturais e produziriam violacoes de indice unico em vez de
     * trabalho util.
     * <p>
     * O {@code @Scheduled} fica sempre ativo; quem decide se ha o que fazer e
     * o proprio servico, que encerra como {@code SKIPPED} quando a integracao
     * esta desligada. Assim o historico registra "rodou e nao havia nada", que
     * e diferente de "nao rodou".
     */
    @Scheduled(
            cron = "{nasfinance.pluggy.sync-cron}",
            timeZone = "{nasfinance.timezone}",
            concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void nightly() {
        PluggySyncRun run = service.sync();
        LOG.infof("Sincronizacao com a Pluggy: %s (importados=%d, ignorados=%d, revisao=%d)",
                run.status, run.imported, run.skipped, run.flagged);
    }
}
