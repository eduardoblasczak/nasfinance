package br.com.ebls.nasfinance.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.ebls.nasfinance.api.dto.BudgetPace;
import br.com.ebls.nasfinance.api.dto.BudgetPaceRow;
import br.com.ebls.nasfinance.api.dto.BudgetPaceStatus;
import br.com.ebls.nasfinance.api.dto.CalendarDay;
import br.com.ebls.nasfinance.api.dto.EntrySources;
import br.com.ebls.nasfinance.api.dto.Merchant;
import br.com.ebls.nasfinance.api.dto.RecurringExpense;
import br.com.ebls.nasfinance.api.dto.RecurringExpenses;
import br.com.ebls.nasfinance.api.dto.SourceShare;
import br.com.ebls.nasfinance.api.dto.SpendingCalendar;
import br.com.ebls.nasfinance.api.dto.TopMerchants;
import br.com.ebls.nasfinance.domain.TransactionSource;
import br.com.ebls.nasfinance.service.AnalyticsRules.ExpenseLine;

/**
 * Regras puras da leva 2 das Analises (ver ANALYTICS.md): calendario,
 * estabelecimentos, ritmo do teto e portas de entrada.
 * <p>
 * Classe irma de {@link AnalyticsRules}, pelo mesmo motivo: erram em silencio
 * (um dia que some do calendario, um teto que aparece "ok" quando ja estourou)
 * e, sem banco, cada uma e testavel em milissegundos. Reaproveita de la a
 * normalizacao de descricao e o arredondamento. A demonstracao
 * ({@code demo/src/analytics.ts}) repete estas regras; mudou aqui, muda la.
 */
public final class SpendingPatternRules {

    private SpendingPatternRules() {
    }

    // ---------------------------------------------------------------
    // Janelas
    // ---------------------------------------------------------------

    /**
     * Primeiro dia de uma janela de {@code months} meses que termina no mes
     * corrente: {@code months = 1} e so o mes corrente.
     */
    public static LocalDate windowStart(LocalDate today, int months) {
        return YearMonth.from(today).minusMonths(months - 1L).atDay(1);
    }

    // ---------------------------------------------------------------
    // Calendario
    // ---------------------------------------------------------------

    /** Despesas de um dia, como o banco agrupa. */
    public record DaySum(LocalDate date, BigDecimal expense, long count) {
    }

    /**
     * Um item por dia de {@code from} a {@code to}, inclusive, com zero nos
     * dias sem gasto.
     * <p>
     * O banco so devolve os dias com lancamento; um buraco faria o calendario
     * deslocar as semanas e a media por dia da semana (calculada na tela)
     * dividir por menos dias do que passaram.
     */
    public static SpendingCalendar calendar(LocalDate from, LocalDate to, List<DaySum> sums) {
        Map<LocalDate, DaySum> byDate = new LinkedHashMap<>();
        for (DaySum sum : sums) {
            byDate.merge(sum.date(), sum, (a, b) -> new DaySum(a.date(),
                    nz(a.expense()).add(nz(b.expense())), a.count() + b.count()));
        }
        List<CalendarDay> days = new ArrayList<>();
        BigDecimal max = AnalyticsRules.scaled(BigDecimal.ZERO);
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            DaySum sum = byDate.get(day);
            BigDecimal expense = AnalyticsRules.scaled(sum == null ? null : sum.expense());
            days.add(new CalendarDay(day, expense, sum == null ? 0 : sum.count()));
            if (expense.compareTo(max) > 0) {
                max = expense;
            }
        }
        return new SpendingCalendar(from, to, days, max);
    }

    // ---------------------------------------------------------------
    // Estabelecimentos
    // ---------------------------------------------------------------

    /** Uma despesa com descricao, reduzida aos campos que a regra usa. */
    public record MerchantLine(
            long id,
            String description,
            String categoryName,
            String categoryColor,
            LocalDate date,
            BigDecimal amount) {
    }

    /**
     * Chave do estabelecimento: so a descricao normalizada, a mesma da
     * recorrencia ({@link AnalyticsRules#normalizeDescription}).
     * <p>
     * Diferente da recorrencia, a conta <b>nao</b> entra: a pergunta aqui e
     * "onde eu gasto", e o mesmo mercado pago no debito e no cartao e um
     * lugar so. Na recorrencia a conta separa cobrancas distintas; aqui
     * separaria o mesmo lugar em dois.
     *
     * @return vazio quando nao sobra texto (descricao nula ou so digitos)
     */
    public static String merchantKey(String description) {
        return AnalyticsRules.normalizeDescription(description);
    }

    /**
     * Agrupa por estabelecimento, ordena por total e corta em {@code limit}.
     * <p>
     * Descricao que nao sobrevive a normalizacao ("12345") nao vira
     * estabelecimento: nao ha nome para mostrar. Ela continua no
     * {@code totalExpense}, que vem do banco com todas as despesas.
     * <p>
     * Rotulo e categoria vem do lancamento mais recente (data, depois id):
     * se o usuario reclassificou o lugar, vale a decisao nova.
     */
    public static TopMerchants topMerchants(int windowMonths, int limit, BigDecimal totalExpense,
            List<MerchantLine> lines) {
        Comparator<MerchantLine> chronological = Comparator.comparing(MerchantLine::date)
                .thenComparingLong(MerchantLine::id);

        Map<String, List<MerchantLine>> groups = new LinkedHashMap<>();
        for (MerchantLine line : lines) {
            String key = merchantKey(line.description());
            if (key.isEmpty()) {
                continue;
            }
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(line);
        }

        List<Merchant> items = new ArrayList<>(groups.size());
        for (Map.Entry<String, List<MerchantLine>> entry : groups.entrySet()) {
            List<MerchantLine> group = entry.getValue();
            MerchantLine latest = group.stream().max(chronological).orElseThrow();
            BigDecimal total = group.stream().map(MerchantLine::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            items.add(new Merchant(
                    entry.getKey(),
                    latest.description().trim(),
                    latest.categoryName(),
                    latest.categoryColor(),
                    AnalyticsRules.scaled(total),
                    group.size(),
                    AnalyticsRules.average(total, group.size()),
                    latest.date()));
        }

        items.sort(Comparator.comparing(Merchant::total).reversed()
                .thenComparing(Merchant::label)
                .thenComparing(Merchant::key));
        return new TopMerchants(
                windowMonths,
                items.size(),
                AnalyticsRules.scaled(totalExpense),
                items.size() > limit ? List.copyOf(items.subList(0, limit)) : items);
    }

    // ---------------------------------------------------------------
    // Ritmo do teto
    // ---------------------------------------------------------------

    /**
     * Uma categoria com teto e o gasto dela no mes ate hoje.
     *
     * @param fixedSpent parte de {@code spent} que pertence a series
     *                   recorrentes (ver {@link #fixedSpentByCategory})
     */
    public record BudgetSpend(
            Long categoryId,
            String name,
            String color,
            BigDecimal budget,
            BigDecimal spent,
            BigDecimal fixedSpent) {
    }

    /**
     * Quanto do gasto do mes corrente, ate hoje, saiu de cobrancas fixas, por
     * categoria.
     * <p>
     * "Fixa" e exatamente o que a recorrencia devolve: o lancamento conta se a
     * chave da serie dele ({@link AnalyticsRules#seriesKey}) esta entre os
     * itens de {@code recurring}. Assim a regra nao e duplicada — o que a tela
     * de recorrencia mostra como cobranca e o que deixa de ser projetado aqui.
     * Conta o lancamento inteiro, mesmo que a recorrencia so use o maior do
     * mes: uma mensalidade cobrada duas vezes foi paga duas vezes.
     *
     * @param lines     as linhas sobre as quais {@code recurring} foi calculada
     * @param recurring o resultado de {@link AnalyticsRules#findRecurring}
     * @return por categoria; lancamento sem categoria fica de fora (nao ha
     *         teto para ele)
     */
    public static Map<Long, BigDecimal> fixedSpentByCategory(List<ExpenseLine> lines,
            RecurringExpenses recurring, LocalDate today) {
        Set<String> keys = new HashSet<>();
        for (RecurringExpense item : recurring.items()) {
            keys.add(item.key());
        }
        LocalDate from = YearMonth.from(today).atDay(1);
        Map<Long, BigDecimal> fixed = new HashMap<>();
        for (ExpenseLine line : lines) {
            if (line.categoryId() == null || line.date().isBefore(from) || line.date().isAfter(today)) {
                continue;
            }
            if (keys.contains(AnalyticsRules.seriesKey(line.accountId(), line.description(), line.categoryName()))) {
                fixed.merge(line.categoryId(), line.amount(), BigDecimal::add);
            }
        }
        return fixed;
    }

    /**
     * Ritmo de cada categoria com teto no mes corrente.
     * <p>
     * So o gasto variavel segue o ritmo:
     * {@code projected = fixedSpent + (spent - fixedSpent) / throughDay * daysInMonth}.
     * Projetar o total, aluguel incluso, fazia a Moradia aparecer a 300% do
     * teto no dia 10: a conta fixa grande entrava como se se repetisse todo
     * dia. A cobranca fixa ja paga conta uma vez so; a que ainda vai vencer
     * no mes nao entra (a projecao nao adivinha), e por isso a tela fala em
     * "no ritmo atual", nao em previsao.
     * <p>
     * A parte variavel e calculada com a multiplicacao antes da divisao, para
     * arredondar uma vez so. Status e porcentagem saem do valor <b>ja
     * arredondado</b>, o que a tela mostra: senao uma projecao exibida como
     * R$ 600,00 contra teto de R$ 600,00 poderia aparecer como "vai passar".
     */
    public static BudgetPace budgetPace(LocalDate today, List<BudgetSpend> spends) {
        YearMonth month = YearMonth.from(today);
        int throughDay = today.getDayOfMonth();
        int daysInMonth = month.lengthOfMonth();
        // Dias que faltam contando hoje: no ultimo dia do mes ainda resta 1.
        int daysLeft = daysInMonth - throughDay + 1;

        List<BudgetPaceRow> rows = new ArrayList<>(spends.size());
        for (BudgetSpend spend : spends) {
            if (spend.budget() == null || spend.budget().signum() <= 0) {
                continue;
            }
            BigDecimal budget = AnalyticsRules.scaled(spend.budget());
            BigDecimal spent = AnalyticsRules.scaled(spend.spent());
            // Protecao: o fixo e um subconjunto do gasto; se as duas somas
            // divergirem (lancamento editado entre as consultas), o variavel
            // nunca fica negativo.
            BigDecimal fixed = AnalyticsRules.scaled(spend.fixedSpent()).min(spent);
            BigDecimal variable = spent.subtract(fixed);
            BigDecimal projected = fixed.add(variable.multiply(BigDecimal.valueOf(daysInMonth))
                    .divide(BigDecimal.valueOf(throughDay), AnalyticsRules.SCALE, RoundingMode.HALF_UP));

            BudgetPaceStatus status;
            if (spent.compareTo(budget) > 0) {
                status = BudgetPaceStatus.OVER;
            } else if (projected.compareTo(budget) > 0) {
                status = BudgetPaceStatus.WARN;
            } else {
                status = BudgetPaceStatus.OK;
            }
            BigDecimal allowance = status == BudgetPaceStatus.OVER
                    ? null
                    : budget.subtract(spent).divide(BigDecimal.valueOf(daysLeft), AnalyticsRules.SCALE,
                            RoundingMode.HALF_UP);

            rows.add(new BudgetPaceRow(
                    spend.categoryId(),
                    spend.name(),
                    spend.color(),
                    budget,
                    spent,
                    fixed,
                    projected,
                    percentOf(projected, budget),
                    status,
                    allowance));
        }

        rows.sort(Comparator.comparing(BudgetPaceRow::projectedPct).reversed()
                .thenComparing(BudgetPaceRow::categoryName));
        return new BudgetPace(month.toString(), throughDay, daysInMonth, rows);
    }

    // ---------------------------------------------------------------
    // Portas de entrada
    // ---------------------------------------------------------------

    /** Contagem e soma de uma fonte, como o banco agrupa. */
    public record SourceSum(TransactionSource source, long count, BigDecimal total) {
    }

    /**
     * Uma linha por fonte, na ordem do enum, mesmo as que nao tiveram
     * despesa: o grafico mostra a porta vazia, que tambem e informacao
     * (nenhuma importacao de arquivo, por exemplo).
     */
    public static EntrySources entrySources(int windowMonths, List<SourceSum> sums,
            long confirmedByBank, long pendingReview) {
        Map<TransactionSource, SourceSum> bySource = new EnumMap<>(TransactionSource.class);
        for (SourceSum sum : sums) {
            bySource.merge(sum.source(), sum, (a, b) -> new SourceSum(a.source(),
                    a.count() + b.count(), nz(a.total()).add(nz(b.total()))));
        }
        List<SourceShare> shares = new ArrayList<>();
        for (TransactionSource source : TransactionSource.values()) {
            SourceSum sum = bySource.get(source);
            shares.add(new SourceShare(source,
                    sum == null ? 0 : sum.count(),
                    AnalyticsRules.scaled(sum == null ? null : sum.total())));
        }
        long manual = shares.stream()
                .filter(share -> isManual(share.source()))
                .mapToLong(SourceShare::count)
                .sum();
        return new EntrySources(
                windowMonths,
                shares,
                manual,
                confirmedByBank,
                pendingReview,
                manual == 0 ? null : percentOf(BigDecimal.valueOf(confirmedByBank), BigDecimal.valueOf(manual)));
    }

    /** Lancado por uma pessoa: pela tela ou pelo Atalho. */
    public static boolean isManual(TransactionSource source) {
        return source == TransactionSource.MANUAL || source == TransactionSource.SHORTCUT;
    }

    // ---------------------------------------------------------------
    // Dinheiro
    // ---------------------------------------------------------------

    /**
     * {@code part / whole * 100}, com o arredondamento do dashboard (razao em
     * 4 casas, depois x100): 2 casas no resultado.
     */
    public static Double percentOf(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() == 0) {
            return null;
        }
        return part.divide(whole, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .doubleValue();
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
