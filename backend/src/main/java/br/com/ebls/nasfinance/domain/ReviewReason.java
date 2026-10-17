package br.com.ebls.nasfinance.domain;

/**
 * Por que um lancamento foi para a fila de revisao.
 * <p>
 * Os valores precisam bater com a constraint {@code ck_transactions_review_reason}
 * da migration V3.
 */
public enum ReviewReason {

    /**
     * Parece ser o mesmo gasto que ja foi lancado pelo Atalho ou a mao.
     * <p>
     * Suspeita levantada por: mesma conta, mesmo valor, data dentro de tres
     * dias. Nunca resolvida sozinha — ver {@code Transaction.duplicateOf}.
     */
    POSSIBLE_DUPLICATE,

    /**
     * Parece ser dinheiro indo de uma conta sua para outra conta sua,
     * tipicamente o pagamento da fatura do cartao.
     * <p>
     * O modelo ainda nao representa transferencia ({@code flow} e apenas
     * EXPENSE ou INCOME), entao o caso vai para revisao em vez de ser
     * adivinhado. Importado como despesa, duplicaria gastos que ja entraram
     * compra a compra; como receita, inventaria uma receita inexistente.
     */
    POSSIBLE_TRANSFER
}
