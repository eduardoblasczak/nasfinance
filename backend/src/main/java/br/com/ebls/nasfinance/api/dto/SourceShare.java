package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

import br.com.ebls.nasfinance.domain.TransactionSource;

/** Despesas de uma porta de entrada na janela. */
public record SourceShare(
        TransactionSource source,
        long count,
        BigDecimal total) {
}
