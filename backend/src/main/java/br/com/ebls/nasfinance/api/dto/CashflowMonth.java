package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

/**
 * Entradas e saidas de um mes.
 *
 * @param net     {@code income - expense}; pode ser negativo
 * @param partial mes corrente, ainda em andamento
 */
public record CashflowMonth(
        String month,
        BigDecimal income,
        BigDecimal expense,
        BigDecimal net,
        boolean partial) {
}
