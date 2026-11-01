package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

/**
 * Uma categoria com teto no mes corrente e para onde o ritmo atual a leva.
 *
 * @param fixedSpent     parte de {@code spent} que veio de cobrancas fixas
 *                       (as series da recorrencia) ja pagas no mes
 * @param projected      {@code fixedSpent + (spent - fixedSpent) / throughDay
 *                       * daysInMonth}: so o variavel segue o ritmo
 * @param projectedPct   {@code projected / budget * 100}
 * @param dailyAllowance {@code (budget - spent) / dias que faltam}, contando
 *                       hoje; {@code null} se ja estourou
 */
public record BudgetPaceRow(
        Long categoryId,
        String categoryName,
        String color,
        BigDecimal budget,
        BigDecimal spent,
        BigDecimal fixedSpent,
        BigDecimal projected,
        Double projectedPct,
        BudgetPaceStatus status,
        BigDecimal dailyAllowance) {
}
