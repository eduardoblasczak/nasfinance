package br.com.ebls.nasfinance.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Pedido para vincular uma conta da Pluggy a uma conta daqui. */
public record PluggyLinkRequest(

        @NotBlank(message = "O id da conta na Pluggy e obrigatorio")
        @Size(max = 64)
        String pluggyAccountId,

        @NotNull(message = "Escolha a conta local correspondente")
        Long accountId) {
}
