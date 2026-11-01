package br.com.ebls.nasfinance.api.dto;

import java.util.List;

/** Ritmo de gasto das categorias com teto, sempre no mes corrente. */
public record BudgetPace(
        String month,
        int throughDay,
        int daysInMonth,
        List<BudgetPaceRow> rows) {
}
