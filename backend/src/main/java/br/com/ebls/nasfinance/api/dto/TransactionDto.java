package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.Transaction;
import br.com.ebls.nasfinance.domain.TransactionSource;

/**
 * Uma transacao como o frontend precisa ver.
 * <p>
 * Traz nome e cor da conta e da categoria embutidos (achatados) para que a
 * listagem nao precise fazer uma requisicao extra por linha so para descobrir
 * como pintar o badge.
 */
public record TransactionDto(
        Long id,
        Long accountId,
        String accountName,
        String accountColor,
        Long categoryId,
        String categoryName,
        String categoryColor,
        String categoryIcon,
        Flow flow,
        BigDecimal amount,
        String description,
        LocalDate occurredOn,
        TransactionSource source,
        String notes,
        OffsetDateTime createdAt,

        // ---- fila de revisao ----
        // Acrescentados aqui, e nao num DTO separado, porque a fila mostra
        // exatamente um lancamento com um motivo ao lado: um segundo tipo
        // obrigaria o frontend a manter duas formas da mesma coisa.
        String reviewStatus,
        String reviewReason,
        /** Lancamento preexistente que este talvez duplique; nulo quando nao ha suspeita. */
        Long duplicateOfId,
        LocalDate duplicateOfDate,
        String duplicateOfDescription,
        String duplicateOfSource) {

    /**
     * Converte a entidade em DTO.
     * <p>
     * Precisa ser chamado dentro de uma transacao ativa: acessar
     * {@code transaction.account.name} dispara o carregamento LAZY da relacao.
     */
    public static TransactionDto from(Transaction transaction) {
        var category = transaction.category;
        var duplicate = transaction.duplicateOf;
        return new TransactionDto(
                transaction.id,
                transaction.account.id,
                transaction.account.name,
                transaction.account.color,
                category == null ? null : category.id,
                category == null ? null : category.name,
                category == null ? null : category.color,
                category == null ? null : category.icon,
                transaction.flow,
                transaction.amount,
                transaction.description,
                transaction.occurredOn,
                transaction.source,
                transaction.notes,
                transaction.createdAt,
                transaction.reviewStatus == null ? null : transaction.reviewStatus.name(),
                transaction.reviewReason == null ? null : transaction.reviewReason.name(),
                duplicate == null ? null : duplicate.id,
                duplicate == null ? null : duplicate.occurredOn,
                duplicate == null ? null : duplicate.description,
                duplicate == null ? null : duplicate.source.name());
    }
}
