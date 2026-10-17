package br.com.ebls.nasfinance.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Uma execucao da sincronizacao com a Pluggy.
 * <p>
 * <b>Por que isto existe.</b> Um job noturno que parou de rodar e o tipo de
 * falha que passa meses sem ser notada — exatamente a licao do backup, que so
 * virou backup de verdade quando ganhou log, codigo de saida e restauracao
 * testada. Com esta tabela, "a sincronizacao rodou essa noite?" se responde
 * com um SELECT, e nao garimpando log de container que ja girou.
 */
@Entity
@Table(name = "pluggy_sync_runs")
public class PluggySyncRun extends PanacheEntityBase {

    /** Resultado da execucao. {@code SKIPPED} nao e erro. */
    public enum Status {
        /** Em andamento; se ficar assim, a aplicacao morreu no meio. */
        RUNNING,
        /** Terminou e processou dados. */
        SUCCESS,
        /** O item nao foi atualizado desde a ultima execucao — nada a fazer. */
        SKIPPED,
        /** Terminou com erro; a mensagem fica em {@link #error}. */
        FAILED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "started_at", nullable = false)
    public OffsetDateTime startedAt;

    @Column(name = "finished_at")
    public OffsetDateTime finishedAt;

    /**
     * {@code lastUpdatedAt} do item no momento da execucao.
     * <p>
     * E o que permite pular trabalho: se nao mudou desde a ultima execucao bem
     * sucedida, a Pluggy nao coletou nada novo. Como o plano pessoal atualiza
     * a cada 24h e o job roda diariamente, essa comparacao evita reprocessar o
     * mesmo conjunto quando os dois horarios desencontram.
     */
    @Column(name = "item_last_updated_at")
    public OffsetDateTime itemLastUpdatedAt;

    @Column(name = "window_from")
    public LocalDate windowFrom;

    @Column(name = "window_to")
    public LocalDate windowTo;

    /** Lancamentos efetivamente criados. */
    @Column(nullable = false)
    public int imported = 0;

    /** Descartados: abaixo do valor minimo, antes da data de corte, ou pagamento de fatura. */
    @Column(nullable = false)
    public int skipped = 0;

    /** Criados, mas marcados para revisao humana. */
    @Column(nullable = false)
    public int flagged = 0;

    @Column(nullable = false, length = 20)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    public Status status = Status.RUNNING;

    @Column(columnDefinition = "TEXT")
    public String error;

    // ---------------------------------------------------------------
    // Consultas
    // ---------------------------------------------------------------

    /**
     * A ultima execucao que chegou ao fim sem erro.
     * <p>
     * Inclui {@code SKIPPED} de proposito: "nao havia nada novo" tambem e uma
     * leitura valida do estado do item, e e dela que sai o {@code
     * itemLastUpdatedAt} com que a proxima execucao vai comparar.
     */
    public static PluggySyncRun lastSuccessful() {
        return find("status in (?1, ?2) ORDER BY startedAt DESC",
                Status.SUCCESS, Status.SKIPPED).firstResult();
    }

    /**
     * A ultima execucao, tenha ela terminado como tiver.
     * <p>
     * Diferente de {@link #lastSuccessful()}: a tela de status precisa mostrar
     * justamente a falha, se houve uma. Esconder o erro e mostrar o ultimo
     * sucesso daria a impressao de que esta tudo bem.
     */
    public static PluggySyncRun last() {
        return find("ORDER BY startedAt DESC").firstResult();
    }

    public static List<PluggySyncRun> recent(int limit) {
        return find("ORDER BY startedAt DESC").page(0, limit).list();
    }
}
