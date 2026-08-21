package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import br.com.ebls.nasfinance.domain.Flow;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload do lancamento rapido, vindo do Atalho do iPhone.
 * <p>
 * <b>Diferenca fundamental para {@link TransactionRequest}:</b> aqui conta e
 * categoria vem por <b>nome</b>, nao por id. Isso e deliberado — montar um
 * Atalho no iOS que envia {@code "Mercado"} a partir de um menu de escolha e
 * trivial; montar um que envia {@code categoryId: 7} exigiria manter os ids
 * sincronizados na mao dentro do Atalho, e qualquer recadastro de categoria
 * quebraria tudo silenciosamente.
 * <p>
 * Exemplo de corpo enviado pelo Atalho:
 * <pre>{@code
 * {
 *   "amount": 45.90,
 *   "category": "Mercado",
 *   "account": "Vale Refeicao",
 *   "description": "Compra da semana"
 * }
 * }</pre>
 */
public record QuickEntryRequest(

        @NotNull(message = "O valor e obrigatorio")
        @DecimalMin(value = "0.01", message = "O valor deve ser maior que zero")
        @Digits(integer = 12, fraction = 2, message = "Valor invalido: maximo 2 casas decimais")
        BigDecimal amount,

        /** Nome da categoria. Se nao existir, a API responde 422 listando as validas. */
        @Size(max = 60)
        String category,

        /** Nome da conta de onde saiu o dinheiro. */
        @Size(max = 80)
        String account,

        /** Opcional; assume EXPENSE, que e o caso esmagadoramente mais comum. */
        Flow flow,

        @Size(max = 200)
        String description,

        /** Opcional; assume hoje no fuso configurado. */
        LocalDate occurredOn) {

    /** Despesa e o padrao: o Atalho normalmente e disparado ao gastar. */
    public Flow flowOrDefault() {
        return flow == null ? Flow.EXPENSE : flow;
    }
}
