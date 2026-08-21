package br.com.ebls.nasfinance.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.ebls.nasfinance.api.dto.AccountBalance;
import br.com.ebls.nasfinance.api.dto.CategorySlice;
import br.com.ebls.nasfinance.api.dto.DailyPoint;
import br.com.ebls.nasfinance.api.dto.DashboardSummary;
import br.com.ebls.nasfinance.api.dto.TransactionDto;
import br.com.ebls.nasfinance.domain.Account;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.Transaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

/**
 * Monta o resumo consolidado do dashboard.
 * <p>
 * <b>Estrategia:</b> agregar no banco, nao em Java. Trazer todas as transacoes
 * para a memoria e somar com streams funcionaria com poucos registros, mas o
 * custo cresce linearmente e o servidor tem 3,2 GB de RAM. Um {@code GROUP BY}
 * no PostgreSQL resolve com indice e devolve dezenas de linhas em vez de
 * milhares.
 */
@ApplicationScoped
public class DashboardService {

    private static final int SCALE = 2;
    private static final int RECENT_LIMIT = 8;

    @Inject
    EntityManager em;

    /**
     * Resumo completo do periodo.
     *
     * @param from inicio do periodo, inclusive
     * @param to   fim do periodo, inclusive
     */
    @Transactional
    public DashboardSummary summary(LocalDate from, LocalDate to) {
        Totals totals = totalsFor(from, to);

        // Periodo anterior de mesmo tamanho, para a comparacao percentual
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        LocalDate previousTo = from.minusDays(1);
        LocalDate previousFrom = previousTo.minusDays(days - 1);
        Totals previous = totalsFor(previousFrom, previousTo);

        return new DashboardSummary(
                from,
                to,
                totals.expense(),
                totals.income(),
                totals.income().subtract(totals.expense()),
                previous.expense(),
                percentChange(previous.expense(), totals.expense()),
                totals.count(),
                expenseByCategory(from, to),
                accountBalances(from, to),
                dailySeries(from, to),
                recentTransactions());
    }

    // ---------------------------------------------------------------
    // Totais do periodo
    // ---------------------------------------------------------------

    private record Totals(BigDecimal expense, BigDecimal income, long count) {
    }

    private Totals totalsFor(LocalDate from, LocalDate to) {
        List<Object[]> rows = em.createQuery("""
                        SELECT t.flow, SUM(t.amount), COUNT(t)
                        FROM Transaction t
                        WHERE t.occurredOn BETWEEN :from AND :to
                        GROUP BY t.flow
                        """, Object[].class)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();

        BigDecimal expense = BigDecimal.ZERO;
        BigDecimal income = BigDecimal.ZERO;
        long count = 0;

        for (Object[] row : rows) {
            Flow flow = (Flow) row[0];
            BigDecimal sum = scaled((BigDecimal) row[1]);
            count += (Long) row[2];
            if (flow == Flow.EXPENSE) {
                expense = sum;
            } else {
                income = sum;
            }
        }
        return new Totals(expense, income, count);
    }

    // ---------------------------------------------------------------
    // Gastos por categoria
    // ---------------------------------------------------------------

    /**
     * Despesas do periodo agrupadas por categoria, maior primeiro.
     * <p>
     * O {@code LEFT JOIN} e proposital: transacoes sem categoria (as que chegam
     * por webhook ainda nao classificadas) precisam aparecer como uma fatia
     * "Sem categoria", nao sumir do grafico — senao a soma das fatias nao bate
     * com o total de despesas exibido no topo.
     */
    private List<CategorySlice> expenseByCategory(LocalDate from, LocalDate to) {
        List<Object[]> rows = em.createQuery("""
                        SELECT c.id, c.name, c.color, c.icon, c.monthlyBudget,
                               SUM(t.amount), COUNT(t)
                        FROM Transaction t
                        LEFT JOIN t.category c
                        WHERE t.flow = :flow
                          AND t.occurredOn BETWEEN :from AND :to
                        GROUP BY c.id, c.name, c.color, c.icon, c.monthlyBudget
                        ORDER BY SUM(t.amount) DESC
                        """, Object[].class)
                .setParameter("flow", Flow.EXPENSE)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();

        List<CategorySlice> slices = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            BigDecimal total = scaled((BigDecimal) row[5]);
            BigDecimal budget = (BigDecimal) row[4];

            Double usedPct = null;
            if (budget != null && budget.signum() > 0) {
                usedPct = total
                        .divide(budget, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .doubleValue();
            }

            slices.add(new CategorySlice(
                    (Long) row[0],
                    row[1] == null ? "Sem categoria" : (String) row[1],
                    row[2] == null ? "#94A3B8" : (String) row[2],
                    (String) row[3],
                    total,
                    budget,
                    usedPct,
                    (Long) row[6]));
        }
        return slices;
    }

    // ---------------------------------------------------------------
    // Saldos por conta
    // ---------------------------------------------------------------

    /**
     * Saldo de cada conta ativa.
     * <p>
     * Sao tres consultas fixas (contas, movimento total, movimento do periodo)
     * combinadas em memoria. A alternativa "elegante" seria um unico JPQL com
     * dois LEFT JOINs correlacionados, mas o plano gerado fica pior e o codigo,
     * ilegivel. Tres consultas com {@code GROUP BY} sao previsiveis e nao
     * geram N+1 — o numero de consultas nao cresce com o numero de contas.
     */
    private List<AccountBalance> accountBalances(LocalDate from, LocalDate to) {
        List<Account> accounts = Account.listActive();

        Map<Long, BigDecimal[]> allTime = sumByAccount(null, null);
        Map<Long, BigDecimal[]> period = sumByAccount(from, to);

        List<AccountBalance> balances = new ArrayList<>(accounts.size());
        for (Account account : accounts) {
            BigDecimal[] total = allTime.getOrDefault(account.id, zeroPair());
            BigDecimal[] inPeriod = period.getOrDefault(account.id, zeroPair());

            // saldo = inicial + receitas - despesas
            BigDecimal balance = account.openingBalance
                    .add(total[1])
                    .subtract(total[0]);

            balances.add(new AccountBalance(
                    account.id,
                    account.name,
                    account.kind,
                    account.color,
                    scaled(balance),
                    inPeriod[0],
                    inPeriod[1]));
        }
        return balances;
    }

    /**
     * Soma por conta, devolvendo {@code [despesa, receita]} para cada id.
     *
     * @param from filtro opcional de data inicial; {@code null} = desde sempre
     */
    private Map<Long, BigDecimal[]> sumByAccount(LocalDate from, LocalDate to) {
        String jpql = """
                SELECT t.account.id, t.flow, SUM(t.amount)
                FROM Transaction t
                """
                + (from != null ? " WHERE t.occurredOn BETWEEN :from AND :to " : "")
                + " GROUP BY t.account.id, t.flow";

        var query = em.createQuery(jpql, Object[].class);
        if (from != null) {
            query.setParameter("from", from).setParameter("to", to);
        }

        Map<Long, BigDecimal[]> result = new HashMap<>();
        for (Object[] row : query.getResultList()) {
            Long accountId = (Long) row[0];
            Flow flow = (Flow) row[1];
            BigDecimal sum = scaled((BigDecimal) row[2]);

            BigDecimal[] pair = result.computeIfAbsent(accountId, k -> zeroPair());
            if (flow == Flow.EXPENSE) {
                pair[0] = sum;
            } else {
                pair[1] = sum;
            }
        }
        return result;
    }

    // ---------------------------------------------------------------
    // Serie diaria
    // ---------------------------------------------------------------

    /**
     * Serie diaria do periodo, com os dias sem movimento preenchidos com zero.
     * <p>
     * O banco so devolve dias que tiveram transacao. Se enviassemos a serie com
     * buracos, o grafico de linha ligaria 03/01 direto a 07/01 e a inclinacao
     * daria a impressao de gasto continuo nesse intervalo. Preencher os zeros
     * mantem o eixo do tempo proporcional.
     */
    private List<DailyPoint> dailySeries(LocalDate from, LocalDate to) {
        List<Object[]> rows = em.createQuery("""
                        SELECT t.occurredOn, t.flow, SUM(t.amount)
                        FROM Transaction t
                        WHERE t.occurredOn BETWEEN :from AND :to
                        GROUP BY t.occurredOn, t.flow
                        """, Object[].class)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();

        Map<LocalDate, BigDecimal[]> byDate = new HashMap<>();
        for (Object[] row : rows) {
            LocalDate date = (LocalDate) row[0];
            Flow flow = (Flow) row[1];
            BigDecimal sum = scaled((BigDecimal) row[2]);

            BigDecimal[] pair = byDate.computeIfAbsent(date, k -> zeroPair());
            if (flow == Flow.EXPENSE) {
                pair[0] = sum;
            } else {
                pair[1] = sum;
            }
        }

        List<DailyPoint> series = new ArrayList<>();
        BigDecimal cumulative = BigDecimal.ZERO;

        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            BigDecimal[] pair = byDate.getOrDefault(date, zeroPair());
            cumulative = cumulative.add(pair[0]);
            series.add(new DailyPoint(date, pair[0], pair[1], cumulative));
        }
        return series;
    }

    // ---------------------------------------------------------------
    // Ultimos lancamentos
    // ---------------------------------------------------------------

    private List<TransactionDto> recentTransactions() {
        return Transaction.<Transaction>find("ORDER BY occurredOn DESC, id DESC")
                .page(0, RECENT_LIMIT)
                .list()
                .stream()
                .map(TransactionDto::from)
                .toList();
    }

    // ---------------------------------------------------------------
    // Utilitarios
    // ---------------------------------------------------------------

    /**
     * Variacao percentual entre dois periodos.
     *
     * @return {@code null} quando a base e zero — nao existe "aumento de X%"
     *         partindo do nada, e devolver 0 ou infinito distorceria o indicador
     */
    private static Double percentChange(BigDecimal previous, BigDecimal current) {
        if (previous == null || previous.signum() == 0) {
            return null;
        }
        return current.subtract(previous)
                .divide(previous, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .doubleValue();
    }

    private static BigDecimal scaled(BigDecimal value) {
        return value == null
                ? BigDecimal.ZERO.setScale(SCALE)
                : value.setScale(SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal[] zeroPair() {
        return new BigDecimal[] { BigDecimal.ZERO.setScale(SCALE), BigDecimal.ZERO.setScale(SCALE) };
    }
}
