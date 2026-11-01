package br.com.ebls.nasfinance.api.dto;

/** Para onde o ritmo atual leva uma categoria com teto. */
public enum BudgetPaceStatus {

    /** Dentro do teto e com projecao dentro dele. */
    OK,

    /** Ainda dentro do teto, mas no ritmo atual passa dele. */
    WARN,

    /** Ja passou do teto. */
    OVER
}
