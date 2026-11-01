package br.com.ebls.nasfinance.api.error;

import java.util.List;

import jakarta.ws.rs.core.Response;

/**
 * Erro previsto de regra de negocio (recurso inexistente, dado inconsistente).
 * <p>
 * Distingue-se de uma excecao inesperada: aqui a falha e conhecida e a mensagem
 * pode ser mostrada ao usuario. Excecoes nao previstas viram 500 com mensagem
 * generica, sem vazar detalhes internos.
 */
public class BusinessException extends RuntimeException {

    private final int status;
    private final List<String> details;

    public BusinessException(int status, String message, List<String> details) {
        super(message);
        this.status = status;
        this.details = details == null ? List.of() : details;
    }

    public int getStatus() {
        return status;
    }

    public List<String> getDetails() {
        return details;
    }

    /** 404: o recurso referenciado nao existe. */
    public static BusinessException notFound(String message) {
        return new BusinessException(Response.Status.NOT_FOUND.getStatusCode(), message, List.of());
    }

    /**
     * 400: parametro malformado ou fora da faixa (ex.: {@code ?months=abc}).
     * <p>
     * Existe porque um parametro tipado ({@code @RestQuery int}) que nao
     * converte vira 404 pela especificacao do JAX-RS, sem corpo no formato
     * {@link ErrorResponse}; lendo como texto e validando aqui, o cliente
     * recebe o motivo em {@code details}.
     */
    public static BusinessException badRequest(String message, List<String> details) {
        return new BusinessException(Response.Status.BAD_REQUEST.getStatusCode(), message, details);
    }

    /**
     * 422: a requisicao esta bem formada, mas o conteudo nao faz sentido no
     * dominio (ex.: categoria de receita usada num lancamento de despesa).
     */
    public static BusinessException unprocessable(String message, List<String> details) {
        return new BusinessException(422, message, details);
    }

    /** 409: conflito com o estado atual (ex.: transacao externa ja importada). */
    public static BusinessException conflict(String message) {
        return new BusinessException(Response.Status.CONFLICT.getStatusCode(), message, List.of());
    }
}
