package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

import br.com.ebls.nasfinance.domain.Flow;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Payload de criacao/edicao de categoria. */
public record CategoryRequest(

        @NotBlank(message = "O nome da categoria e obrigatorio")
        @Size(max = 60, message = "O nome deve ter no maximo 60 caracteres")
        String name,

        @NotNull(message = "Informe se a categoria e de despesa (EXPENSE) ou receita (INCOME)")
        Flow flow,

        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "A cor deve estar no formato #RRGGBB")
        String color,

        @Size(max = 40)
        String icon,

        @DecimalMin(value = "0.00", message = "O orcamento mensal nao pode ser negativo")
        BigDecimal monthlyBudget) {

    public String colorOrDefault() {
        return color == null || color.isBlank() ? "#64748B" : color.toUpperCase();
    }
}
