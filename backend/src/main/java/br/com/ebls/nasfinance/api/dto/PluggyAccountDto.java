package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

/**
 * Uma conta do lado da Pluggy, com o vinculo que ela tem (ou nao tem) aqui.
 * <p>
 * E a linha da tela de configuracao: "esta conta da Pluggy corresponde a qual
 * conta sua?". Junta o que veio da API com o que esta no nosso banco, para a
 * tela nao precisar cruzar duas listas.
 *
 * @param linkId     id do vinculo, ou {@code null} se ainda nao vinculada
 * @param accountId  conta local vinculada, ou {@code null}
 */
public record PluggyAccountDto(
        String pluggyAccountId,
        String name,
        String type,
        String subtype,
        BigDecimal balance,
        Long linkId,
        Long accountId,
        String accountName) {

    public boolean linked() {
        return linkId != null;
    }
}
