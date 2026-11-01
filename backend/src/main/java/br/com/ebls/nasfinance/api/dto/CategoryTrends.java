package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Gasto por categoria no mes de referencia contra os meses anteriores.
 *
 * @param month              mes de referencia, {@code YYYY-MM}
 * @param throughDay         ultimo dia considerado (hoje, se for o mes corrente)
 * @param totalAverageToDate soma de {@code averageToDate} das linhas, para a
 *                           tabela fechar com o total exibido
 */
public record CategoryTrends(
        String month,
        int throughDay,
        int daysInMonth,
        int baselineMonths,
        BigDecimal totalCurrent,
        BigDecimal totalAverageToDate,
        List<CategoryTrendRow> rows) {
}
