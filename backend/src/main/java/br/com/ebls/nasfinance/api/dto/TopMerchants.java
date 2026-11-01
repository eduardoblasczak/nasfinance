package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Onde o dinheiro foi, por estabelecimento.
 *
 * @param totalMerchants quantos estabelecimentos ha na janela antes do corte
 *                       do {@code limit}: a tela diz "10 de 37"
 * @param totalExpense todas as despesas da janela, com e sem descricao: o
 *                     denominador da fatia de cada item
 */
public record TopMerchants(
        int windowMonths,
        int totalMerchants,
        BigDecimal totalExpense,
        List<Merchant> items) {
}
