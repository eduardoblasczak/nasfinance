package br.com.ebls.nasfinance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.ebls.nasfinance.api.dto.BudgetPace;
import br.com.ebls.nasfinance.api.dto.Cashflow;
import br.com.ebls.nasfinance.api.dto.CategoryTrends;
import br.com.ebls.nasfinance.api.dto.EntrySources;
import br.com.ebls.nasfinance.api.dto.RecurringExpenses;
import br.com.ebls.nasfinance.api.dto.SpendingCalendar;
import br.com.ebls.nasfinance.api.dto.TopMerchants;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.ReviewStatus;
import br.com.ebls.nasfinance.domain.Transaction;
import br.com.ebls.nasfinance.domain.TransactionSource;
import br.com.ebls.nasfinance.service.AnalyticsRules.CategoryMonthSum;
import br.com.ebls.nasfinance.service.AnalyticsRules.ExpenseLine;
import br.com.ebls.nasfinance.service.SpendingPatternRules.BudgetSpend;
import br.com.ebls.nasfinance.service.SpendingPatternRules.DaySum;
import br.com.ebls.nasfinance.service.SpendingPatternRules.MerchantLine;
import br.com.ebls.nasfinance.service.SpendingPatternRules.SourceSum;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import jakarta.transaction.Transactional;

/**
 * Consultas da pagina de Analises, levas 1 e 2 (ver ANALYTICS.md).
 * <p>
 * Mesma estrategia do {@link DashboardService}: o banco agrega e devolve
 * dezenas de linhas, nao milhares — a VM tem 1 GB. As regras (medias,
 * recorrencia, meses vazios) ficam em {@link AnalyticsRules}, puras e
 * testadas; aqui so ha consulta.
 * <p>
 * Toda consulta exclui ignorados ({@link Transaction#NOT_IGNORED_T}) e decide
 * a direcao pelo {@code flow}: o valor e sempre positivo.
 */
@ApplicationScoped
public class AnalyticsService {

    @Inject
    EntityManager em;

    // ---------------------------------------------------------------
    // Gasto por categoria contra a media
    // ---------------------------------------------------------------

    /**
     * Despesas por categoria no mes de referencia contra os {@code baseline}
     * meses anteriores.
     * <p>
     * Uma consulta so, agrupada por categoria e mes. A soma "ate a data" usa
     * {@code day(occurredOn) <= throughDay}: num mes mais curto que
     * {@code throughDay} a condicao pega o mes inteiro, que e exatamente o
     * limite de {@link AnalyticsRules#toDateEnd}. O mes de referencia so e
     * lido ate {@code throughDay} — no mes corrente, o que vier depois de hoje
     * (lancamento com data futura) ainda nao aconteceu. Em mes fechado a soma
     * "ate a data" vem do banco mas nao e usada: a regra compara meses inteiros.
     */
    @Transactional
    public CategoryTrends categories(YearMonth month, int baseline, LocalDate today) {
        int throughDay = AnalyticsRules.throughDay(month, today);
        LocalDate from = month.minusMonths(baseline).atDay(1);
        LocalDate to = AnalyticsRules.toDateEnd(month, throughDay);

        String jpql = """
                SELECT c.id, c.name, c.color, c.icon,
                       year(t.occurredOn), month(t.occurredOn),
                       SUM(t.amount),
                       SUM(CASE WHEN day(t.occurredOn) <= :throughDay THEN t.amount ELSE 0 END)
                FROM Transaction t
                LEFT JOIN t.category c
                WHERE t.flow = :flow
                  AND t.occurredOn BETWEEN :from AND :to
                  AND"""
                // Espaco explicito: o text block remove o espaco no fim da
                // linha, e sem ele "AND" cola no "t." da constante.
                + " " + Transaction.NOT_IGNORED_T
                + " GROUP BY c.id, c.name, c.color, c.icon, year(t.occurredOn), month(t.occurredOn)";

        List<Object[]> rows = em.createQuery(jpql, Object[].class)
                .setParameter("throughDay", throughDay)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();

        List<CategoryMonthSum> sums = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            sums.add(new CategoryMonthSum(
                    (Long) row[0],
                    (String) row[1],
                    (String) row[2],
                    (String) row[3],
                    YearMonth.of(((Number) row[4]).intValue(), ((Number) row[5]).intValue()),
                    decimal(row[6]),
                    decimal(row[7])));
        }
        return AnalyticsRules.categoryTrends(month, today, baseline, sums);
    }

    // ---------------------------------------------------------------
    // Cobrancas recorrentes
    // ---------------------------------------------------------------

    /**
     * Despesas que se repetem na janela de {@code months} meses fechados mais
     * o corrente.
     * <p>
     * <b>Excecao consciente a "agregar no banco":</b> a serie depende da
     * descricao normalizada (sem acento, digito nem pontuacao), e reproduzir
     * essa normalizacao em SQL duplicaria a regra em dois dialetos — o
     * Postgres aqui e o SQLite da demonstracao —, com o {@code unaccent}
     * exigindo extensao. Em vez disso, o banco filtra e projeta so os campos
     * usados (nenhuma entidade e carregada), e o agrupamento e feito em
     * {@link AnalyticsRules#findRecurring}. A janela e pequena: no maximo 13
     * meses de despesas de uma pessoa, poucos milhares de linhas curtas.
     */
    @Transactional
    public RecurringExpenses recurring(int months, LocalDate today) {
        return AnalyticsRules.findRecurring(months, recurringLines(months, today), today);
    }

    /**
     * As despesas da janela da recorrencia ({@code months} meses fechados mais
     * o corrente inteiro), projetadas nos campos que a regra usa. Separado
     * para o ritmo do teto aplicar exatamente a mesma regra sobre as mesmas
     * linhas.
     */
    private List<ExpenseLine> recurringLines(int months, LocalDate today) {
        YearMonth current = YearMonth.from(today);
        LocalDate from = current.minusMonths(months).atDay(1);
        LocalDate to = current.atEndOfMonth();

        String jpql = """
                SELECT t.id, t.description, a.id, a.name, c.id, c.name, c.color, t.occurredOn, t.amount
                FROM Transaction t
                JOIN t.account a
                LEFT JOIN t.category c
                WHERE t.flow = :flow
                  AND t.occurredOn BETWEEN :from AND :to
                  AND"""
                + " " + Transaction.NOT_IGNORED_T;

        List<Object[]> rows = em.createQuery(jpql, Object[].class)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();

        List<ExpenseLine> lines = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            lines.add(new ExpenseLine(
                    (Long) row[0],
                    (String) row[1],
                    (Long) row[2],
                    (String) row[3],
                    (Long) row[4],
                    (String) row[5],
                    (String) row[6],
                    (LocalDate) row[7],
                    (BigDecimal) row[8]));
        }
        return lines;
    }

    // ---------------------------------------------------------------
    // Fluxo de caixa
    // ---------------------------------------------------------------

    /**
     * Entradas e saidas por mes: o mes corrente e os {@code months - 1}
     * anteriores. O banco devolve no maximo dois numeros por mes; os meses sem
     * movimento sao preenchidos em {@link AnalyticsRules#cashflow}.
     */
    @Transactional
    public Cashflow cashflow(int months, LocalDate today) {
        YearMonth current = YearMonth.from(today);
        YearMonth first = current.minusMonths(months - 1L);

        String jpql = """
                SELECT year(t.occurredOn), month(t.occurredOn), t.flow, SUM(t.amount)
                FROM Transaction t
                WHERE t.occurredOn BETWEEN :from AND :to
                  AND"""
                + " " + Transaction.NOT_IGNORED_T
                + " GROUP BY year(t.occurredOn), month(t.occurredOn), t.flow";

        List<Object[]> rows = em.createQuery(jpql, Object[].class)
                .setParameter("from", first.atDay(1))
                .setParameter("to", current.atEndOfMonth())
                .getResultList();

        Map<YearMonth, BigDecimal> income = new HashMap<>();
        Map<YearMonth, BigDecimal> expense = new HashMap<>();
        for (Object[] row : rows) {
            YearMonth month = YearMonth.of(((Number) row[0]).intValue(), ((Number) row[1]).intValue());
            Flow flow = (Flow) row[2];
            (flow == Flow.EXPENSE ? expense : income).put(month, decimal(row[3]));
        }
        return AnalyticsRules.cashflow(first, current, income, expense);
    }

    // ---------------------------------------------------------------
    // Leva 2: calendario de gasto
    // ---------------------------------------------------------------

    /**
     * Despesas por dia, do dia 1 do mes {@code months - 1} meses atras ate
     * hoje. O banco agrupa por dia (no maximo ~370 linhas de tres numeros);
     * os dias sem gasto sao preenchidos em {@link SpendingPatternRules#calendar}.
     * <p>
     * Termina hoje, e nao no fim do mes: lancamento com data futura ainda nao
     * aconteceu, e um dia futuro vazio no calendario puxaria a media por dia
     * da semana para baixo.
     */
    @Transactional
    public SpendingCalendar calendar(int months, LocalDate today) {
        LocalDate from = SpendingPatternRules.windowStart(today, months);

        String jpql = """
                SELECT t.occurredOn, SUM(t.amount), COUNT(t)
                FROM Transaction t
                WHERE t.flow = :flow
                  AND t.occurredOn BETWEEN :from AND :to
                  AND"""
                + " " + Transaction.NOT_IGNORED_T
                + " GROUP BY t.occurredOn";

        List<Object[]> rows = em.createQuery(jpql, Object[].class)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", today)
                .getResultList();

        List<DaySum> sums = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            sums.add(new DaySum((LocalDate) row[0], decimal(row[1]), ((Number) row[2]).longValue()));
        }
        return SpendingPatternRules.calendar(from, today, sums);
    }

    // ---------------------------------------------------------------
    // Leva 2: estabelecimentos
    // ---------------------------------------------------------------

    /**
     * Despesas agrupadas por estabelecimento (descricao normalizada, sem a
     * conta) no mes corrente e nos {@code months - 1} anteriores, ate hoje.
     * <p>
     * Mesma excecao consciente da {@link #recurring}: a chave depende da
     * normalizacao de texto, que nao se reproduz igual em Postgres e SQLite
     * sem duplicar a regra. O banco filtra e projeta so seis campos curtos de
     * no maximo 12 meses de despesas; o agrupamento e feito em
     * {@link SpendingPatternRules#topMerchants}. O total da janela (o
     * denominador da fatia) inclui as despesas sem descricao, e por isso vem
     * de uma soma propria no banco.
     */
    @Transactional
    public TopMerchants merchants(int months, int limit, LocalDate today) {
        LocalDate from = SpendingPatternRules.windowStart(today, months);

        String linesJpql = """
                SELECT t.id, t.description, c.name, c.color, t.occurredOn, t.amount
                FROM Transaction t
                LEFT JOIN t.category c
                WHERE t.flow = :flow
                  AND t.occurredOn BETWEEN :from AND :to
                  AND t.description IS NOT NULL
                  AND"""
                + " " + Transaction.NOT_IGNORED_T;

        List<Object[]> rows = em.createQuery(linesJpql, Object[].class)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", today)
                .getResultList();

        List<MerchantLine> lines = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            lines.add(new MerchantLine(
                    (Long) row[0],
                    (String) row[1],
                    (String) row[2],
                    (String) row[3],
                    (LocalDate) row[4],
                    (BigDecimal) row[5]));
        }

        String totalJpql = """
                SELECT SUM(t.amount)
                FROM Transaction t
                WHERE t.flow = :flow
                  AND t.occurredOn BETWEEN :from AND :to
                  AND"""
                + " " + Transaction.NOT_IGNORED_T;

        BigDecimal total = em.createQuery(totalJpql, BigDecimal.class)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", today)
                .getSingleResult();

        return SpendingPatternRules.topMerchants(months, limit, decimal(total), lines);
    }

    // ---------------------------------------------------------------
    // Leva 2: ritmo do teto
    // ---------------------------------------------------------------

    /**
     * Gasto do mes corrente, do dia 1 ate hoje, das categorias de despesa com
     * teto ({@code monthly_budget > 0}) e nao arquivadas.
     * <p>
     * Duas consultas pequenas em vez de um LEFT JOIN de categoria com
     * transacao: a categoria com teto e sem gasto precisa aparecer (com
     * {@code spent} zero), e a condicao de periodo e de ignorados teria de ir
     * para o ON do join, o que e facil de errar sem que nada quebre. A
     * segunda consulta devolve uma linha por categoria com gasto.
     * <p>
     * Termina hoje porque a projecao divide por {@code throughDay}: um
     * lancamento com data futura entraria no "ritmo" de dias que ainda nao
     * passaram.
     * <p>
     * Categoria arquivada fica de fora mesmo com teto: arquivar e dizer que
     * ela nao e mais usada, e um alerta dela nao teria onde ser resolvido.
     * <p>
     * A parte fixa do gasto ({@code fixedSpent}) sai da propria regra de
     * {@link #recurring}, com a janela padrao, sobre as mesmas linhas: a serie
     * que a tela de recorrencia mostra e a que deixa de ser projetada aqui.
     * Sao as despesas de ate ~7 meses ja lidas pela recorrencia, sem
     * consulta nova.
     */
    @Transactional
    public BudgetPace budgetPace(LocalDate today) {
        LocalDate from = YearMonth.from(today).atDay(1);

        List<Object[]> categories = em.createQuery("""
                SELECT c.id, c.name, c.color, c.monthlyBudget
                FROM Category c
                WHERE c.flow = :flow
                  AND c.archived = false
                  AND c.monthlyBudget > 0
                """, Object[].class)
                .setParameter("flow", Flow.EXPENSE)
                .getResultList();

        String spentJpql = """
                SELECT c.id, SUM(t.amount)
                FROM Transaction t
                JOIN t.category c
                WHERE t.flow = :flow
                  AND t.occurredOn BETWEEN :from AND :to
                  AND"""
                + " " + Transaction.NOT_IGNORED_T
                + " GROUP BY c.id";

        Map<Long, BigDecimal> spentByCategory = new HashMap<>();
        for (Object[] row : em.createQuery(spentJpql, Object[].class)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", today)
                .getResultList()) {
            spentByCategory.put((Long) row[0], decimal(row[1]));
        }

        int window = AnalyticsRules.DEFAULT_RECURRING_MONTHS;
        List<ExpenseLine> lines = recurringLines(window, today);
        Map<Long, BigDecimal> fixedByCategory = SpendingPatternRules.fixedSpentByCategory(
                lines, AnalyticsRules.findRecurring(window, lines, today), today);

        List<BudgetSpend> spends = new ArrayList<>(categories.size());
        for (Object[] row : categories) {
            Long id = (Long) row[0];
            spends.add(new BudgetSpend(id, (String) row[1], (String) row[2], (BigDecimal) row[3],
                    spentByCategory.getOrDefault(id, BigDecimal.ZERO),
                    fixedByCategory.getOrDefault(id, BigDecimal.ZERO)));
        }
        return SpendingPatternRules.budgetPace(today, spends);
    }

    // ---------------------------------------------------------------
    // Leva 2: portas de entrada
    // ---------------------------------------------------------------

    /**
     * Despesas por fonte e quanto do lancado a mao o banco confirmou, no mes
     * corrente e nos {@code months - 1} anteriores, ate hoje.
     * <p>
     * <b>Regra de confirmacao.</b> Um lancamento MANUAL ou SHORTCUT (de
     * despesa, na janela, nao ignorado) esta confirmado pelo banco quando
     * existe uma transacao AGGREGATOR com {@code duplicateOf} apontando para
     * ele, em <b>qualquer</b> {@code reviewStatus}. O lado AGGREGATOR nao
     * pode passar pelo filtro de ignorados: "Nao contar" na fila
     * ({@link ReviewService#ignore}) e justamente a decisao "o do banco e o
     * mesmo gasto, fica o meu" — o importado vira IGNORED e o manual segue
     * nos totais. Filtrar ignorados ali descartaria exatamente as
     * confirmacoes resolvidas. Quem conta e o lancamento manual, nao o
     * vinculo: {@code COUNT(DISTINCT)} protege de dois importados apontando
     * para o mesmo manual.
     * <p>
     * Como cada saida da fila mexe no vinculo (ver {@link ReviewService}):
     * <ul>
     * <li>suspeita aberta ({@code PENDING}): o vinculo existe; conta como
     * confirmado <i>e</i> como pendente — o banco trouxe a compra, falta o
     * usuario decidir o que fazer com a copia;</li>
     * <li>"Nao contar" ({@code ignore}): o importado fica IGNORED e mantem o
     * vinculo; conta como confirmado;</li>
     * <li>"Manter os dois" ({@code dismiss}): o usuario disse que sao compras
     * diferentes e o vinculo e apagado; nao conta;</li>
     * <li>"Consolidar" ({@code merge}): o manual e <b>apagado</b> e sobra o
     * importado, sem vinculo. A compra passa a contar como AGGREGATOR e sai de
     * {@code manualEntries}: o modelo nao guarda que ela nasceu no Atalho
     * (so o texto em {@code notes}, que o usuario pode editar).</li>
     * </ul>
     * A rota so conta; nao muda nada.
     */
    @Transactional
    public EntrySources sources(int months, LocalDate today) {
        LocalDate from = SpendingPatternRules.windowStart(today, months);

        String bySourceJpql = """
                SELECT t.source, COUNT(t), SUM(t.amount)
                FROM Transaction t
                WHERE t.flow = :flow
                  AND t.occurredOn BETWEEN :from AND :to
                  AND"""
                + " " + Transaction.NOT_IGNORED_T
                + " GROUP BY t.source";

        List<SourceSum> sums = new ArrayList<>();
        for (Object[] row : em.createQuery(bySourceJpql, Object[].class)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", today)
                .getResultList()) {
            sums.add(new SourceSum((TransactionSource) row[0], ((Number) row[1]).longValue(), decimal(row[2])));
        }

        // `m` e o lancamento manual, filtrado como qualquer agregacao (escrito
        // com o alias dele, porque NOT_IGNORED_T usa `t`); `d`, o importado
        // que aponta para ele, sem filtro de ignorados de proposito.
        String linkedJpql = """
                SELECT COUNT(DISTINCT m.id)
                FROM Transaction d
                JOIN d.duplicateOf m
                WHERE d.source = :aggregator
                  AND m.source IN :manual
                  AND m.flow = :flow
                  AND m.occurredOn BETWEEN :from AND :to
                  AND m.reviewStatus <> :ignored
                """;

        long confirmed = countLinked(linkedJpql, null, from, today);
        long pending = countLinked(linkedJpql + " AND d.reviewStatus = :status", ReviewStatus.PENDING, from, today);

        return SpendingPatternRules.entrySources(months, sums, confirmed, pending);
    }

    /** Conta os manuais vinculados; com {@code status}, so os vinculos nesse estado. */
    private long countLinked(String jpql, ReviewStatus status, LocalDate from, LocalDate to) {
        TypedQuery<Long> query = em.createQuery(jpql, Long.class)
                .setParameter("aggregator", TransactionSource.AGGREGATOR)
                .setParameter("manual", List.of(TransactionSource.MANUAL, TransactionSource.SHORTCUT))
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", to)
                .setParameter("ignored", ReviewStatus.IGNORED);
        if (status != null) {
            query.setParameter("status", status);
        }
        Long count = query.getSingleResult();
        return count == null ? 0 : count;
    }

    /**
     * {@code SUM} de {@code CASE ... ELSE 0} pode voltar como outro
     * {@link Number} conforme o tipo que o Hibernate infere para o ramo; a
     * conversao pelo texto preserva os centavos em qualquer caso.
     */
    private static BigDecimal decimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        return new BigDecimal(value.toString());
    }
}
