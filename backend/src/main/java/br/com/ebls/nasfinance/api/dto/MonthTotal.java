package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

/**
 * Total de um mes numa serie mensal.
 *
 * @param month mes em {@code YYYY-MM}; texto, e nao {@code YearMonth}, para o
 *              formato no JSON nao depender da configuracao do Jackson
 */
public record MonthTotal(String month, BigDecimal total) {
}
