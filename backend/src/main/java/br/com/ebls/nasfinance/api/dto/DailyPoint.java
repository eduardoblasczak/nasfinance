package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Um ponto da serie temporal diaria do dashboard.
 *
 * @param cumulativeExpense despesa acumulada do inicio do periodo ate este dia,
 *                          usada para a linha de evolucao do gasto no mes
 */
public record DailyPoint(
        LocalDate date,
        BigDecimal expense,
        BigDecimal income,
        BigDecimal cumulativeExpense) {
}
