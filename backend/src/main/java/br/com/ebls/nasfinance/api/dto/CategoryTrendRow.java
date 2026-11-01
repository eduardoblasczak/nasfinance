package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Uma categoria no mes de referencia contra a media dos meses anteriores.
 *
 * @param current          gasto no mes de referencia ate {@code throughDay}
 * @param averageToDate    media dos meses de base, cada um contado so do dia 1
 *                         a {@code throughDay} (limitado ao tamanho do mes)
 * @param averageFullMonth media dos meses de base inteiros
 * @param deltaPct         variacao de {@code current} sobre
 *                         {@code averageToDate}; {@code null} sem base
 * @param monthly          meses de base, do mais antigo ao mais novo (inteiros),
 *                         seguidos do mes de referencia (ate {@code throughDay})
 */
public record CategoryTrendRow(
        Long categoryId,
        String categoryName,
        String color,
        String icon,
        BigDecimal current,
        BigDecimal averageToDate,
        BigDecimal averageFullMonth,
        Double deltaPct,
        List<MonthTotal> monthly) {
}
