package br.com.ebls.nasfinance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.ebls.nasfinance.api.dto.Cashflow;
import br.com.ebls.nasfinance.api.dto.CategoryTrends;
import br.com.ebls.nasfinance.api.dto.RecurringExpenses;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.Transaction;
import br.com.ebls.nasfinance.service.AnalyticsRules.CategoryMonthSum;
import br.com.ebls.nasfinance.service.AnalyticsRules.ExpenseLine;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

/**
 * Consultas da pagina de Analises (ver ANALYTICS.md).
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
        return AnalyticsRules.findRecurring(months, lines, today);
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
