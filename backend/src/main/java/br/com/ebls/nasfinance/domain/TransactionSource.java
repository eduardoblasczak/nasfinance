package br.com.ebls.nasfinance.domain;

/**
 * Como a transacao entrou no sistema.
 * <p>
 * Serve para auditoria ("de onde veio esse lancamento?") e para deduplicacao:
 * o indice unico parcial {@code uq_transactions_source_external} usa
 * {@code (source, external_id)} para impedir que um reenvio de webhook
 * cadastre a mesma compra duas vezes.
 */
public enum TransactionSource {

    /** Cadastrado a mao pela interface web. */
    MANUAL,

    /** Recebido do Atalho do iPhone via API. */
    SHORTCUT,

    /** Importado de arquivo (CSV/OFX). */
    IMPORT,

    /** Recebido por webhook de agregador Open Finance. */
    AGGREGATOR
}
