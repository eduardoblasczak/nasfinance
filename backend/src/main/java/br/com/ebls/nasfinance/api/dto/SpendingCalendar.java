package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Despesas por dia, do dia 1 do mes mais antigo da janela ate hoje.
 *
 * @param maxExpense maior gasto diario da janela (zero se nao houve gasto);
 *                   base da escala de cor
 */
public record SpendingCalendar(
        LocalDate from,
        LocalDate to,
        List<CalendarDay> days,
        BigDecimal maxExpense) {
}
