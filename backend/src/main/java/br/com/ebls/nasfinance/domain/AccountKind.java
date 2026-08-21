package br.com.ebls.nasfinance.domain;

/**
 * Tipo de conta / origem do dinheiro.
 * <p>
 * Os nomes precisam bater exatamente com a constraint {@code ck_accounts_kind}
 * da migration V1: o banco e a ultima linha de defesa contra valor invalido.
 */
public enum AccountKind {

    /** Conta corrente. */
    CHECKING("Conta Corrente"),

    /** Poupanca. */
    SAVINGS("Poupanca"),

    /** Cartao de credito: gastos hoje, fatura depois. */
    CREDIT_CARD("Cartao de Credito"),

    /** Vale refeicao / alimentacao. */
    MEAL_VOUCHER("Vale Refeicao"),

    /** Dinheiro em especie. */
    CASH("Dinheiro"),

    /** Conta de investimento. */
    INVESTMENT("Investimento"),

    /** Qualquer outra origem. */
    OTHER("Outros");

    private final String label;

    AccountKind(String label) {
        this.label = label;
    }

    /** Nome amigavel para exibir na interface. */
    public String getLabel() {
        return label;
    }
}
