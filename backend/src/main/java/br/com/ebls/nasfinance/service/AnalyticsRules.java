package br.com.ebls.nasfinance.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

import br.com.ebls.nasfinance.api.dto.Cashflow;
import br.com.ebls.nasfinance.api.dto.CashflowMonth;
import br.com.ebls.nasfinance.api.dto.CategoryTrendRow;
import br.com.ebls.nasfinance.api.dto.CategoryTrends;
import br.com.ebls.nasfinance.api.dto.MonthTotal;
import br.com.ebls.nasfinance.api.dto.RecurringExpense;
import br.com.ebls.nasfinance.api.dto.RecurringExpenses;
import br.com.ebls.nasfinance.util.TextNormalizer;

/**
 * Regras puras da pagina de Analises (ver ANALYTICS.md).
 * <p>
 * Separadas do {@link AnalyticsService} pelo mesmo motivo do
 * {@code PluggyTranslator}: sao regras que erram em silencio. Uma janela de
 * comparacao um dia maior, um mes vazio que some da serie ou uma cobranca
 * que deixa de ser reconhecida produzem um numero plausivel, nao uma
 * excecao. Sem banco e sem Quarkus, cada uma e testavel em milissegundos.
 * <p>
 * O servico so consulta (agregando no banco) e entrega as linhas ja reduzidas
 * para ca. A demonstracao ({@code demo/src/store.ts}) repete estas regras;
 * mudou aqui, muda la.
 */
public final class AnalyticsRules {

    public static final int SCALE = 2;

    /** Variacao maxima (desvio padrao / media) para uma serie ser recorrente. */
    public static final BigDecimal MAX_VARIATION = new BigDecimal("0.25");

    /** Meses distintos minimos para uma serie ser recorrente. */
    public static final int MIN_MONTHS = 3;

    /**
     * Lancamentos por mes visto, no maximo, para a serie ser cobranca e nao
     * habito. Em fracao (3/2) para a comparacao ser exata, em inteiros.
     */
    public static final int MAX_PER_MONTH_NUM = 3;
    public static final int MAX_PER_MONTH_DEN = 2;

    /**
     * Janela padrao da recorrencia (meses fechados). Constante porque o ritmo
     * do teto usa a mesma janela para separar o gasto fixo: as duas telas
     * precisam concordar sobre o que e cobranca.
     */
    public static final int DEFAULT_RECURRING_MONTHS = 6;

    /** Sem cobranca ha mais que isto, a serie parou e sai da lista. */
    public static final int STALE_AFTER_DAYS = 45;

    /** Mesmo nome e cor que o {@code DashboardService} usa para "sem categoria". */
    public static final String UNCATEGORIZED_NAME = "Sem categoria";
    public static final String UNCATEGORIZED_COLOR = "#94A3B8";

    private static final Pattern NOT_LETTER = Pattern.compile("[^\\p{L}]+");

    private AnalyticsRules() {
    }

    // ---------------------------------------------------------------
    // Janelas de tempo
    // ---------------------------------------------------------------

    /**
     * Ultimo dia considerado no mes de referencia: hoje, se for o mes
     * corrente; senao, o ultimo dia do mes.
     * <p>
     * Comparar o mes em andamento inteiro contra meses fechados inteiros
     * puniria todo inicio de mes: no dia 5 qualquer categoria parece 80%
     * abaixo da media.
     */
    public static int throughDay(YearMonth month, LocalDate today) {
        return month.equals(YearMonth.from(today)) ? today.getDayOfMonth() : month.lengthOfMonth();
    }

    /**
     * Fim da janela "ate a data" de um mes: dia {@code throughDay}, limitado
     * ao tamanho do mes. Com {@code throughDay = 31}, fevereiro conta inteiro
     * (28 ou 29), e nao "ate 3 de marco".
     * <p>
     * No banco a mesma janela e {@code day(occurredOn) <= throughDay}, que ja
     * se limita sozinha ao tamanho de cada mes.
     */
    public static LocalDate toDateEnd(YearMonth month, int throughDay) {
        return month.atDay(Math.min(throughDay, month.lengthOfMonth()));
    }

    /** Os {@code count} meses imediatamente anteriores a {@code month}, do mais antigo ao mais novo. */
    public static List<YearMonth> monthsBefore(YearMonth month, int count) {
        return monthsBetween(month.minusMonths(count), month.minusMonths(1));
    }

    /** Todos os meses de {@code from} a {@code to}, inclusive, em ordem. Vazio se {@code to < from}. */
    public static List<YearMonth> monthsBetween(YearMonth from, YearMonth to) {
        List<YearMonth> months = new ArrayList<>();
        for (YearMonth m = from; !m.isAfter(to); m = m.plusMonths(1)) {
            months.add(m);
        }
        return months;
    }

    // ---------------------------------------------------------------
    // Gasto por categoria contra a media
    // ---------------------------------------------------------------

    /**
     * Uma linha agregada pelo banco: gasto de uma categoria num mes.
     *
     * @param categoryId {@code null} para lancamentos sem categoria
     * @param full       gasto do mes inteiro (dentro do periodo consultado)
     * @param toDate     gasto do dia 1 a {@code throughDay}
     */
    public record CategoryMonthSum(
            Long categoryId,
            String name,
            String color,
            String icon,
            YearMonth month,
            BigDecimal full,
            BigDecimal toDate) {
    }

    /**
     * Monta as linhas de categoria a partir das somas mensais.
     * <p>
     * A media divide sempre por {@code baseline}, inclusive pelos meses em que
     * a categoria nao teve gasto: dividir so pelos meses com movimento faria
     * uma compra anual parecer gasto mensal.
     * <p>
     * A janela "ate a data" so existe no mes corrente, para nao punir o mes em
     * andamento. Mes fechado esta inteiro, e se compara com os meses de base
     * inteiros: senao fevereiro fechado (28 dias) seria comparado com o dia 1
     * a 28 de janeiro, e qualquer gasto de 29 a 31 sumiria da base.
     */
    public static CategoryTrends categoryTrends(YearMonth month, LocalDate today, int baseline,
            List<CategoryMonthSum> sums) {
        int throughDay = throughDay(month, today);
        boolean inProgress = month.equals(YearMonth.from(today));
        List<YearMonth> baseMonths = monthsBefore(month, baseline);

        // HashMap aceita chave nula: e ela que junta os "sem categoria".
        Map<Long, CategoryAcc> byCategory = new LinkedHashMap<>();
        for (CategoryMonthSum sum : sums) {
            CategoryAcc acc = byCategory.computeIfAbsent(sum.categoryId(), id -> new CategoryAcc(sum));
            acc.full.merge(sum.month(), nz(sum.full()), BigDecimal::add);
            acc.toDate.merge(sum.month(), nz(sum.toDate()), BigDecimal::add);
        }

        List<CategoryTrendRow> rows = new ArrayList<>();
        BigDecimal totalCurrent = zero();
        BigDecimal totalAverageToDate = zero();

        for (CategoryAcc acc : byCategory.values()) {
            BigDecimal baseFull = BigDecimal.ZERO;
            BigDecimal baseToDate = BigDecimal.ZERO;
            List<MonthTotal> monthly = new ArrayList<>(baseMonths.size() + 1);
            for (YearMonth base : baseMonths) {
                BigDecimal full = acc.full.getOrDefault(base, BigDecimal.ZERO);
                baseFull = baseFull.add(full);
                baseToDate = baseToDate.add(acc.toDate.getOrDefault(base, BigDecimal.ZERO));
                monthly.add(new MonthTotal(base.toString(), scaled(full)));
            }
            BigDecimal current = scaled(acc.toDate.getOrDefault(month, BigDecimal.ZERO));
            monthly.add(new MonthTotal(month.toString(), current));

            // Linha sem nada no mes nem na base (ex.: so movimento fora da
            // janela) nao informa nada; com base > 0 e mes zerado, informa
            // justamente que o gasto parou.
            if (current.signum() == 0 && baseFull.signum() == 0) {
                continue;
            }

            BigDecimal averageFullMonth = average(baseFull, baseline);
            BigDecimal averageToDate = inProgress ? average(baseToDate, baseline) : averageFullMonth;

            rows.add(new CategoryTrendRow(
                    acc.categoryId,
                    acc.name,
                    acc.color,
                    acc.icon,
                    current,
                    averageToDate,
                    averageFullMonth,
                    percentChange(averageToDate, current),
                    monthly));

            totalCurrent = totalCurrent.add(current);
            // Soma das linhas ja arredondadas, e nao a media do total: assim a
            // coluna da tabela fecha exatamente com o total exibido.
            totalAverageToDate = totalAverageToDate.add(averageToDate);
        }

        rows.sort(Comparator.comparing(CategoryTrendRow::current).reversed()
                .thenComparing(Comparator.comparing(CategoryTrendRow::averageFullMonth).reversed())
                .thenComparing(CategoryTrendRow::categoryName));

        return new CategoryTrends(
                month.toString(),
                throughDay,
                month.lengthOfMonth(),
                baseline,
                totalCurrent,
                totalAverageToDate,
                rows);
    }

    private static final class CategoryAcc {
        final Long categoryId;
        final String name;
        final String color;
        final String icon;
        final Map<YearMonth, BigDecimal> full = new HashMap<>();
        final Map<YearMonth, BigDecimal> toDate = new HashMap<>();

        CategoryAcc(CategoryMonthSum first) {
            this.categoryId = first.categoryId();
            this.name = first.categoryId() == null || first.name() == null ? UNCATEGORIZED_NAME : first.name();
            this.color = first.categoryId() == null || first.color() == null ? UNCATEGORIZED_COLOR : first.color();
            this.icon = first.categoryId() == null ? null : first.icon();
        }
    }

    // ---------------------------------------------------------------
    // Cobrancas recorrentes
    // ---------------------------------------------------------------

    /**
     * Uma despesa da janela, ja reduzida aos campos que a recorrencia usa.
     *
     * @param id desempate estavel entre lancamentos do mesmo dia
     */
    public record ExpenseLine(
            long id,
            String description,
            long accountId,
            String accountName,
            Long categoryId,
            String categoryName,
            String categoryColor,
            LocalDate date,
            BigDecimal amount) {
    }

    /**
     * Descricao comparavel entre meses: minusculas, sem acento, sem digitos e
     * pontuacao, espacos colapsados.
     * <p>
     * O extrato muda o que nao importa de um mes para o outro — numero de
     * parcela, data, codigo de autorizacao, um asterisco a mais. "NETFLIX.COM
     * 10/26" e "Netflix.com" precisam cair na mesma serie. Digito e pontuacao
     * viram espaco (e nao somem), para "NETFLIX.COM" nao virar "netflixcom" e
     * deixar de casar com "Netflix com".
     *
     * @return texto normalizado; vazio para {@code null} ou so digitos
     */
    public static String normalizeDescription(String description) {
        String plain = TextNormalizer.normalize(description);
        return NOT_LETTER.matcher(plain).replaceAll(" ").trim();
    }

    /**
     * Chave da serie: conta + descricao normalizada.
     * <p>
     * A conta entra na chave porque a mesma descricao em contas diferentes
     * sao cobrancas diferentes (o mesmo streaming pago por duas pessoas, por
     * exemplo). Descricao nula ou vazia depois de normalizada usa o nome da
     * categoria — senao todo lancamento sem texto da conta viraria uma serie
     * so; sem categoria tambem, "sem categoria".
     */
    public static String seriesKey(long accountId, String description, String categoryName) {
        String text = normalizeDescription(description);
        if (text.isEmpty()) {
            text = normalizeDescription(categoryName);
        }
        if (text.isEmpty()) {
            text = normalizeDescription(UNCATEGORIZED_NAME);
        }
        return accountId + ":" + text;
    }

    /**
     * Valor estavel: desvio padrao populacional / media {@code <=}
     * {@link #MAX_VARIATION}.
     * <p>
     * Conta exata, sem raiz e sem divisao: {@code dp/m <= v} equivale a
     * {@code n*S2 - S1^2 <= v^2 * S1^2}, com {@code S1} a soma e {@code S2} a
     * soma dos quadrados. Com raiz em {@code double}, uma serie exatamente no
     * limite (75, 125, 75, 125) cairia de um lado ou do outro conforme o
     * arredondamento.
     */
    public static boolean isStable(List<BigDecimal> amounts) {
        if (amounts.isEmpty()) {
            return false;
        }
        BigDecimal n = BigDecimal.valueOf(amounts.size());
        BigDecimal s1 = BigDecimal.ZERO;
        BigDecimal s2 = BigDecimal.ZERO;
        for (BigDecimal amount : amounts) {
            s1 = s1.add(amount);
            s2 = s2.add(amount.multiply(amount));
        }
        if (s1.signum() <= 0) {
            return false;
        }
        BigDecimal spread = n.multiply(s2).subtract(s1.multiply(s1));
        BigDecimal limit = MAX_VARIATION.multiply(MAX_VARIATION).multiply(s1.multiply(s1));
        return spread.compareTo(limit) <= 0;
    }

    /**
     * Criterio de recorrencia sobre um valor por mes (o maior de cada mes).
     *
     * @param monthlyAmounts um valor por mes distinto em que a serie apareceu
     */
    public static boolean isRecurring(List<BigDecimal> monthlyAmounts) {
        return monthlyAmounts.size() >= MIN_MONTHS && isStable(monthlyAmounts);
    }

    /**
     * Cobranca, e nao habito: no maximo 1,5 lancamento por mes em que a serie
     * apareceu.
     * <p>
     * Contar so o maior valor do mes protege a serie de uma cobranca duplicada,
     * mas cria o efeito contrario: com seis corridas de Uber por mes, a maior
     * de cada mes e estavel e "parece" fixa, inflando o custo mensal. A
     * frequencia separa os dois casos — uma mensalidade cobrada duas vezes num
     * mes so ainda fica abaixo de 1,5.
     *
     * @param entries    total de lancamentos da serie na janela
     * @param monthsSeen meses distintos em que ela apareceu
     */
    public static boolean isCharge(int entries, int monthsSeen) {
        return (long) entries * MAX_PER_MONTH_DEN <= (long) monthsSeen * MAX_PER_MONTH_NUM;
    }

    /**
     * Serie que parou: a ultima cobranca foi ha mais de 45 dias, ou seja, o
     * ultimo ciclo mensal passou sem ela. Exatamente 45 dias ainda conta —
     * cobranca do dia 31 vista no dia 15 do mes seguinte, por exemplo.
     */
    public static boolean isStale(LocalDate lastDate, LocalDate today) {
        return lastDate.isBefore(today.minusDays(STALE_AFTER_DAYS));
    }

    /**
     * Dia do mes mais comum. Empate fica com o menor dia: e deterministico e
     * a demonstracao chega ao mesmo numero.
     */
    public static int typicalDay(List<LocalDate> dates) {
        Map<Integer, Integer> counts = new TreeMap<>();
        for (LocalDate date : dates) {
            counts.merge(date.getDayOfMonth(), 1, Integer::sum);
        }
        int best = 1;
        int bestCount = 0;
        for (Map.Entry<Integer, Integer> entry : counts.entrySet()) {
            if (entry.getValue() > bestCount) {
                best = entry.getKey();
                bestCount = entry.getValue();
            }
        }
        return best;
    }

    /**
     * {@code typicalDay} no mes seguinte ao da ultima cobranca, limitado ao
     * tamanho do mes: cobranca do dia 31 em janeiro e esperada em 28/02, nao
     * em 03/03.
     */
    public static LocalDate nextExpected(LocalDate lastDate, int typicalDay) {
        YearMonth next = YearMonth.from(lastDate).plusMonths(1);
        return next.atDay(Math.min(typicalDay, next.lengthOfMonth()));
    }

    /**
     * Encontra as series recorrentes entre as despesas da janela.
     * <p>
     * Cada serie conta no maximo um lancamento por mes, o de maior valor: uma
     * mensalidade cobrada duas vezes por engano, ou um estorno parcial, nao
     * pode quebrar a regularidade da serie nem contar dois meses.
     */
    public static RecurringExpenses findRecurring(int windowMonths, List<ExpenseLine> lines, LocalDate today) {
        Map<String, List<ExpenseLine>> series = new LinkedHashMap<>();
        for (ExpenseLine line : lines) {
            series.computeIfAbsent(seriesKey(line.accountId(), line.description(), line.categoryName()),
                    key -> new ArrayList<>()).add(line);
        }

        Comparator<ExpenseLine> chronological = Comparator.comparing(ExpenseLine::date)
                .thenComparingLong(ExpenseLine::id);
        // No mesmo mes, fica o de maior valor; empate, o mais recente.
        Comparator<ExpenseLine> keepOrder = Comparator.comparing(ExpenseLine::amount).thenComparing(chronological);

        List<RecurringExpense> items = new ArrayList<>();
        for (Map.Entry<String, List<ExpenseLine>> entry : series.entrySet()) {
            Map<YearMonth, ExpenseLine> perMonth = new TreeMap<>();
            for (ExpenseLine line : entry.getValue()) {
                perMonth.merge(YearMonth.from(line.date()), line,
                        (a, b) -> keepOrder.compare(a, b) >= 0 ? a : b);
            }
            List<BigDecimal> amounts = perMonth.values().stream().map(ExpenseLine::amount).toList();
            if (!isRecurring(amounts) || !isCharge(entry.getValue().size(), perMonth.size())) {
                continue;
            }

            ExpenseLine latest = entry.getValue().stream().max(chronological).orElseThrow();
            // Fora de items e, por consequencia, do custo fixo: uma assinatura
            // cancelada nao e custo deste mes.
            if (isStale(latest.date(), today)) {
                continue;
            }
            BigDecimal sum = amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            int day = typicalDay(perMonth.values().stream().map(ExpenseLine::date).toList());

            items.add(new RecurringExpense(
                    entry.getKey(),
                    labelOf(latest),
                    latest.categoryId(),
                    latest.categoryId() == null ? null : latest.categoryName(),
                    latest.categoryId() == null ? null : latest.categoryColor(),
                    latest.accountName(),
                    average(sum, amounts.size()),
                    scaled(latest.amount()),
                    latest.date(),
                    perMonth.size(),
                    day,
                    nextExpected(latest.date(), day)));
        }

        items.sort(Comparator.comparing(RecurringExpense::averageAmount).reversed()
                .thenComparing(RecurringExpense::label)
                .thenComparing(RecurringExpense::key));

        BigDecimal monthlyTotal = items.stream()
                .map(RecurringExpense::averageAmount)
                .reduce(zero(), BigDecimal::add);
        return new RecurringExpenses(windowMonths, monthlyTotal, items);
    }

    private static String labelOf(ExpenseLine line) {
        if (line.description() != null && !line.description().isBlank()) {
            return line.description().trim();
        }
        return line.categoryName() != null ? line.categoryName() : UNCATEGORIZED_NAME;
    }

    // ---------------------------------------------------------------
    // Fluxo de caixa
    // ---------------------------------------------------------------

    /**
     * Serie mensal continua de {@code from} ate {@code current}, com zeros nos
     * meses sem movimento.
     * <p>
     * O banco so devolve meses que tiveram lancamento. Um buraco na serie faria
     * o grafico ligar marco direto a maio e esconder o mes parado — que e
     * justamente o que se quer ver.
     *
     * @param income  entradas por mes (meses ausentes = zero)
     * @param expense saidas por mes (meses ausentes = zero)
     */
    public static Cashflow cashflow(YearMonth from, YearMonth current,
            Map<YearMonth, BigDecimal> income, Map<YearMonth, BigDecimal> expense) {
        List<CashflowMonth> months = new ArrayList<>();
        BigDecimal totalIncome = zero();
        BigDecimal totalExpense = zero();
        BigDecimal closedNet = BigDecimal.ZERO;
        int closed = 0;

        for (YearMonth month : monthsBetween(from, current)) {
            BigDecimal in = scaled(income.get(month));
            BigDecimal out = scaled(expense.get(month));
            BigDecimal net = in.subtract(out);
            boolean partial = month.equals(current);
            months.add(new CashflowMonth(month.toString(), in, out, net, partial));

            totalIncome = totalIncome.add(in);
            totalExpense = totalExpense.add(out);
            if (!partial) {
                closedNet = closedNet.add(net);
                closed++;
            }
        }

        return new Cashflow(
                months,
                totalIncome,
                totalExpense,
                totalIncome.subtract(totalExpense),
                closed == 0 ? null : average(closedNet, closed));
    }

    // ---------------------------------------------------------------
    // Dinheiro
    // ---------------------------------------------------------------

    /** Media em reais, 2 casas, HALF_UP. */
    public static BigDecimal average(BigDecimal sum, int count) {
        return sum.divide(BigDecimal.valueOf(count), SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Variacao percentual, com o mesmo arredondamento do dashboard (razao em
     * 4 casas, depois x100).
     *
     * @return {@code null} quando a base e zero — "aumento de X%" partindo do
     *         nada nao existe
     */
    public static Double percentChange(BigDecimal base, BigDecimal current) {
        if (base == null || base.signum() == 0) {
            return null;
        }
        return current.subtract(base)
                .divide(base, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .doubleValue();
    }

    static BigDecimal scaled(BigDecimal value) {
        return value == null ? zero() : value.setScale(SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(SCALE);
    }
}
