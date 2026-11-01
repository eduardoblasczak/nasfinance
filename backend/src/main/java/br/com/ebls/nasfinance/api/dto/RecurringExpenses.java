package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Cobrancas recorrentes encontradas na janela.
 *
 * @param monthlyTotal soma de {@code averageAmount} de todos os itens: o custo
 *                     fixo mensal estimado
 */
public record RecurringExpenses(
        int windowMonths,
        BigDecimal monthlyTotal,
        List<RecurringExpense> items) {
}
