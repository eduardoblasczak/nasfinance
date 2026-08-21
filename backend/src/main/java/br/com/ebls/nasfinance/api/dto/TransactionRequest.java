package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import br.com.ebls.nasfinance.domain.Flow;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Payload de criacao/edicao de transacao pela interface web. */
public record TransactionRequest(

        @NotNull(message = "A conta e obrigatoria")
        Long accountId,

        /** Opcional: uma transacao pode ficar pendente de categorizacao. */
        Long categoryId,

        @NotNull(message = "Informe se e despesa (EXPENSE) ou receita (INCOME)")
        Flow flow,

        @NotNull(message = "O valor e obrigatorio")
        @DecimalMin(value = "0.01", message = "O valor deve ser maior que zero")
        @Digits(integer = 12, fraction = 2, message = "Valor invalido: maximo 2 casas decimais")
        BigDecimal amount,

        @Size(max = 200, message = "A descricao deve ter no maximo 200 caracteres")
        String description,

        /** Se omitida, o servico assume a data de hoje. */
        LocalDate occurredOn,

        String notes) {
}
