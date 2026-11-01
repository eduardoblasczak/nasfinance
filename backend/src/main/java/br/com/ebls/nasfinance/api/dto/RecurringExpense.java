package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Uma cobranca que se repete em meses diferentes com valor parecido.
 * <p>
 * E so uma proposta: a rota lista, nunca marca nada no lancamento.
 *
 * @param key          chave estavel da serie (conta + descricao normalizada)
 * @param label        descricao como aparece no lancamento mais recente
 * @param monthsSeen   em quantos meses distintos da janela ela apareceu
 * @param typicalDay   dia do mes mais comum da cobranca
 * @param nextExpected {@code typicalDay} no mes seguinte ao da ultima cobranca
 */
public record RecurringExpense(
        String key,
        String label,
        Long categoryId,
        String categoryName,
        String categoryColor,
        String accountName,
        BigDecimal averageAmount,
        BigDecimal lastAmount,
        LocalDate lastDate,
        int monthsSeen,
        int typicalDay,
        LocalDate nextExpected) {
}
