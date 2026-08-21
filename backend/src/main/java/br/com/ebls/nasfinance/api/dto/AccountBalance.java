package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

import br.com.ebls.nasfinance.domain.AccountKind;

/**
 * Saldo de uma conta, com o movimento do periodo selecionado.
 *
 * @param balance       saldo total: saldo inicial + todas as transacoes ja lancadas
 * @param periodExpense quanto saiu dessa conta dentro do periodo do dashboard
 * @param periodIncome  quanto entrou nessa conta dentro do periodo do dashboard
 */
public record AccountBalance(
        Long accountId,
        String accountName,
        AccountKind kind,
        String color,
        BigDecimal balance,
        BigDecimal periodExpense,
        BigDecimal periodIncome) {
}
