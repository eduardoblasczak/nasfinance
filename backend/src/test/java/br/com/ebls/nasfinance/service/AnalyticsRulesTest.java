package br.com.ebls.nasfinance.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import br.com.ebls.nasfinance.api.dto.Cashflow;
import br.com.ebls.nasfinance.api.dto.CashflowMonth;
import br.com.ebls.nasfinance.api.dto.CategoryTrendRow;
import br.com.ebls.nasfinance.api.dto.CategoryTrends;
import br.com.ebls.nasfinance.api.dto.RecurringExpense;
import br.com.ebls.nasfinance.api.dto.RecurringExpenses;
import br.com.ebls.nasfinance.service.AnalyticsRules.CategoryMonthSum;
import br.com.ebls.nasfinance.service.AnalyticsRules.ExpenseLine;

/**
 * As regras da pagina de Analises que erram em silencio: uma janela um dia
 * maior, um mes vazio que some ou uma cobranca que deixa de ser reconhecida
 * dao numeros plausiveis, nao excecao.
 */
class AnalyticsRulesTest {

    private static BigDecimal brl(String value) {
        return new BigDecimal(value);
    }

    private static List<BigDecimal> amounts(String... values) {
        return java.util.Arrays.stream(values).map(BigDecimal::new).toList();
    }

    // =============================================================
    @Nested
    @DisplayName("janela do averageToDate")
    class Window {

        @Test
        @DisplayName("mes corrente vai ate hoje; mes fechado, ate o ultimo dia")
        void throughDay() {
            LocalDate today = LocalDate.of(2026, 11, 1);

            assertEquals(1, AnalyticsRules.throughDay(YearMonth.of(2026, 11), today));
            assertEquals(31, AnalyticsRules.throughDay(YearMonth.of(2026, 10), today));
            assertEquals(30, AnalyticsRules.throughDay(YearMonth.of(2026, 9), today));
            assertEquals(28, AnalyticsRules.throughDay(YearMonth.of(2026, 2), today));
            assertEquals(29, AnalyticsRules.throughDay(YearMonth.of(2024, 2), today));
        }

        @Test
        @DisplayName("ultimo dia do mes corrente conta o mes inteiro")
        void throughDayOnLastDay() {
            assertEquals(29, AnalyticsRules.throughDay(YearMonth.of(2028, 2), LocalDate.of(2028, 2, 29)));
        }

        @Test
        @DisplayName("a janela se limita ao tamanho de cada mes (28, 29, 30, 31)")
        void toDateEndCapsAtMonthLength() {
            assertEquals(LocalDate.of(2026, 2, 28), AnalyticsRules.toDateEnd(YearMonth.of(2026, 2), 31));
            assertEquals(LocalDate.of(2028, 2, 29), AnalyticsRules.toDateEnd(YearMonth.of(2028, 2), 30));
            assertEquals(LocalDate.of(2026, 4, 30), AnalyticsRules.toDateEnd(YearMonth.of(2026, 4), 31));
            assertEquals(LocalDate.of(2026, 3, 31), AnalyticsRules.toDateEnd(YearMonth.of(2026, 3), 31));
            assertEquals(LocalDate.of(2026, 1, 15), AnalyticsRules.toDateEnd(YearMonth.of(2026, 1), 15));
        }

        @Test
        @DisplayName("meses de base sao os imediatamente anteriores, do mais antigo ao mais novo, atravessando o ano")
        void baseMonths() {
            assertEquals(
                    List.of(YearMonth.of(2025, 11), YearMonth.of(2025, 12), YearMonth.of(2026, 1)),
                    AnalyticsRules.monthsBefore(YearMonth.of(2026, 2), 3));
        }
    }

    // =============================================================
    @Nested
    @DisplayName("gasto por categoria contra a media")
    class Categories {

        private final YearMonth ref = YearMonth.of(2026, 3);
        /** Hoje bem depois de marco: o mes de referencia esta fechado. */
        private final LocalDate today = LocalDate.of(2026, 11, 1);

        private CategoryMonthSum sum(Long id, String name, YearMonth month, String full, String toDate) {
            return new CategoryMonthSum(id, name, "#111111", "cart", month, brl(full), brl(toDate));
        }

        @Test
        @DisplayName("a media divide pelos meses de base, inclusive os sem movimento")
        void averageCountsEmptyMonths() {
            // Base: dez, jan, fev. So jan teve gasto.
            CategoryTrends trends = AnalyticsRules.categoryTrends(ref, today, 3, List.of(
                    sum(1L, "Mercado", YearMonth.of(2026, 1), "300.00", "300.00"),
                    sum(1L, "Mercado", ref, "50.00", "50.00")));

            CategoryTrendRow row = trends.rows().get(0);
            assertEquals(brl("100.00"), row.averageFullMonth());
            assertEquals(brl("100.00"), row.averageToDate());
            assertEquals(-50.0, row.deltaPct());
            // A serie continua: o mes vazio aparece com zero.
            assertEquals(4, row.monthly().size());
            assertEquals("2025-12", row.monthly().get(0).month());
            assertEquals(brl("0.00"), row.monthly().get(0).total());
            assertEquals("2026-03", row.monthly().get(3).month());
        }

        @Test
        @DisplayName("mes corrente: averageToDate usa a soma ate o dia; averageFullMonth, o mes inteiro")
        void toDateVersusFullMonth() {
            CategoryTrends trends = AnalyticsRules.categoryTrends(YearMonth.of(2026, 11), LocalDate.of(2026, 11, 10), 2, List.of(
                    sum(1L, "Mercado", YearMonth.of(2026, 9), "600.00", "200.00"),
                    sum(1L, "Mercado", YearMonth.of(2026, 10), "400.00", "100.00"),
                    sum(1L, "Mercado", YearMonth.of(2026, 11), "180.00", "180.00")));

            CategoryTrendRow row = trends.rows().get(0);
            assertEquals(brl("150.00"), row.averageToDate());
            assertEquals(brl("500.00"), row.averageFullMonth());
            assertEquals(20.0, row.deltaPct());
            assertEquals(10, trends.throughDay());
            assertEquals(30, trends.daysInMonth());
        }

        @Test
        @DisplayName("fevereiro fechado se compara com os meses de base inteiros, nao com o dia 1 a 28")
        void closedShortMonthUsesFullMonths() {
            YearMonth february = YearMonth.of(2026, 2);
            // Janeiro: 310 no mes, 280 ate o dia 28 (30 caiu nos dias 29 a 31).
            CategoryTrends trends = AnalyticsRules.categoryTrends(february, today, 1, List.of(
                    sum(1L, "Mercado", YearMonth.of(2026, 1), "310.00", "280.00"),
                    sum(1L, "Mercado", february, "310.00", "310.00")));

            CategoryTrendRow row = trends.rows().get(0);
            assertEquals(28, trends.throughDay());
            assertEquals(brl("310.00"), row.averageFullMonth());
            assertEquals(brl("310.00"), row.averageToDate());
            assertEquals(0.0, row.deltaPct());
            assertEquals(brl("310.00"), trends.totalAverageToDate());
        }

        @Test
        @DisplayName("fevereiro em andamento no dia 28 ainda compara janelas iguais")
        void currentShortMonthUsesToDateWindow() {
            YearMonth february = YearMonth.of(2026, 2);
            CategoryTrends trends = AnalyticsRules.categoryTrends(february, LocalDate.of(2026, 2, 28), 1, List.of(
                    sum(1L, "Mercado", YearMonth.of(2026, 1), "310.00", "280.00"),
                    sum(1L, "Mercado", february, "280.00", "280.00")));

            assertEquals(brl("280.00"), trends.rows().get(0).averageToDate());
            assertEquals(brl("310.00"), trends.rows().get(0).averageFullMonth());
        }

        @Test
        @DisplayName("categoria sem gasto no mes, mas com media, aparece com current zero")
        void includesStoppedCategory() {
            CategoryTrends trends = AnalyticsRules.categoryTrends(ref, today, 2, List.of(
                    sum(2L, "Lazer", YearMonth.of(2026, 2), "80.00", "80.00")));

            assertEquals(1, trends.rows().size());
            assertEquals(brl("0.00"), trends.rows().get(0).current());
            assertEquals(-100.0, trends.rows().get(0).deltaPct());
        }

        @Test
        @DisplayName("sem base, deltaPct e nulo (nao existe aumento partindo do zero)")
        void nullDeltaWithoutBase() {
            CategoryTrends trends = AnalyticsRules.categoryTrends(ref, today, 6, List.of(
                    sum(3L, "Viagem", ref, "900.00", "900.00")));

            assertNull(trends.rows().get(0).deltaPct());
            assertEquals(brl("0.00"), trends.rows().get(0).averageToDate());
        }

        @Test
        @DisplayName("mes sem movimento nenhum: sem linhas e totais zerados")
        void emptyMonth() {
            CategoryTrends trends = AnalyticsRules.categoryTrends(ref, today, 6, List.of());

            assertTrue(trends.rows().isEmpty());
            assertEquals(brl("0.00"), trends.totalCurrent());
            assertEquals(brl("0.00"), trends.totalAverageToDate());
        }

        @Test
        @DisplayName("sem categoria vira uma linha com id nulo e nome 'Sem categoria'")
        void uncategorized() {
            CategoryTrends trends = AnalyticsRules.categoryTrends(ref, today, 1, List.of(
                    new CategoryMonthSum(null, null, null, null, ref, brl("40.00"), brl("40.00"))));

            CategoryTrendRow row = trends.rows().get(0);
            assertNull(row.categoryId());
            assertEquals("Sem categoria", row.categoryName());
            assertEquals(AnalyticsRules.UNCATEGORIZED_COLOR, row.color());
        }

        @Test
        @DisplayName("linhas por current decrescente e totais somando as linhas")
        void orderAndTotals() {
            CategoryTrends trends = AnalyticsRules.categoryTrends(ref, today, 3, List.of(
                    sum(1L, "Mercado", ref, "100.00", "100.00"),
                    sum(2L, "Moradia", ref, "2000.00", "2000.00"),
                    sum(2L, "Moradia", YearMonth.of(2026, 2), "2000.00", "2000.00"),
                    sum(3L, "Lazer", YearMonth.of(2026, 1), "10.00", "10.00"),
                    sum(4L, "Saude", YearMonth.of(2026, 2), "20.00", "20.00")));

            assertEquals(List.of("Moradia", "Mercado", "Saude", "Lazer"),
                    trends.rows().stream().map(CategoryTrendRow::categoryName).toList());
            assertEquals(brl("2100.00"), trends.totalCurrent());
            // 666.67 + 0 + 6.67 + 3.33: a soma das linhas arredondadas.
            assertEquals(brl("676.67"), trends.totalAverageToDate());
        }
    }

    // =============================================================
    @Nested
    @DisplayName("normalizacao da descricao")
    class Normalization {

        @Test
        @DisplayName("minusculas, sem acento, sem digito e pontuacao, espacos colapsados")
        void normalizes() {
            assertEquals("netflix com", AnalyticsRules.normalizeDescription("NETFLIX.COM 10/26"));
            assertEquals("condominio", AnalyticsRules.normalizeDescription("Condomínio"));
            assertEquals("uber trip", AnalyticsRules.normalizeDescription("  UBER   *TRIP  "));
            assertEquals("smartfit mensalidade", AnalyticsRules.normalizeDescription("SMARTFIT*MENSALIDADE"));
            assertEquals("parcela de", AnalyticsRules.normalizeDescription("PARCELA 03 DE 12"));
        }

        @Test
        @DisplayName("nula ou so digitos vira texto vazio")
        void emptyCases() {
            assertEquals("", AnalyticsRules.normalizeDescription(null));
            assertEquals("", AnalyticsRules.normalizeDescription("  "));
            assertEquals("", AnalyticsRules.normalizeDescription("123-456"));
        }

        @Test
        @DisplayName("descricao nula usa o nome da categoria; sem categoria tambem, 'sem categoria'")
        void keyFallbacks() {
            assertEquals("1:moradia", AnalyticsRules.seriesKey(1, null, "Moradia"));
            assertEquals("1:moradia", AnalyticsRules.seriesKey(1, "0001", "Moradia"));
            assertEquals("1:sem categoria", AnalyticsRules.seriesKey(1, null, null));
        }

        @Test
        @DisplayName("a mesma descricao em contas diferentes sao series diferentes")
        void accountIsPartOfKey() {
            assertNotEquals(AnalyticsRules.seriesKey(1, "Spotify", null), AnalyticsRules.seriesKey(2, "Spotify", null));
            assertEquals(AnalyticsRules.seriesKey(1, "SPOTIFY 10/26", null), AnalyticsRules.seriesKey(1, "Spotify", null));
        }
    }

    // =============================================================
    @Nested
    @DisplayName("criterio de recorrencia")
    class Criterion {

        @Test
        @DisplayName("variacao exatamente 0,25 ainda e recorrente")
        void atTheLimit() {
            // media 100, desvio padrao populacional 25
            assertTrue(AnalyticsRules.isRecurring(amounts("75.00", "125.00", "75.00", "125.00")));
        }

        @Test
        @DisplayName("variacao um pouco acima de 0,25 nao e")
        void justAboveTheLimit() {
            // media 100, desvio padrao 25,01
            assertFalse(AnalyticsRules.isRecurring(amounts("74.99", "125.01", "74.99", "125.01")));
        }

        @Test
        @DisplayName("precisa de pelo menos 3 meses distintos")
        void minimumMonths() {
            assertFalse(AnalyticsRules.isRecurring(amounts("44.90", "44.90")));
            assertTrue(AnalyticsRules.isRecurring(amounts("44.90", "44.90", "44.90")));
        }

        @Test
        @DisplayName("conta de luz que oscila pouco e recorrente; compra avulsa, nao")
        void typicalCases() {
            assertTrue(AnalyticsRules.isRecurring(amounts("150.00", "172.40", "138.10", "199.90")));
            assertFalse(AnalyticsRules.isRecurring(amounts("30.00", "250.00", "90.00")));
        }

        @Test
        @DisplayName("dia tipico e o mais comum; empate fica com o menor")
        void typicalDay() {
            assertEquals(10, AnalyticsRules.typicalDay(List.of(
                    LocalDate.of(2026, 1, 10), LocalDate.of(2026, 2, 11), LocalDate.of(2026, 3, 10))));
            assertEquals(5, AnalyticsRules.typicalDay(List.of(
                    LocalDate.of(2026, 1, 7), LocalDate.of(2026, 2, 5))));
        }

        @Test
        @DisplayName("proxima cobranca no dia tipico do mes seguinte, limitada ao tamanho do mes")
        void nextExpected() {
            assertEquals(LocalDate.of(2026, 2, 28), AnalyticsRules.nextExpected(LocalDate.of(2026, 1, 31), 31));
            assertEquals(LocalDate.of(2027, 1, 10), AnalyticsRules.nextExpected(LocalDate.of(2026, 12, 9), 10));
        }
    }

    // =============================================================
    @Nested
    @DisplayName("series recorrentes")
    class Recurring {

        /** Hoje: as series de agosto a outubro de 2026 ainda estao ativas. */
        private static final LocalDate TODAY = LocalDate.of(2026, 11, 1);

        private long nextId = 1;

        private ExpenseLine line(String description, long account, Long categoryId, String date, String amount) {
            return new ExpenseLine(nextId++, description, account, "Conta " + account, categoryId,
                    categoryId == null ? null : "Moradia", categoryId == null ? null : "#9085e9",
                    LocalDate.parse(date), new BigDecimal(amount));
        }

        @Test
        @DisplayName("um lancamento por mes: serie reconhecida com media, ultimo valor e proxima data")
        void oneEntryPerMonth() {
            RecurringExpenses result = AnalyticsRules.findRecurring(6, List.of(
                    line("NETFLIX.COM", 2, 7L, "2026-08-08", "39.90"),
                    line("NETFLIX.COM", 2, 7L, "2026-09-08", "44.90"),
                    line("Netflix.com 10/26", 2, 7L, "2026-10-08", "44.90")), TODAY);

            assertEquals(1, result.items().size());
            RecurringExpense item = result.items().get(0);
            assertEquals("2:netflix com", item.key());
            assertEquals("Netflix.com 10/26", item.label());
            assertEquals(3, item.monthsSeen());
            assertEquals(brl("43.23"), item.averageAmount());
            assertEquals(brl("44.90"), item.lastAmount());
            assertEquals(LocalDate.of(2026, 10, 8), item.lastDate());
            assertEquals(8, item.typicalDay());
            assertEquals(LocalDate.of(2026, 11, 8), item.nextExpected());
            assertEquals(6, result.windowMonths());
            assertEquals(brl("43.23"), result.monthlyTotal());
        }

        @Test
        @DisplayName("cobranca duplicada num mes conta um mes so, pelo maior valor, e continua cobranca")
        void maxPerMonth() {
            List<ExpenseLine> lines = new ArrayList<>(List.of(
                    line("Academia", 1, 5L, "2026-08-06", "109.90"),
                    line("Academia", 1, 5L, "2026-08-20", "5.00"),
                    line("Academia", 1, 5L, "2026-09-06", "109.90"),
                    line("Academia", 1, 5L, "2026-10-06", "109.90")));

            RecurringExpense item = AnalyticsRules.findRecurring(6, lines, TODAY).items().get(0);
            assertEquals(3, item.monthsSeen());
            // Se o de R$ 5 contasse, a media cairia e a variacao reprovaria a serie.
            assertEquals(brl("109.90"), item.averageAmount());

            // E dois meses com dois lancamentos cada nao viram quatro meses.
            List<ExpenseLine> twoMonths = List.of(
                    line("Uber", 1, null, "2026-08-01", "20.00"),
                    line("Uber", 1, null, "2026-08-02", "21.00"),
                    line("Uber", 1, null, "2026-09-01", "20.00"),
                    line("Uber", 1, null, "2026-09-02", "21.00"));
            assertTrue(AnalyticsRules.findRecurring(6, twoMonths, TODAY).items().isEmpty());
        }

        @Test
        @DisplayName("habito nao e cobranca: seis Uber por mes com o maior estavel ficam fora")
        void frequentHabitIsNotACharge() {
            List<ExpenseLine> lines = new ArrayList<>();
            for (String month : List.of("2026-08", "2026-09", "2026-10")) {
                // O maior do mes e sempre 45,00: passaria pela variacao sozinho.
                for (int trip = 1; trip <= 6; trip++) {
                    lines.add(line("UBER *TRIP", 2, 3L, month + "-1" + trip, trip == 6 ? "45.00" : "18.00"));
                }
                lines.add(line("Aluguel", 1, 4L, month + "-10", "1850.00"));
            }

            RecurringExpenses result = AnalyticsRules.findRecurring(6, lines, TODAY);
            assertEquals(List.of("Aluguel"), result.items().stream().map(RecurringExpense::label).toList());
            assertEquals(brl("1850.00"), result.monthlyTotal());
        }

        @Test
        @DisplayName("frequencia: ate 1,5 lancamento por mes visto e cobranca; acima, nao")
        void chargeFrequency() {
            assertTrue(AnalyticsRules.isCharge(3, 3));
            assertTrue(AnalyticsRules.isCharge(4, 3));
            assertTrue(AnalyticsRules.isCharge(3, 2));
            assertFalse(AnalyticsRules.isCharge(4, 2));
            assertFalse(AnalyticsRules.isCharge(18, 3));
        }

        @Test
        @DisplayName("serie parada: 45 dias desde a ultima cobranca ainda conta; 46, nao")
        void staleSeries() {
            LocalDate last = LocalDate.of(2026, 9, 17);
            List<ExpenseLine> lines = List.of(
                    line("CURSO ONLINE", 2, 8L, "2026-07-17", "89.00"),
                    line("CURSO ONLINE", 2, 8L, "2026-08-17", "89.00"),
                    line("CURSO ONLINE", 2, 8L, last.toString(), "89.00"));

            RecurringExpenses at45 = AnalyticsRules.findRecurring(6, lines, last.plusDays(45));
            assertEquals(1, at45.items().size());
            assertEquals(brl("89.00"), at45.monthlyTotal());

            RecurringExpenses at46 = AnalyticsRules.findRecurring(6, lines, last.plusDays(46));
            assertTrue(at46.items().isEmpty());
            assertEquals(brl("0.00"), at46.monthlyTotal());

            assertFalse(AnalyticsRules.isStale(last, last.plusDays(45)));
            assertTrue(AnalyticsRules.isStale(last, last.plusDays(46)));
        }

        @Test
        @DisplayName("descricao nula agrupa pelo nome da categoria e o rotulo e a categoria")
        void nullDescription() {
            RecurringExpenses result = AnalyticsRules.findRecurring(6, List.of(
                    line(null, 1, 4L, "2026-08-10", "1850.00"),
                    line(null, 1, 4L, "2026-09-10", "1850.00"),
                    line(null, 1, 4L, "2026-10-10", "1850.00")), TODAY);

            RecurringExpense item = result.items().get(0);
            assertEquals("1:moradia", item.key());
            assertEquals("Moradia", item.label());
            assertEquals(4L, item.categoryId());
        }

        @Test
        @DisplayName("sem categoria: nome e cor da categoria nulos, rotulo pela descricao")
        void uncategorized() {
            RecurringExpense item = AnalyticsRules.findRecurring(6, List.of(
                    line("PIX ENVIADO DIARISTA", 1, null, "2026-08-15", "200.00"),
                    line("PIX ENVIADO DIARISTA", 1, null, "2026-09-15", "200.00"),
                    line("PIX ENVIADO DIARISTA", 1, null, "2026-10-15", "200.00")), TODAY).items().get(0);

            assertNull(item.categoryId());
            assertNull(item.categoryName());
            assertNull(item.categoryColor());
        }

        @Test
        @DisplayName("itens por media decrescente; custo fixo e a soma das medias")
        void orderAndTotal() {
            List<ExpenseLine> lines = new ArrayList<>();
            for (String month : List.of("2026-08", "2026-09", "2026-10")) {
                lines.add(line("Spotify", 2, 7L, month + "-12", "21.90"));
                lines.add(line("Aluguel", 1, 4L, month + "-10", "1850.00"));
                lines.add(line("Internet", 1, 4L, month + "-15", "119.90"));
            }
            RecurringExpenses result = AnalyticsRules.findRecurring(6, lines, TODAY);

            assertEquals(List.of("Aluguel", "Internet", "Spotify"),
                    result.items().stream().map(RecurringExpense::label).toList());
            assertEquals(brl("1991.80"), result.monthlyTotal());
        }

        @Test
        @DisplayName("janela sem despesa nenhuma: lista vazia e custo fixo zero")
        void empty() {
            RecurringExpenses result = AnalyticsRules.findRecurring(3, List.of(), TODAY);
            assertTrue(result.items().isEmpty());
            assertEquals(brl("0.00"), result.monthlyTotal());
        }
    }

    // =============================================================
    @Nested
    @DisplayName("fluxo de caixa")
    class Cashflows {

        @Test
        @DisplayName("meses sem movimento aparecem com zero e a serie e continua")
        void fillsEmptyMonths() {
            YearMonth current = YearMonth.of(2026, 11);
            Cashflow flow = AnalyticsRules.cashflow(YearMonth.of(2026, 8), current,
                    Map.of(YearMonth.of(2026, 8), brl("5900.00"), YearMonth.of(2026, 10), brl("6000.00")),
                    Map.of(YearMonth.of(2026, 8), brl("4000.00"), current, brl("300.00")));

            assertEquals(List.of("2026-08", "2026-09", "2026-10", "2026-11"),
                    flow.months().stream().map(CashflowMonth::month).toList());
            CashflowMonth september = flow.months().get(1);
            assertEquals(brl("0.00"), september.income());
            assertEquals(brl("0.00"), september.expense());
            assertEquals(brl("0.00"), september.net());
            assertFalse(september.partial());
            assertTrue(flow.months().get(3).partial());
            assertEquals(brl("-300.00"), flow.months().get(3).net());
        }

        @Test
        @DisplayName("totais incluem o mes parcial; a media do saldo, nao")
        void averageIgnoresPartial() {
            YearMonth current = YearMonth.of(2026, 11);
            Cashflow flow = AnalyticsRules.cashflow(YearMonth.of(2026, 9), current,
                    Map.of(YearMonth.of(2026, 9), brl("1000.00"), YearMonth.of(2026, 10), brl("1000.00")),
                    Map.of(YearMonth.of(2026, 9), brl("700.00"), YearMonth.of(2026, 10), brl("1100.00"),
                            current, brl("500.00")));

            assertEquals(brl("2000.00"), flow.totalIncome());
            assertEquals(brl("2300.00"), flow.totalExpense());
            assertEquals(brl("-300.00"), flow.totalNet());
            // (300 + -100) / 2, sem o -500 do mes corrente
            assertEquals(brl("100.00"), flow.averageNet());
        }

        @Test
        @DisplayName("so o mes parcial: media nula")
        void onlyPartial() {
            YearMonth current = YearMonth.of(2026, 11);
            Cashflow flow = AnalyticsRules.cashflow(current, current, Map.of(), Map.of());
            assertEquals(1, flow.months().size());
            assertNull(flow.averageNet());
        }
    }
}
