package br.com.ebls.nasfinance.pluggy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * O pedaco da API da Pluggy que a gente consome.
 * <p>
 * <b>Tudo e {@code @JsonIgnoreProperties(ignoreUnknown = true)}.</b> A resposta
 * traz dezenas de campos que nao usamos, e a Pluggy acrescenta outros sem
 * aviso. Sem isso, um campo novo do lado deles derrubaria a sincronizacao aqui
 * — um acoplamento que nao faz sentido nenhum.
 * <p>
 * <b>Fonte da verdade: o OpenAPI</b> em {@code /openapi/pluggy-api.json}, nao a
 * documentacao em prosa. O guia "Personal use" ainda ensina
 * {@code GET /transactions}, que hoje responde {@code 410 ENDPOINT_DEPRECATED}.
 */
public final class PluggyModels {

    private PluggyModels() {
    }

    /** Resposta de {@code POST /auth}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AuthResponse(String apiKey) {
    }

    /** Resposta de {@code GET /items/{id}}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Item(
            String id,
            /** {@code UPDATED}, {@code LOGIN_ERROR}, {@code OUTDATED}, ... */
            String status,
            String executionStatus,
            /**
             * Quando a Pluggy coletou dados pela ultima vez. E o que permite
             * pular trabalho: se nao mudou desde a ultima execucao, nao ha
             * nada novo para importar.
             */
            OffsetDateTime lastUpdatedAt,
            Connector connector) {

        /** Pronto para ser lido: a ultima coleta terminou bem. */
        public boolean isUsable() {
            return "UPDATED".equals(status);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Connector(Long id, String name, Boolean isOpenFinance) {
    }

    /** Resposta de {@code GET /accounts?itemId=}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AccountPage(List<Account> results) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Account(
            String id,
            /** {@code BANK} ou {@code CREDIT}. */
            String type,
            /** {@code CHECKING_ACCOUNT}, {@code CREDIT_CARD}, ... */
            String subtype,
            String name,
            BigDecimal balance,
            String currencyCode) {
    }

    /**
     * Resposta de {@code GET /v2/transactions}.
     * <p>
     * {@code next} ja vem como query string pronta — a documentacao manda
     * concatenar em {@code /v2/transactions{next}} exatamente como esta, sem
     * remontar nada. Nulo quando acabou.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TransactionPage(List<Transaction> results, String next) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Transaction(
            String id,
            String accountId,

            /**
             * Data no formato ISO, em UTC. Precisa ser convertida para o fuso
             * local antes de virar {@code occurred_on}: uma compra das 22h em
             * Brasilia chega aqui com a data do dia seguinte, e sem converter
             * ela cai no dia errado — no fim do mes, no mes errado.
             */
            OffsetDateTime date,

            String description,
            String descriptionRaw,

            /**
             * <b>Nunca use o sinal deste campo.</b> Ele significa coisas
             * opostas conforme o tipo da conta: em conta corrente, negativo e
             * saida; em cartao de credito, positivo e despesa. Quem diz a
             * direcao e {@link #type}.
             */
            BigDecimal amount,

            String currencyCode,

            /** {@code DEBIT} (sai) ou {@code CREDIT} (entra). Consistente nos dois tipos de conta. */
            String type,

            /** {@code POSTED} ou {@code PENDING} (fatura aberta / parcela futura). */
            String status,

            /** Classificacao da propria Pluggy. Usada como sugestao, nunca aplicada direto. */
            String category,

            /**
             * Para conta: {@code PIX}, {@code TED}, {@code BOLETO}, ...
             * Para cartao: {@code PAGAMENTO_FATURA}, {@code ESTORNO}, ...
             */
            String operationType,

            /**
             * Posicao entre transacoes identicas do mesmo dia.
             * <p>
             * Peca essencial da chave natural: {@code (data, valor, descricao)}
             * sozinho nao e unico — foram encontrados 4 grupos repetidos na
             * conta corrente real.
             */
            Integer order,

            /** So vem preenchido em conector Open Finance. No MeuPluggy e sempre nulo. */
            String providerId,

            CreditCardMetadata creditCardMetadata) {

        public boolean isDebit() {
            return "DEBIT".equalsIgnoreCase(type);
        }

        /** Pagamento da fatura: transferencia entre contas proprias, nao receita. */
        public boolean isBillPayment() {
            return "PAGAMENTO_FATURA".equalsIgnoreCase(operationType);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreditCardMetadata(
            Integer installmentNumber,
            Integer totalInstallments,
            BigDecimal totalAmount,
            String billId) {
    }
}
