package br.com.ebls.nasfinance.api.error;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/**
 * Converte {@link BusinessException} na resposta HTTP correspondente.
 * <p>
 * Sem isso, qualquer excecao viraria 500. O {@code @Provider} faz o Quarkus
 * registrar este mapper automaticamente.
 */
@Provider
public class BusinessExceptionMapper implements ExceptionMapper<BusinessException> {

    @Override
    public Response toResponse(BusinessException exception) {
        return Response
                .status(exception.getStatus())
                .entity(ErrorResponse.of(
                        exception.getStatus(),
                        exception.getMessage(),
                        exception.getDetails()))
                .build();
    }
}
