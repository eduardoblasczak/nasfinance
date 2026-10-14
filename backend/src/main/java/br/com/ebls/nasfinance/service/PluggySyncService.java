package br.com.ebls.nasfinance.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.PluggyAccountLink;
import br.com.ebls.nasfinance.domain.PluggySyncRun;
import br.com.ebls.nasfinance.domain.ReviewReason;
import br.com.ebls.nasfinance.domain.ReviewStatus;
import br.com.ebls.nasfinance.domain.Transaction;
import br.com.ebls.nasfinance.domain.TransactionSource;
import br.com.ebls.nasfinance.pluggy.PluggyClient;
import br.com.ebls.nasfinance.pluggy.PluggyException;
import br.com.ebls.nasfinance.pluggy.PluggyModels;
import br.com.ebls.nasfinance.pluggy.PluggyTranslator;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Traz as transacoes da Pluggy para dentro do nasFinance.
 * <p>
 * As regras daqui sao as da secao 2 do {@code PLUGGY_SYNC.md}, e quase todas
 * existem por causa de algo medido na conta real — nao por precaucao abstrata.
 * <p>
 * <b>Nao e {@code @Transactional}.</b> O registro da execucao precisa
 * sobreviver a uma falha no meio: se tudo estivesse numa transacao so, um erro
 * reverteria tambem a linha que explica o erro, e o historico ficaria mudo
 * justamente quando mais importa. As escritas acontecem em transacoes
 * separadas, abertas explicitamente.
 */
@ApplicationScoped
public class PluggySyncService {

    private static final Logger LOG = Logger.getLogger(PluggySyncService.class);

    @ConfigProperty(name = "nasfinance.pluggy.enabled")
    boolean enabled;

    @ConfigProperty(name = "nasfinance.pluggy.item-id")
    Optional<String> itemIdConfig;

    @ConfigProperty(name = "nasfinance.pluggy.import-from")
    LocalDate importFrom;

    @ConfigProperty(name = "nasfinance.pluggy.window-days")
    int windowDays;

    @ConfigProperty(name = "nasfinance.pluggy.min-amount")
    BigDecimal minAmount;

    @ConfigProperty(name = "nasfinance.pluggy.duplicate-window-days")
    int duplicateWindowDays;

    @ConfigProperty(name = "nasfinance.timezone")
    String timezone;

    @Inject
    PluggyClient client;

    /**
     * Executa uma sincronizacao e devolve o registro dela.
     * <p>
     * Nunca lanca: a falha vira uma linha com {@code status = FAILED}. Quem
     * chama e um job agendado, e excecao propagada ali vira apenas uma stack
     * trace no log — que e exatamente o que esta tabela existe para evitar.
     */
    public PluggySyncRun sync() {
        PluggySyncRun run = QuarkusTransaction.requiringNew().call(() -> {
            PluggySyncRun fresh = new PluggySyncRun();
            fresh.startedAt = OffsetDateTime.now();
            fresh.persist();
            return fresh;
        });

        try {
            return execute(run.id);
        } catch (PluggyException e) {
            LOG.errorf("Sincronizacao com a Pluggy falhou: %s", e.getMessage());
            return finish(run.id, PluggySyncRun.Status.FAILED, e.getMessage(), null, 0, 0, 0, null, null);
        } catch (RuntimeException e) {
            LOG.error("Erro inesperado na sincronizacao com a Pluggy", e);
            return finish(run.id, PluggySyncRun.Status.FAILED,
                    e.getClass().getSimpleName() + ": " + e.getMessage(),
                    null, 0, 0, 0, null, null);
        }
    }

    // ---------------------------------------------------------------

    private PluggySyncRun execute(Long runId) {
        String itemId = itemIdConfig.orElse("");

        if (!enabled || !client.isConfigured() || itemId.isBlank()) {
            return finish(runId, PluggySyncRun.Status.SKIPPED,
                    "Integracao desligada ou sem credenciais", null, 0, 0, 0, null, null);
        }

        List<PluggyAccountLink> links = QuarkusTransaction.requiringNew()
                .call(PluggyAccountLink::listAllOrdered);

        if (links.isEmpty()) {
            return finish(runId, PluggySyncRun.Status.SKIPPED,
                    "Nenhuma conta da Pluggy vinculada", null, 0, 0, 0, null, null);
        }

        String apiKey = client.authenticate();
        PluggyModels.Item item = client.fetchItem(apiKey, itemId);

        if (!item.isUsable()) {
            // Consentimento expirado, erro de login, coleta em andamento. Nao
            // e falha nossa e nao deve virar FAILED — mas precisa aparecer,
            // senao a sincronizacao morre em silencio e so se descobre
            // sentindo falta dos lancamentos semanas depois.
            return finish(runId, PluggySyncRun.Status.SKIPPED,
                    "Item da Pluggy em estado '" + item.status() + "'",
                    item.lastUpdatedAt(), 0, 0, 0, null, null);
        }

        PluggySyncRun previous = QuarkusTransaction.requiringNew()
                .call(PluggySyncRun::lastSuccessful);

        if (previous != null && previous.itemLastUpdatedAt != null
                && previous.itemLastUpdatedAt.equals(item.lastUpdatedAt())) {
            return finish(runId, PluggySyncRun.Status.SKIPPED,
                    null, item.lastUpdatedAt(), 0, 0, 0, null, null);
        }

        ZoneId zone = ZoneId.of(timezone);
        LocalDate today = LocalDate.now(zone);

        // Janela NAO e a frequencia. O job roda diariamente, mas pergunta 90
        // dias para tras toda vez: sem isso, qualquer lancamento que o banco
        // postar com atraso nunca seria visto, porque no dia em que ele
        // apareceu ja teriamos perguntado por aquela data.
        LocalDate from = max(today.minusDays(windowDays), importFrom);
        LocalDate to = today;

        if (from.isAfter(to)) {
            return finish(runId, PluggySyncRun.Status.SKIPPED,
                    "Data de corte (" + importFrom + ") ainda nao chegou",
                    item.lastUpdatedAt(), 0, 0, 0, from, to);
        }

        Counters counters = new Counters();
        List<BillPayment> billPayments = new ArrayList<>();
        List<Pending> pending = new ArrayList<>();

        // Primeira passada: busca tudo e separa o que e pagamento de fatura.
        // Precisa vir antes de gravar qualquer coisa, porque e a lista de
        // pagamentos de fatura do cartao que permite reconhecer o debito
        // correspondente na conta corrente.
        for (PluggyAccountLink link : links) {
            List<PluggyModels.Transaction> remote =
                    client.fetchTransactions(apiKey, link.pluggyAccountId, from, to);

            LOG.infof("Pluggy: %d transacoes em '%s' (%s a %s)",
                    remote.size(), link.pluggyName, from, to);

            boolean isCard = "CREDIT".equalsIgnoreCase(link.pluggyType);

            for (PluggyModels.Transaction tx : remote) {
                LocalDate occurredOn = PluggyTranslator.occurredOn(tx, zone);
                BigDecimal amount = PluggyTranslator.amountOf(tx);

                if (occurredOn.isBefore(importFrom)) {
                    counters.skipped++;
                    continue;
                }

                // Corte de valor minimo. O PicPay arredonda PIX guardando o
                // troco no cofrinho, gerando lancamentos de centavos que
                // poluiriam a lista e a fila de revisao.
                if (PluggyTranslator.isBelowMinimum(amount, minAmount)) {
                    counters.skipped++;
                    continue;
                }

                if (isCard && tx.isBillPayment()) {
                    // Nao e receita: e a contrapartida do dinheiro que saiu da
                    // conta corrente. As compras ja foram lancadas como
                    // despesa quando ocorreram.
                    billPayments.add(new BillPayment(occurredOn, amount));
                    counters.skipped++;
                    continue;
                }

                pending.add(new Pending(link, tx, occurredOn, amount, isCard));
            }
        }

        // Segunda passada: grava.
        int imported = 0;
        int flagged = 0;

        for (Pending p : pending) {
            PersistResult result = QuarkusTransaction.requiringNew()
                    .call(() -> persist(p, billPayments));
            if (result.created()) {
                imported++;
                if (result.flagged()) {
                    flagged++;
                }
            } else {
                counters.skipped++;
            }
        }

        return finish(runId, PluggySyncRun.Status.SUCCESS, null, item.lastUpdatedAt(),
                imported, counters.skipped, flagged, from, to);
    }

    /**
     * Grava um lancamento, se ele ainda nao existir.
     */
    private PersistResult persist(Pending p, List<BillPayment> billPayments) {
        String externalId = PluggyTranslator.naturalKey(p.link().pluggyAccountId, p.tx());

        // A chave natural espelha a que a propria Pluggy usa quando nao tem id
        // do banco: (data, valor, descricao, posicao no dia). Reler a janela
        // de 90 dias toda noite nao reinsere nada por causa dela.
        long existing = Transaction.count("source = ?1 and externalId = ?2",
                TransactionSource.AGGREGATOR, externalId);
        if (existing > 0) {
            return new PersistResult(false, false);
        }

        Transaction tx = new Transaction();
        tx.account = p.link().account;
        tx.category = null; // sempre nulo: a categoria da Pluggy e sugestao, nao verdade
        // NUNCA o sinal de `amount`: ele significa coisas opostas conforme o
        // tipo de conta. Em corrente, negativo e saida; em cartao, positivo e
        // despesa. Quem diz a direcao e `type`.
        tx.flow = PluggyTranslator.flowOf(p.tx());
        tx.amount = p.amount();
        tx.description = trim(p.tx().description(), 200);
        tx.occurredOn = p.occurredOn();
        tx.source = TransactionSource.AGGREGATOR;
        tx.externalId = externalId;
        tx.notes = PluggyTranslator.auditTrail(p.tx());

        boolean flaggedForReview = false;

        // Debito na conta corrente que casa, em valor e data, com um pagamento
        // de fatura visto no cartao. Reconhecer por valor e muito mais solido
        // que por descricao: nao depende de como o banco escreve o texto.
        if (!p.isCard() && p.tx().isDebit() && matchesBillPayment(p, billPayments)) {
            tx.reviewStatus = ReviewStatus.PENDING;
            tx.reviewReason = ReviewReason.POSSIBLE_TRANSFER;
            flaggedForReview = true;
        } else {
            Transaction candidate = findPossibleDuplicate(p);
            if (candidate != null) {
                tx.reviewStatus = ReviewStatus.PENDING;
                tx.reviewReason = ReviewReason.POSSIBLE_DUPLICATE;
                tx.duplicateOf = candidate;
                flaggedForReview = true;
            }
        }

        tx.persist();
        return new PersistResult(true, flaggedForReview);
    }

    /**
     * Um lancamento preexistente que esta importacao talvez duplique.
     * <p>
     * Proposta, nunca fusao: dois cafes de R$ 12 no mesmo dia no mesmo cartao
     * sao duas compras, e nenhuma heuristica distingue isso de uma duplicata
     * de verdade. Por isso devolve o candidato e deixa a decisao para a fila
     * de revisao.
     */
    private Transaction findPossibleDuplicate(Pending p) {
        Flow flow = PluggyTranslator.flowOf(p.tx());

        List<Transaction> candidates = Transaction.find(
                "account = ?1 and amount = ?2 and flow = ?3 "
                        + "and source in (?4, ?5) "
                        + "and occurredOn between ?6 and ?7 "
                        + "and id not in (select t.duplicateOf.id from Transaction t "
                        + "               where t.duplicateOf is not null)",
                p.link().account, p.amount(), flow,
                TransactionSource.SHORTCUT, TransactionSource.MANUAL,
                p.occurredOn().minusDays(duplicateWindowDays),
                p.occurredOn().plusDays(duplicateWindowDays))
                .list();

        // Escolhe o mais proximo em data. Feito em Java de proposito: ordenar
        // por diferenca de datas em HQL exige aritmetica que varia entre
        // bancos, e a lista aqui tem no maximo um punhado de linhas.
        return candidates.stream()
                .min(java.util.Comparator.comparingLong(
                        candidate -> Math.abs(
                                ChronoUnit.DAYS.between(candidate.occurredOn, p.occurredOn()))))
                .orElse(null);
    }

    private boolean matchesBillPayment(Pending p, List<BillPayment> billPayments) {
        return billPayments.stream().anyMatch(bill ->
                bill.amount().compareTo(p.amount()) == 0
                        && Math.abs(ChronoUnit.DAYS.between(bill.date(), p.occurredOn()))
                                <= duplicateWindowDays);
    }

    // ---------------------------------------------------------------

    private PluggySyncRun finish(Long runId, PluggySyncRun.Status status, String error,
            OffsetDateTime itemLastUpdate, int imported, int skipped, int flagged,
            LocalDate from, LocalDate to) {

        return QuarkusTransaction.requiringNew().call(() -> {
            PluggySyncRun run = PluggySyncRun.findById(runId);
            run.finishedAt = OffsetDateTime.now();
            run.status = status;
            run.error = error;
            run.itemLastUpdatedAt = itemLastUpdate;
            run.imported = imported;
            run.skipped = skipped;
            run.flagged = flagged;
            run.windowFrom = from;
            run.windowTo = to;
            return run;
        });
    }

    private static LocalDate max(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    // ---------------------------------------------------------------

    private static final class Counters {
        int skipped;
    }

    /** Resultado de gravar um lancamento. */
    private record PersistResult(boolean created, boolean flagged) {
    }

    /** Pagamento de fatura visto no cartao, usado para reconhecer o debito na conta. */
    private record BillPayment(LocalDate date, BigDecimal amount) {
    }

    /** Transacao ja traduzida, aguardando gravacao. */
    private record Pending(
            PluggyAccountLink link,
            PluggyModels.Transaction tx,
            LocalDate occurredOn,
            BigDecimal amount,
            boolean isCard) {
    }
}
