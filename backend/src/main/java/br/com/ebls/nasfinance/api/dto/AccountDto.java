package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

import br.com.ebls.nasfinance.domain.Account;
import br.com.ebls.nasfinance.domain.AccountKind;

/**
 * Representacao de uma conta para o frontend.
 * <p>
 * Por que um DTO em vez de serializar a entidade direto? Tres motivos:
 * <ul>
 *   <li>Entidade tem relacoes LAZY; serializar direto dispara
 *       {@code LazyInitializationException} fora da transacao.</li>
 *   <li>O contrato da API fica desacoplado do schema do banco: renomear
 *       uma coluna nao quebra o frontend.</li>
 *   <li>Permite incluir campos calculados, como {@code currentBalance},
 *       que nao existem como coluna.</li>
 * </ul>
 *
 * @param currentBalance saldo inicial somado a todas as transacoes da conta
 */
public record AccountDto(
        Long id,
        String name,
        AccountKind kind,
        String kindLabel,
        String color,
        BigDecimal openingBalance,
        BigDecimal currentBalance,
        boolean archived) {

    /** Converte a entidade em DTO, com o saldo ja calculado. */
    public static AccountDto from(Account account, BigDecimal currentBalance) {
        return new AccountDto(
                account.id,
                account.name,
                account.kind,
                account.kind.getLabel(),
                account.color,
                account.openingBalance,
                currentBalance,
                account.archived);
    }
}
