package br.com.ebls.nasfinance.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * O registro central do sistema: uma entrada ou saida de dinheiro.
 * <p>
 * <b>Valor e sempre positivo.</b> Quem define o sinal e {@link #flow}.
 * <p>
 * <b>{@link BigDecimal}, nunca {@code double}.</b> Ponto flutuante binario nao
 * consegue representar 0.10 exatamente, e o erro se acumula em somatorios ate
 * aparecer diferenca de centavos no dashboard.
 */
@Entity
@Table(name = "transactions")
public class Transaction extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /**
     * FetchType.LAZY: sem isso, o Hibernate faria um JOIN (ou um SELECT extra)
     * para carregar a conta toda vez que uma transacao fosse lida, mesmo quando
     * so precisamos do valor. Como a listagem sempre converte para DTO,
     * carregamos a relacao so quando o DTO realmente usa.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    public Account account;

    /** Pode ser nula: transacao vinda de webhook chega sem categoria definida. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    public Category category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    public Flow flow;

    @Column(nullable = false, precision = 14, scale = 2)
    public BigDecimal amount;

    @Column(length = 200)
    public String description;

    /** Dia da compra. DATE em vez de TIMESTAMP, para nao ter bug de fuso. */
    @Column(name = "occurred_on", nullable = false)
    public LocalDate occurredOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    public TransactionSource source = TransactionSource.MANUAL;

    /** ID no sistema de origem; participa do indice unico de deduplicacao. */
    @Column(name = "external_id", length = 120)
    public String externalId;

    @Column(columnDefinition = "TEXT")
    public String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    public OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    public OffsetDateTime updatedAt;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    /** Valor com sinal aplicado: negativo para despesa, positivo para receita. */
    public BigDecimal signedAmount() {
        return flow == Flow.INCOME ? amount : amount.negate();
    }

    // ---------------------------------------------------------------
    // Consultas
    // ---------------------------------------------------------------

    /**
     * Listagem paginada com filtros opcionais.
     * <p>
     * A query e montada dinamicamente porque cada filtro e opcional. Usamos
     * parametros nomeados ({@link Parameters}) em vez de concatenar valores na
     * string: alem de evitar SQL injection, permite ao banco reaproveitar o
     * plano de execucao.
     */
    public static java.util.List<Transaction> search(LocalDate from,
                                                     LocalDate to,
                                                     Long accountId,
                                                     Long categoryId,
                                                     Flow flow,
                                                     int page,
                                                     int size) {
        StringBuilder query = new StringBuilder("1 = 1");
        Parameters params = new Parameters();

        if (from != null) {
            query.append(" AND occurredOn >= :from");
            params.and("from", from);
        }
        if (to != null) {
            query.append(" AND occurredOn <= :to");
            params.and("to", to);
        }
        if (accountId != null) {
            query.append(" AND account.id = :accountId");
            params.and("accountId", accountId);
        }
        if (categoryId != null) {
            query.append(" AND category.id = :categoryId");
            params.and("categoryId", categoryId);
        }
        if (flow != null) {
            query.append(" AND flow = :flow");
            params.and("flow", flow);
        }

        query.append(" ORDER BY occurredOn DESC, id DESC");

        return find(query.toString(), params)
                .page(Page.of(page, size))
                .list();
    }

    /** Total de registros que casam com os mesmos filtros, para paginar no frontend. */
    public static long countMatching(LocalDate from,
                                     LocalDate to,
                                     Long accountId,
                                     Long categoryId,
                                     Flow flow) {
        StringBuilder query = new StringBuilder("1 = 1");
        Parameters params = new Parameters();

        if (from != null) {
            query.append(" AND occurredOn >= :from");
            params.and("from", from);
        }
        if (to != null) {
            query.append(" AND occurredOn <= :to");
            params.and("to", to);
        }
        if (accountId != null) {
            query.append(" AND account.id = :accountId");
            params.and("accountId", accountId);
        }
        if (categoryId != null) {
            query.append(" AND category.id = :categoryId");
            params.and("categoryId", categoryId);
        }
        if (flow != null) {
            query.append(" AND flow = :flow");
            params.and("flow", flow);
        }

        return count(query.toString(), params);
    }

    /** Verifica se uma transacao externa ja foi importada (deduplicacao de webhook). */
    public static boolean existsExternal(TransactionSource source, String externalId) {
        return count("source = ?1 AND externalId = ?2", source, externalId) > 0;
    }
}
