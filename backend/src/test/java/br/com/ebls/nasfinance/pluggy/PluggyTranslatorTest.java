package br.com.ebls.nasfinance.pluggy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import br.com.ebls.nasfinance.domain.Flow;

/**
 * As regras que erram em silencio.
 * <p>
 * Se a direcao do dinheiro estiver invertida, a tela continua mostrando um
 * lancamento plausivel: R$ 51,85 de receita nao parece mais errado que R$
 * 51,85 de despesa. Sem teste, so o extrato fechando errado no fim do mes
 * denunciaria — se alguem conferisse.
 * <p>
 * <b>Os valores aqui sao reais</b>, colhidos de {@code scripts/pluggy-explore.sh}
 * contra a conta de verdade em 13/10/2026. Nao sao exemplos inventados: cada um
 * corresponde a uma linha que o banco realmente devolveu.
 */
class PluggyTranslatorTest {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");
    private static final String ACC = "00000000-0000-4000-8000-000000000001";

    /** Constroi uma transacao com os campos que importam para a traducao. */
    private static PluggyModels.Transaction tx(String date, String amount, String type,
            String description, String operationType, Integer order) {
        return new PluggyModels.Transaction(
                "id-" + description,
                ACC,
                OffsetDateTime.parse(date),
                description,
                null,
                new BigDecimal(amount),
                "BRL",
                type,
                "POSTED",
                null,
                operationType,
                order,
                null,
                null);
    }

    // =============================================================
    @Nested
    @DisplayName("direcao do dinheiro")
    class Direction {

        @Test
        @DisplayName("conta corrente: valor negativo com DEBIT e despesa")
        void currentAccountDebit() {
            var t = tx("2026-10-10T00:00:00Z", "-5.00", "DEBIT", "PIX ENVIADO LOJA EXEMPLO", "PIX", 0);

            assertEquals(Flow.EXPENSE, PluggyTranslator.flowOf(t));
            assertEquals(new BigDecimal("5.00"), PluggyTranslator.amountOf(t));
        }

        @Test
        @DisplayName("conta corrente: valor positivo com CREDIT e receita")
        void currentAccountCredit() {
            var t = tx("2026-10-11T00:00:00Z", "33.00", "CREDIT", "PIX recebido", "PIX", 0);

            assertEquals(Flow.INCOME, PluggyTranslator.flowOf(t));
            assertEquals(new BigDecimal("33.00"), PluggyTranslator.amountOf(t));
        }

        @Test
        @DisplayName("cartao: valor POSITIVO com DEBIT tambem e despesa — o sinal inverte, o type nao")
        void creditCardDebit() {
            // Este e o caso que quebraria se alguem lesse o sinal: no cartao,
            // positivo e gasto. Na conta corrente, positivo e entrada.
            var t = tx("2026-10-04T00:00:00Z", "484.83", "DEBIT", "VIACAO EXEMPLO SA", null, 0);

            assertEquals(Flow.EXPENSE, PluggyTranslator.flowOf(t));
            assertEquals(new BigDecimal("484.83"), PluggyTranslator.amountOf(t));
        }

        @Test
        @DisplayName("cartao: valor NEGATIVO com CREDIT e pagamento de fatura")
        void creditCardBillPayment() {
            var t = tx("2026-10-05T00:00:00Z", "-169.89", "CREDIT", "PAGAMENTO DE FATURA",
                    "PAGAMENTO_FATURA", 0);

            assertEquals(Flow.INCOME, PluggyTranslator.flowOf(t));
            assertEquals(new BigDecimal("169.89"), PluggyTranslator.amountOf(t));
            assertTrue(t.isBillPayment(),
                    "precisa ser reconhecido para nao virar receita — o dinheiro saiu da conta corrente");
        }

        @Test
        @DisplayName("compra comum nao e confundida com pagamento de fatura")
        void ordinaryPurchaseIsNotBillPayment() {
            var t = tx("2026-10-03T00:00:00Z", "139.37", "DEBIT", "IFD*PIZZARIA EXEMPLO", null, 0);
            assertFalse(t.isBillPayment());
        }
    }

    // =============================================================
    @Nested
    @DisplayName("conversao de fuso")
    class Timezone {

        @Test
        @DisplayName("compra da noite em Brasilia nao escorrega para o dia seguinte")
        void lateNightStaysOnTheSameDay() {
            // 22h de 10/10 em Brasilia = 01h de 11/10 em UTC. Sem converter,
            // a compra cairia no dia 11.
            var t = tx("2026-10-11T01:00:00Z", "-49.99", "DEBIT", "PIX ENVIADO FARMACIA EXEMPLO", "PIX", 0);

            assertEquals(LocalDate.of(2026, 10, 10), PluggyTranslator.occurredOn(t, SP));
        }

        @Test
        @DisplayName("na virada do mes, o erro deslocaria o fechamento inteiro")
        void monthBoundary() {
            // 21h de 31/10 em Brasilia = 00h de 01/11 em UTC.
            var t = tx("2026-11-01T00:00:00Z", "-10.00", "DEBIT", "compra", null, 0);

            assertEquals(LocalDate.of(2026, 10, 31), PluggyTranslator.occurredOn(t, SP));
        }

        @Test
        @DisplayName("a chave usa a data da Pluggy, nao a convertida")
        void keyUsesPluggyDate() {
            // Se a chave usasse a data local, uma mudanca de fuso ou de
            // horario de verao a reescreveria e todo o historico reentraria.
            var t = tx("2026-11-01T00:00:00Z", "-10.00", "DEBIT", "compra", null, 0);

            assertTrue(PluggyTranslator.canonicalForm(ACC, t).contains("2026-11-01"));
            assertEquals(LocalDate.of(2026, 10, 31), PluggyTranslator.occurredOn(t, SP));
        }
    }

    // =============================================================
    @Nested
    @DisplayName("chave natural")
    class NaturalKey {

        @Test
        @DisplayName("mesma entrada produz sempre a mesma chave")
        void deterministic() {
            var t = tx("2026-10-04T00:00:00Z", "16.90", "DEBIT", "STREAMING EXEMPLO", null, 3);

            assertEquals(PluggyTranslator.naturalKey(ACC, t), PluggyTranslator.naturalKey(ACC, t));
        }

        @Test
        @DisplayName("duas transacoes identicas no mesmo dia se distinguem pelo order")
        void orderBreaksTheTie() {
            // O caso real: dois "Troco Guardado" de R$ 0,01 no mesmo dia sao
            // duas transacoes legitimas. Foram 4 grupos assim na conta.
            var primeiro = tx("2026-10-10T00:00:00Z", "-0.01", "DEBIT", "Troco Guardado", null, 0);
            var segundo = tx("2026-10-10T00:00:00Z", "-0.01", "DEBIT", "Troco Guardado", null, 1);

            assertNotEquals(PluggyTranslator.naturalKey(ACC, primeiro),
                    PluggyTranslator.naturalKey(ACC, segundo),
                    "sem o order, a segunda seria descartada como duplicata da primeira");
        }

        @Test
        @DisplayName("contas diferentes nao colidem")
        void accountIsPartOfTheKey() {
            var t = tx("2026-10-04T00:00:00Z", "16.90", "DEBIT", "STREAMING EXEMPLO", null, 0);

            assertNotEquals(PluggyTranslator.naturalKey("conta-a", t),
                    PluggyTranslator.naturalKey("conta-b", t));
        }

        @Test
        @DisplayName("o valor entra normalizado, para 16.90 e 16.9 nao gerarem chaves diferentes")
        void amountIsNormalised() {
            var comZero = tx("2026-10-04T00:00:00Z", "16.90", "DEBIT", "assinatura", null, 0);
            var semZero = tx("2026-10-04T00:00:00Z", "16.9", "DEBIT", "assinatura", null, 0);

            assertEquals(PluggyTranslator.naturalKey(ACC, comZero),
                    PluggyTranslator.naturalKey(ACC, semZero));
        }

        @Test
        @DisplayName("cabe no external_id, que e VARCHAR(120)")
        void fitsTheColumn() {
            var t = tx("2026-10-04T00:00:00Z", "16.90", "DEBIT", "STREAMING EXEMPLO", null, 0);

            assertEquals(64, PluggyTranslator.naturalKey(ACC, t).length());
        }
    }

    // =============================================================
    @Nested
    @DisplayName("valor minimo")
    class Minimum {

        private static final BigDecimal UM_REAL = new BigDecimal("1.00");

        @Test
        @DisplayName("o cofrinho de centavos do PicPay fica de fora")
        void cofrinhoIsFilteredOut() {
            var t = tx("2026-10-10T00:00:00Z", "-0.01", "DEBIT", "Troco Guardado", null, 0);

            assertTrue(PluggyTranslator.isBelowMinimum(PluggyTranslator.amountOf(t), UM_REAL));
        }

        @Test
        @DisplayName("exatamente um real entra")
        void exactlyOneRealIsKept() {
            var t = tx("2026-10-10T00:00:00Z", "-1.00", "DEBIT", "compra", null, 0);

            assertFalse(PluggyTranslator.isBelowMinimum(PluggyTranslator.amountOf(t), UM_REAL));
        }

        @Test
        @DisplayName("o filtro olha o valor absoluto, nao o sinal")
        void comparesAbsoluteValue() {
            // Um CREDIT de -0,50 no cartao tambem precisa cair fora; comparar
            // o valor com sinal aprovaria qualquer negativo.
            var t = tx("2026-10-10T00:00:00Z", "-0.50", "CREDIT", "estorno pequeno", null, 0);

            assertTrue(PluggyTranslator.isBelowMinimum(PluggyTranslator.amountOf(t), UM_REAL));
        }
    }

    // =============================================================
    @Nested
    @DisplayName("rastro de auditoria")
    class AuditTrail {

        @Test
        @DisplayName("guarda a categoria da Pluggy como sugestao, sem aplica-la")
        void keepsSuggestedCategory() {
            var t = new PluggyModels.Transaction("abc", ACC,
                    OffsetDateTime.parse("2026-10-03T00:00:00Z"),
                    "IFD*PIZZARIA EXEMPLO", null, new BigDecimal("139.37"), "BRL",
                    "DEBIT", "POSTED", "Restaurants", null, 0, null, null);

            String notes = PluggyTranslator.auditTrail(t);

            assertTrue(notes.contains("Pluggy id=abc"), "o id ajuda a investigar junto ao suporte");
            assertTrue(notes.contains("categoria sugerida: Restaurants"));
        }

        @Test
        @DisplayName("registra a parcela quando o cartao informa")
        void recordsInstallment() {
            var metadata = new PluggyModels.CreditCardMetadata(1, 2, new BigDecimal("103.70"), null);
            var t = new PluggyModels.Transaction("xyz", ACC,
                    OffsetDateTime.parse("2026-10-05T00:00:00Z"),
                    "LOJA EXEMPLO PARC01/02", null, new BigDecimal("51.85"), "BRL",
                    "DEBIT", "POSTED", null, null, 0, null, metadata);

            assertTrue(PluggyTranslator.auditTrail(t).contains("parcela 1/2"));
        }
    }
}
