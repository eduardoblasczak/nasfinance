package br.com.ebls.nasfinance.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

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
import br.com.ebls.nasfinance.service.SpendingPatternRules.BudgetSpend;
import br.com.ebls.nasfinance.service.SpendingPatternRules.DaySum;
import br.com.ebls.nasfinance.service.SpendingPatternRules.MerchantLine;
import br.com.ebls.nasfinance.service.SpendingPatternRules.SourceSum;

/**
 * Leva 2 das Analises: um dia que some do calendario, dois mercados que
 * deviam ser um so ou um teto "ok" que ja estourou dao numeros plausiveis,
 * nao excecao.
 */
class SpendingPatternRulesTest {

    private static BigDecimal brl(String value) {
        return new BigDecimal(value);
    }

    // =============================================================
    @Nested
    @DisplayName("janela")
    class Window {

        @Test
        @DisplayName("months = 1 e so o mes corrente; 6 volta cinco meses, atravessando o ano")
        void windowStart() {
            LocalDate today = LocalDate.of(2026, 3, 17);
            assertEquals(LocalDate.of(2026, 3, 1), SpendingPatternRules.windowStart(today, 1));
            assertEquals(LocalDate.of(2025, 10, 1), SpendingPatternRules.windowStart(today, 6));
            assertEquals(LocalDate.of(2025, 4, 1), SpendingPatternRules.windowStart(today, 12));
        }
    }

    // =============================================================
    @Nested
    @DisplayName("calendario")
    class Calendar {

        @Test
        @DisplayName("um item por dia, inclusive os sem gasto, e o maior dia como escala")
        void continuousSeries() {
            LocalDate from = LocalDate.of(2026, 2, 26);
            LocalDate to = LocalDate.of(2026, 3, 2);
            SpendingCalendar calendar = SpendingPatternRules.calendar(from, to, List.of(
                    new DaySum(LocalDate.of(2026, 2, 27), brl("10.5"), 2),
                    new DaySum(LocalDate.of(2026, 3, 1), brl("80.00"), 1)));

            assertEquals(5, calendar.days().size());
            assertEquals(from, calendar.days().get(0).date());
            assertEquals(LocalDate.of(2026, 2, 28), calendar.days().get(2).date());
            assertEquals(to, calendar.days().get(4).date());
            assertEquals(brl("0.00"), calendar.days().get(0).expense());
            assertEquals(0, calendar.days().get(0).count());
            assertEquals(brl("10.50"), calendar.days().get(1).expense());
            assertEquals(2, calendar.days().get(1).count());
            assertEquals(brl("80.00"), calendar.maxExpense());
        }

        @Test
        @DisplayName("sem nenhum gasto: todos os dias com zero e escala zero")
        void empty() {
            LocalDate day = LocalDate.of(2026, 11, 1);
            SpendingCalendar calendar = SpendingPatternRules.calendar(day, day, List.of());
            assertEquals(List.of(new CalendarDay(day, brl("0.00"), 0)), calendar.days());
            assertEquals(brl("0.00"), calendar.maxExpense());
        }
    }

    // =============================================================
    @Nested
    @DisplayName("estabelecimentos")
    class Merchants {

        private MerchantLine line(long id, String description, String category, String date, String amount) {
            return new MerchantLine(id, description, category, category == null ? null : "#000000",
                    LocalDate.parse(date), brl(amount));
        }

        @Test
        @DisplayName("a mesma descricao normalizada e um estabelecimento so, em qualquer conta")
        void sameKeyAcrossAccounts() {
            // O servico nem projeta a conta: aqui so a descricao importa.
            TopMerchants top = SpendingPatternRules.topMerchants(3, 10, brl("300"), List.of(
                    line(1, "COMPRA DEBITO SUPERMERCADO BOM PRECO", "Mercado", "2026-10-02", "100"),
                    line(2, "Compra débito Supermercado Bom Preço 123", "Mercado", "2026-10-09", "50.10")));

            assertEquals(1, top.items().size());
            Merchant merchant = top.items().get(0);
            assertEquals("compra debito supermercado bom preco", merchant.key());
            assertEquals(2, merchant.count());
            assertEquals(brl("150.10"), merchant.total());
            assertEquals(brl("75.05"), merchant.average());
            assertEquals(brl("300.00"), top.totalExpense());
        }

        @Test
        @DisplayName("rotulo, categoria e data vem do lancamento mais recente")
        void latestWins() {
            TopMerchants top = SpendingPatternRules.topMerchants(3, 10, brl("0"), List.of(
                    line(9, "Padaria", null, "2026-10-20", "5"),
                    line(3, "PADARIA", "Restaurantes", "2026-10-21", "5"),
                    line(1, "padaria!", "Mercado", "2026-10-01", "5")));

            Merchant merchant = top.items().get(0);
            assertEquals("PADARIA", merchant.label());
            assertEquals("Restaurantes", merchant.categoryName());
            assertEquals(LocalDate.of(2026, 10, 21), merchant.lastDate());
        }

        @Test
        @DisplayName("no mesmo dia, desempata pelo id; sem categoria no mais recente, categoria nula")
        void tieOnDateUsesId() {
            TopMerchants top = SpendingPatternRules.topMerchants(3, 10, brl("0"), List.of(
                    line(7, "Uber trip", null, "2026-10-21", "5"),
                    line(3, "UBER *TRIP", "Transporte", "2026-10-21", "5")));

            assertEquals("Uber trip", top.items().get(0).label());
            assertNull(top.items().get(0).categoryName());
            assertNull(top.items().get(0).categoryColor());
        }

        @Test
        @DisplayName("descricao que some na normalizacao nao vira estabelecimento, mas fica no total")
        void digitsOnlyAreSkipped() {
            TopMerchants top = SpendingPatternRules.topMerchants(3, 10, brl("130"), List.of(
                    line(1, "123456", null, "2026-10-01", "30"),
                    line(2, "Cinema", "Lazer", "2026-10-02", "100")));

            assertEquals(1, top.items().size());
            assertEquals("cinema", top.items().get(0).key());
            assertEquals(brl("130.00"), top.totalExpense());
        }

        @Test
        @DisplayName("ordena por total decrescente, empate pelo rotulo, e corta no limite")
        void sortAndLimit() {
            TopMerchants top = SpendingPatternRules.topMerchants(1, 2, brl("0"), List.of(
                    line(1, "Bar", null, "2026-10-01", "10"),
                    line(2, "Acougue", null, "2026-10-01", "50"),
                    line(3, "Zoo", null, "2026-10-01", "50"),
                    line(4, "Bar", null, "2026-10-02", "45")));

            assertEquals(2, top.items().size());
            assertEquals("Bar", top.items().get(0).label());
            assertEquals(brl("55.00"), top.items().get(0).total());
            assertEquals("Acougue", top.items().get(1).label());
            assertEquals(1, top.windowMonths());
            // Contado antes do corte: a tela mostra "2 de 3".
            assertEquals(3, top.totalMerchants());
        }

        @Test
        @DisplayName("totalMerchants ignora as descricoes sem nome")
        void totalMerchantsSkipsNameless() {
            TopMerchants top = SpendingPatternRules.topMerchants(3, 10, brl("0"), List.of(
                    line(1, "999", null, "2026-10-01", "10"),
                    line(2, "Cinema", null, "2026-10-01", "50")));
            assertEquals(1, top.totalMerchants());
        }
    }

    // =============================================================
    @Nested
    @DisplayName("ritmo do teto")
    class Pace {

        private BudgetPaceRow only(LocalDate today, String budget, String spent) {
            return only(today, budget, spent, "0");
        }

        private BudgetPaceRow only(LocalDate today, String budget, String spent, String fixed) {
            BudgetPace pace = SpendingPatternRules.budgetPace(today,
                    List.of(new BudgetSpend(1L, "Moradia", "#199e70", brl(budget), brl(spent), brl(fixed))));
            return pace.rows().get(0);
        }

        @Test
        @DisplayName("mes so com o fixo pago: projected = fixedSpent, nao o aluguel vezes tres")
        void fixedOnly() {
            // Aluguel + condominio no dia 10: antes projetava 2462 * 30 / 10 = 7386.
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 10), "2900", "2462", "2462");
            assertEquals(brl("2462.00"), row.fixedSpent());
            assertEquals(brl("2462.00"), row.projected());
            assertEquals(84.9, row.projectedPct());
            assertEquals(BudgetPaceStatus.OK, row.status());
        }

        @Test
        @DisplayName("misto: o fixo conta uma vez, so o variavel segue o ritmo")
        void mixed() {
            // 2462 fixo + 138 variavel em 10 dias: 2462 + 138 * 30 / 10 = 2876.
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 10), "2900", "2600", "2462");
            assertEquals(brl("2876.00"), row.projected());
            assertEquals(BudgetPaceStatus.OK, row.status());
            // 60 de variavel a mais ja passa o teto no ritmo atual: 2462 + 198 * 3 = 3056.
            BudgetPaceRow warn = only(LocalDate.of(2026, 11, 10), "2900", "2660", "2462");
            assertEquals(brl("3056.00"), warn.projected());
            assertEquals(BudgetPaceStatus.WARN, warn.status());
            assertEquals(105.38, warn.projectedPct());
        }

        @Test
        @DisplayName("dia 1: o variavel do dia vale o mes inteiro; o fixo, uma vez")
        void firstDay() {
            // 289 fixo (mensalidade) + 10 variavel no dia 1 de 30: 289 + 10 * 30 = 589.
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 1), "250", "299", "289");
            assertEquals(brl("589.00"), row.projected());
            assertEquals(BudgetPaceStatus.OVER, row.status());
            assertNull(row.dailyAllowance());
            BudgetPaceRow onlyFixed = only(LocalDate.of(2026, 11, 1), "400", "289", "289");
            assertEquals(brl("289.00"), onlyFixed.projected());
            assertEquals(BudgetPaceStatus.OK, onlyFixed.status());
        }

        @Test
        @DisplayName("fixedSpent usa as series que a recorrencia devolve, so no mes e ate hoje")
        void fixedSpentFromRecurring() {
            LocalDate today = LocalDate.of(2026, 11, 12);
            List<ExpenseLine> lines = new java.util.ArrayList<>();
            long id = 1;
            for (int month = 6; month <= 11; month++) {
                lines.add(new ExpenseLine(id++, "Aluguel", 1, "Conta", 4L, "Moradia", "#4",
                        LocalDate.of(2026, month, 10), brl("1850.00")));
                // Diarista no dia 28: em novembro ainda nao venceu (fica de fora).
                lines.add(new ExpenseLine(id++, "Diarista", 1, "Conta", 4L, "Moradia", "#4",
                        LocalDate.of(2026, month, 28), brl("220.00")));
            }
            // Variavel na mesma categoria: valores soltos, nao e serie.
            lines.add(new ExpenseLine(id++, "Lampada", 1, "Conta", 4L, "Moradia", "#4",
                    LocalDate.of(2026, 11, 3), brl("38.00")));
            // Serie em outra conta e o mesmo texto: outra serie, com so dois meses.
            lines.add(new ExpenseLine(id++, "Aluguel", 2, "Cartao", 4L, "Moradia", "#4",
                    LocalDate.of(2026, 11, 5), brl("1850.00")));
            lines.add(new ExpenseLine(id++, "Aluguel", 2, "Cartao", 4L, "Moradia", "#4",
                    LocalDate.of(2026, 10, 5), brl("1850.00")));

            RecurringExpenses recurring = AnalyticsRules.findRecurring(6, lines, today);
            assertEquals(List.of("1:aluguel", "1:diarista"),
                    recurring.items().stream().map(RecurringExpense::key).sorted().toList());

            Map<Long, BigDecimal> fixed = SpendingPatternRules.fixedSpentByCategory(lines, recurring, today);
            assertEquals(Map.of(4L, brl("1850.00")), fixed);
        }

        @Test
        @DisplayName("fixo maior que o gasto (somas divergentes) nao deixa o variavel negativo")
        void fixedCappedAtSpent() {
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 10), "1000", "100", "150");
            assertEquals(brl("100.00"), row.fixedSpent());
            assertEquals(brl("100.00"), row.projected());
        }

        @Test
        @DisplayName("dia 10 de 30, R$ 300 gastos: projeta R$ 900")
        void linearProjection() {
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 10), "1000", "300");
            assertEquals(brl("900.00"), row.projected());
            assertEquals(90.0, row.projectedPct());
            assertEquals(BudgetPaceStatus.OK, row.status());
            // 700 restantes / 21 dias (10 a 30, contando hoje)
            assertEquals(brl("33.33"), row.dailyAllowance());
        }

        @Test
        @DisplayName("WARN: ainda dentro do teto, mas o ritmo passa dele")
        void warn() {
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 10), "600", "300");
            assertEquals(BudgetPaceStatus.WARN, row.status());
            assertEquals(brl("900.00"), row.projected());
            assertEquals(150.0, row.projectedPct());
            assertEquals(brl("14.29"), row.dailyAllowance());
        }

        @Test
        @DisplayName("OVER: passou do teto; sem saldo diario")
        void over() {
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 1), "250", "289");
            assertEquals(BudgetPaceStatus.OVER, row.status());
            assertNull(row.dailyAllowance());
        }

        @Test
        @DisplayName("gasto igual ao teto nao e OVER: saldo diario zero")
        void exactlyAtBudget() {
            BudgetPaceRow row = only(LocalDate.of(2026, 11, 30), "500", "500");
            assertEquals(BudgetPaceStatus.OK, row.status());
            assertEquals(brl("500.00"), row.projected());
            assertEquals(brl("0.00"), row.dailyAllowance());
        }

        @Test
        @DisplayName("projecao exibida igual ao teto e OK: o status sai do valor arredondado")
        void roundedProjectionDecides() {
            // 193,55 / 30 * 31 = 200,0016... -> 200,00
            BudgetPaceRow row = only(LocalDate.of(2026, 10, 30), "200", "193.55");
            assertEquals(brl("200.00"), row.projected());
            assertEquals(BudgetPaceStatus.OK, row.status());
            assertEquals(100.0, row.projectedPct());
        }

        @Test
        @DisplayName("no ultimo dia ainda resta 1 dia; fevereiro tem 28")
        void lastDay() {
            BudgetPace pace = SpendingPatternRules.budgetPace(LocalDate.of(2026, 2, 28),
                    List.of(new BudgetSpend(1L, "Lazer", "#000000", brl("400"), brl("390"), BigDecimal.ZERO)));
            assertEquals(28, pace.throughDay());
            assertEquals(28, pace.daysInMonth());
            assertEquals("2026-02", pace.month());
            assertEquals(brl("10.00"), pace.rows().get(0).dailyAllowance());
            assertEquals(brl("390.00"), pace.rows().get(0).projected());
        }

        @Test
        @DisplayName("sem gasto: projecao zero, OK; teto zero ou nulo fica de fora; ordena por projectedPct")
        void sortingAndFiltering() {
            BudgetPace pace = SpendingPatternRules.budgetPace(LocalDate.of(2026, 11, 15), List.of(
                    new BudgetSpend(1L, "Lazer", "#1", brl("400"), BigDecimal.ZERO, BigDecimal.ZERO),
                    new BudgetSpend(2L, "Saude", "#2", brl("700"), brl("596.20"), BigDecimal.ZERO),
                    new BudgetSpend(3L, "Zerado", "#3", BigDecimal.ZERO, brl("10"), BigDecimal.ZERO),
                    new BudgetSpend(4L, "Nulo", "#4", null, brl("10"), BigDecimal.ZERO),
                    new BudgetSpend(5L, "Mercado", "#5", brl("1200"), brl("500"), BigDecimal.ZERO)));

            assertEquals(List.of("Saude", "Mercado", "Lazer"),
                    pace.rows().stream().map(BudgetPaceRow::categoryName).toList());
            BudgetPaceRow lazer = pace.rows().get(2);
            assertEquals(brl("0.00"), lazer.projected());
            assertEquals(0.0, lazer.projectedPct());
            assertEquals(BudgetPaceStatus.OK, lazer.status());
            assertEquals(BudgetPaceStatus.WARN, pace.rows().get(0).status());
        }
    }

    // =============================================================
    @Nested
    @DisplayName("portas de entrada")
    class Sources {

        @Test
        @DisplayName("todas as fontes, mesmo com zero, na ordem do enum")
        void allSources() {
            EntrySources sources = SpendingPatternRules.entrySources(3, List.of(
                    new SourceSum(TransactionSource.AGGREGATOR, 10, brl("1000")),
                    new SourceSum(TransactionSource.SHORTCUT, 3, brl("45.5"))), 0, 0);

            assertEquals(List.of(TransactionSource.values()),
                    sources.sources().stream().map(SourceShare::source).toList());
            SourceShare manual = sources.sources().get(0);
            assertEquals(TransactionSource.MANUAL, manual.source());
            assertEquals(0, manual.count());
            assertEquals(brl("0.00"), manual.total());
            assertEquals(brl("45.50"), sources.sources().get(1).total());
            assertEquals(3, sources.manualEntries());
            assertEquals(0.0, sources.confirmedPct());
        }

        @Test
        @DisplayName("manuais = MANUAL + SHORTCUT; porcentagem em 2 casas")
        void confirmedPct() {
            EntrySources sources = SpendingPatternRules.entrySources(3, List.of(
                    new SourceSum(TransactionSource.MANUAL, 1, brl("10")),
                    new SourceSum(TransactionSource.SHORTCUT, 2, brl("20")),
                    new SourceSum(TransactionSource.IMPORT, 5, brl("50"))), 1, 1);

            assertEquals(3, sources.manualEntries());
            assertEquals(1, sources.confirmedByBank());
            assertEquals(1, sources.pendingReview());
            assertEquals(33.33, sources.confirmedPct());
        }

        @Test
        @DisplayName("sem lancamento manual, a porcentagem e nula, nao zero")
        void noManual() {
            EntrySources sources = SpendingPatternRules.entrySources(1, List.of(
                    new SourceSum(TransactionSource.AGGREGATOR, 4, brl("40"))), 0, 0);
            assertEquals(0, sources.manualEntries());
            assertNull(sources.confirmedPct());
            assertTrue(sources.sources().stream().allMatch(share -> share.total().scale() == 2));
        }
    }
}
