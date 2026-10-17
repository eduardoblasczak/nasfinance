package br.com.ebls.nasfinance.domain;

import java.time.OffsetDateTime;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Liga uma conta da Pluggy a uma conta daqui.
 * <p>
 * Sem este vinculo a sincronizacao nao tem onde gravar: a Pluggy devolve
 * {@code "PICPAY INSTITUICAO DE PAGAMENTO S.A"}, e so o dono sabe que aquilo e
 * a "Conta Corrente" dele.
 * <p>
 * <b>Por que explicito e nao adivinhado.</b> Seria tentador casar por tipo
 * ({@code BANK} para {@code CHECKING}, {@code CREDIT} para
 * {@code CREDIT_CARD}), e funcionaria hoje, com duas contas. Quebraria no dia
 * em que houvesse duas correntes — e quebraria em silencio, colocando
 * lancamentos na conta errada sem nenhum erro aparente. Um cadastro a mais na
 * tela de configuracao custa menos que esse tipo de bug.
 */
@Entity
@Table(name = "pluggy_account_links")
public class PluggyAccountLink extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** UUID da conta no lado da Pluggy. */
    @Column(name = "pluggy_account_id", nullable = false, unique = true, length = 64)
    public String pluggyAccountId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    public Account account;

    /**
     * Nome e tipo copiados no momento do vinculo.
     * <p>
     * Redundantes em relacao a API, de proposito: a tela de configuracao
     * precisa mostrar "qual conta da Pluggy e esta?" sem depender de uma
     * chamada externa a cada carregamento — que seria lenta, poderia falhar, e
     * deixaria a tela inutil quando a Pluggy estivesse fora do ar.
     */
    @Column(name = "pluggy_name", nullable = false, length = 160)
    public String pluggyName;

    /** {@code BANK} ou {@code CREDIT}. Decide o tratamento de pagamento de fatura. */
    @Column(name = "pluggy_type", nullable = false, length = 20)
    public String pluggyType;

    @Column(name = "created_at", nullable = false, updatable = false)
    public OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }

    // ---------------------------------------------------------------
    // Consultas
    // ---------------------------------------------------------------

    public static List<PluggyAccountLink> listAllOrdered() {
        return find("ORDER BY pluggyName").list();
    }

    public static PluggyAccountLink findByPluggyAccountId(String pluggyAccountId) {
        return find("pluggyAccountId", pluggyAccountId).firstResult();
    }

    /** True quando a conta da Pluggy ja aponta para alguma conta local. */
    public static boolean isLinked(String pluggyAccountId) {
        return count("pluggyAccountId", pluggyAccountId) > 0;
    }
}
