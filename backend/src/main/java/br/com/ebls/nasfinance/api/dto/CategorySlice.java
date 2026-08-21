package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

/**
 * Uma fatia do grafico de gastos por categoria.
 *
 * @param budget         teto mensal da categoria, ou {@code null} se nao houver
 * @param budgetUsedPct  percentual do orcamento consumido, ou {@code null} sem teto
 */
public record CategorySlice(
        Long categoryId,
        String categoryName,
        String color,
        String icon,
        BigDecimal total,
        BigDecimal budget,
        Double budgetUsedPct,
        long transactionCount) {
}
