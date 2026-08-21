package br.com.ebls.nasfinance.domain;

/**
 * Direcao do dinheiro.
 * <p>
 * O valor da transacao ({@code amount}) e sempre positivo; e este enum que
 * define se ele soma ou subtrai do saldo. Guardar o sinal separado do valor
 * evita a ambiguidade de "despesa negativa" e deixa as agregacoes explicitas.
 */
public enum Flow {

    /** Saida de dinheiro. */
    EXPENSE,

    /** Entrada de dinheiro. */
    INCOME;

    /**
     * Multiplicador para calculo de saldo: receita soma, despesa subtrai.
     *
     * @return {@code 1} para INCOME, {@code -1} para EXPENSE
     */
    public int signal() {
        return this == INCOME ? 1 : -1;
    }
}
