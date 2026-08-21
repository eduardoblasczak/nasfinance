package br.com.ebls.nasfinance.api.dto;

import java.math.BigDecimal;

import br.com.ebls.nasfinance.domain.Category;
import br.com.ebls.nasfinance.domain.Flow;

/** Representacao de uma categoria para o frontend. */
public record CategoryDto(
        Long id,
        String name,
        Flow flow,
        String color,
        String icon,
        BigDecimal monthlyBudget,
        boolean archived) {

    public static CategoryDto from(Category category) {
        return new CategoryDto(
                category.id,
                category.name,
                category.flow,
                category.color,
                category.icon,
                category.monthlyBudget,
                category.archived);
    }
}
