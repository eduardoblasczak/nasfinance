package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

import br.com.ebls.nasfinance.domain.AccountKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Payload de criacao/edicao de conta.
 * <p>
 * As anotacoes de validacao rodam automaticamente por causa do {@code @Valid}
 * no metodo do resource; se algo falhar, o Quarkus devolve 400 com a lista de
 * violacoes, sem o codigo precisar checar nada.
 */
public record AccountRequest(

        @NotBlank(message = "O nome da conta e obrigatorio")
        @Size(max = 80, message = "O nome deve ter no maximo 80 caracteres")
        String name,

        @NotNull(message = "O tipo da conta e obrigatorio")
        AccountKind kind,

        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "A cor deve estar no formato #RRGGBB")
        String color,

        BigDecimal openingBalance) {

    /** Cor padrao quando o cliente nao informa nenhuma. */
    public String colorOrDefault() {
        return color == null || color.isBlank() ? "#64748B" : color.toUpperCase();
    }

    /** Saldo inicial padrao zero quando omitido. */
    public BigDecimal openingBalanceOrZero() {
        return openingBalance == null ? BigDecimal.ZERO : openingBalance;
    }
}
