package br.com.ebls.nasfinance.api.error;

import java.util.List;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/**
 * Traduz falhas de validacao (Bean Validation) para o mesmo
 * {@link ErrorResponse} usado pelo resto da API.
 * <p>
 * O formato padrao do Quarkus para violacoes e diferente do nosso; unificar
 * evita que o frontend precise de dois caminhos de tratamento de erro.
 */
@Provider
public class ValidationExceptionMapper implements ExceptionMapper<ConstraintViolationException> {

    @Override
    public Response toResponse(ConstraintViolationException exception) {
        List<String> details = exception.getConstraintViolations()
                .stream()
                .map(ValidationExceptionMapper::describe)
                .toList();

        return Response
                .status(400)
                .entity(ErrorResponse.of(400, "Dados invalidos na requisicao", details))
                .build();
    }

    /**
     * Monta "campo: mensagem" a partir da violacao.
     * <p>
     * O propertyPath vem como {@code criar.request.amount}; so a ultima parte
     * interessa ao cliente da API.
     */
    private static String describe(ConstraintViolation<?> violation) {
        String path = violation.getPropertyPath().toString();
        int lastDot = path.lastIndexOf('.');
        String field = lastDot >= 0 ? path.substring(lastDot + 1) : path;
        return field + ": " + violation.getMessage();
    }
}
