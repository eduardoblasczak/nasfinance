package br.com.ebls.nasfinance.domain;

/**
 * Se um lancamento aguarda decisao humana.
 * <p>
 * Os valores precisam bater com a constraint {@code ck_transactions_review_status}
 * da migration V3 — o banco e a ultima linha de defesa contra valor invalido.
 */
public enum ReviewStatus {

    /** Nada a decidir. E o estado de quase toda linha da tabela. */
    NONE,

    /** Aguarda que o usuario confirme, funda ou descarte. */
    PENDING,

    /**
     * O usuario olhou e decidiu manter como esta.
     * <p>
     * Distinto de {@link #NONE} de proposito: "ninguem precisou olhar" e
     * "alguem olhou e disse que esta certo" sao fatos diferentes, e so o
     * segundo impede que a proxima sincronizacao levante a mesma suspeita de
     * novo.
     */
    DISMISSED,

    /**
     * A linha existe apenas para segurar a chave de deduplicacao; nao entra em
     * nenhum total.
     * <p>
     * <b>Por que nao simplesmente apagar.</b> A chave natural que impede a
     * reimportacao vive neste registro. Apagado, a sincronizacao da noite
     * seguinte — que relê uma janela de 90 dias — traria o mesmo lancamento de
     * volta, e a exclusao duraria 24 horas.
     * <p>
     * O caso que motivou: o pagamento da fatura do cartao visto na conta
     * corrente. Nao e despesa, porque as compras ja entraram uma a uma, mas
     * tambem nao pode sumir.
     */
    IGNORED
}
