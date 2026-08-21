package br.com.ebls.nasfinance.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Classificacao de uma transacao (Mercado, Transporte, Salario...).
 * <p>
 * O par {@code (name, flow)} e unico: pode existir "Outros" de despesa e
 * "Outros" de receita ao mesmo tempo, mas nao duas categorias de despesa
 * com o mesmo nome.
 */
@Entity
@Table(name = "categories")
public class Category extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false, length = 60)
    public String name;

    /** Define se a categoria classifica despesas ou receitas. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    public Flow flow;

    /** Cor em hexadecimal (#RRGGBB), usada nos graficos do dashboard. */
    @Column(nullable = false, length = 7)
    public String color = "#64748B";

    /** Nome de icone do lucide-react, resolvido no frontend. */
    @Column(length = 40)
    public String icon;

    /** Teto mensal opcional; alimenta os alertas de orcamento. Null = sem limite. */
    @Column(name = "monthly_budget", precision = 14, scale = 2)
    public BigDecimal monthlyBudget;

    @Column(nullable = false)
    public boolean archived = false;

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

    /** Categorias ativas, opcionalmente filtradas por direcao do dinheiro. */
    public static List<Category> listActive(Flow flow) {
        if (flow == null) {
            return find("archived = false ORDER BY flow, name").list();
        }
        return find("archived = false AND flow = ?1 ORDER BY name", flow).list();
    }

    /**
     * Busca por nome dentro de uma direcao.
     * Usado pelo endpoint do Atalho, onde o iPhone manda o nome em texto.
     */
    public static Category findByName(String name, Flow flow) {
        return find("LOWER(name) = LOWER(?1) AND flow = ?2", name, flow).firstResult();
    }
}
