package br.com.ebls.nasfinance.api.dto;

import java.util.List;

/**
 * Por onde as despesas entraram e quanto do que foi lancado a mao o banco
 * confirmou (regra em {@code AnalyticsService.sources}).
 *
 * @param sources         uma linha por {@link br.com.ebls.nasfinance.domain.TransactionSource},
 *                        mesmo com zero
 * @param manualEntries   despesas MANUAL + SHORTCUT da janela
 * @param confirmedByBank dessas, quantas tem uma transacao do banco ligada por
 *                        {@code duplicateOf}
 * @param pendingReview   dessas, quantas tem a suspeita ainda pendente na fila
 *                        (sao tambem contadas em {@code confirmedByBank})
 * @param confirmedPct    {@code confirmedByBank / manualEntries * 100};
 *                        {@code null} sem lancamento manual
 */
public record EntrySources(
        int windowMonths,
        List<SourceShare> sources,
        long manualEntries,
        long confirmedByBank,
        long pendingReview,
        Double confirmedPct) {
}
