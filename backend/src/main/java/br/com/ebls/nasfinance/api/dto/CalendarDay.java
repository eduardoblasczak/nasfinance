package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Gasto de um dia, para o calendario de calor. Dia sem gasto vem com zero:
 * a serie e continua.
 *
 * @param count quantas despesas no dia
 */
public record CalendarDay(
        LocalDate date,
        BigDecimal expense,
        long count) {
}
