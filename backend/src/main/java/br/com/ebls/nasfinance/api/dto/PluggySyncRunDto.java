package br.com.ebls.nasfinance.api.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import br.com.ebls.nasfinance.domain.PluggySyncRun;

/**
 * Resultado de uma execucao da sincronizacao.
 *
 * @param status   {@code SUCCESS}, {@code SKIPPED} ou {@code FAILED}
 * @param imported lancamentos criados
 * @param skipped  descartados: abaixo do valor minimo, antes da data de corte,
 *                 pagamento de fatura, ou ja existentes
 * @param flagged  criados, mas aguardando revisao
 */
public record PluggySyncRunDto(
        Long id,
        OffsetDateTime startedAt,
        OffsetDateTime finishedAt,
        String status,
        String error,
        int imported,
        int skipped,
        int flagged,
        LocalDate windowFrom,
        LocalDate windowTo) {

    public static PluggySyncRunDto from(PluggySyncRun run) {
        return new PluggySyncRunDto(
                run.id,
                run.startedAt,
                run.finishedAt,
                run.status.name(),
                run.error,
                run.imported,
                run.skipped,
                run.flagged,
                run.windowFrom,
                run.windowTo);
    }
}
