package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Um estabelecimento: as despesas com a mesma descricao normalizada,
 * em qualquer conta.
 *
 * @param key          descricao normalizada (sem a conta)
 * @param label        descricao como aparece no lancamento mais recente
 * @param categoryName categoria do lancamento mais recente; {@code null} se ele
 *                     nao tem categoria
 * @param average      {@code total / count}
 */
public record Merchant(
        String key,
        String label,
        String categoryName,
        String categoryColor,
        BigDecimal total,
        long count,
        BigDecimal average,
        LocalDate lastDate) {
}
