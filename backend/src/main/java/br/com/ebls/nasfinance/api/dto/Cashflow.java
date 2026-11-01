package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Fluxo de caixa mensal, do mes mais antigo ao corrente.
 *
 * @param averageNet media de {@code net} so dos meses fechados; {@code null}
 *                   se nao houver nenhum. O mes parcial puxaria a media para
 *                   baixo todo inicio de mes, quando ainda nao entrou salario.
 */
public record Cashflow(
        List<CashflowMonth> months,
        BigDecimal totalIncome,
        BigDecimal totalExpense,
        BigDecimal totalNet,
        BigDecimal averageNet) {
}
