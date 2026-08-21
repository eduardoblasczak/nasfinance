package br.com.ebls.nasfinance.api.error;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Formato unico de erro da API.
 * <p>
 * Ter um so formato para todo erro simplifica o frontend: um unico ponto de
 * tratamento consegue exibir qualquer falha, sem adivinhar o formato.
 *
 * @param details lista de problemas especificos (ex.: violacoes de validacao
 *                campo a campo), ou vazia quando o erro e unico
 */
public record ErrorResponse(
        int status,
        String message,
        List<String> details,
        OffsetDateTime at) {

    public static ErrorResponse of(int status, String message) {
        return new ErrorResponse(status, message, List.of(), OffsetDateTime.now());
    }

    public static ErrorResponse of(int status, String message, List<String> details) {
        return new ErrorResponse(status, message, details, OffsetDateTime.now());
    }
}
