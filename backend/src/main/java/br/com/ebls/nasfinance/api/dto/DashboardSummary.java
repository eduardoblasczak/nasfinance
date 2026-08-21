package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Tudo que o dashboard precisa, numa unica resposta.
 * <p>
 * Uma chamada so, em vez de cinco: cada requisicao extra custa uma ida ao
 * servidor atraves do Cloudflare Tunnel, e o NAS esta em WiFi. Agrupar reduz
 * a latencia percebida e simplifica o estado no frontend.
 *
 * @param comparisonPct variacao percentual da despesa em relacao ao periodo
 *                      anterior de mesmo tamanho; {@code null} quando o periodo
 *                      anterior nao teve gastos (divisao por zero)
 */
public record DashboardSummary(
        LocalDate periodStart,
        LocalDate periodEnd,
        BigDecimal totalExpense,
        BigDecimal totalIncome,
        BigDecimal balance,
        BigDecimal previousExpense,
        Double comparisonPct,
        long transactionCount,
        List<CategorySlice> expenseByCategory,
        List<AccountBalance> accountBalances,
        List<DailyPoint> dailySeries,
        List<TransactionDto> recentTransactions) {
}
