package br.com.ebls.nasfinance.api;

import java.time.LocalDate;
import java.time.ZoneId;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.resteasy.reactive.RestQuery;

import br.com.ebls.nasfinance.api.dto.DashboardSummary;
import br.com.ebls.nasfinance.api.error.BusinessException;
import br.com.ebls.nasfinance.service.DashboardService;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/** Resumo consolidado para a tela inicial. */
@Path("/api/v1/dashboard")
@Produces(MediaType.APPLICATION_JSON)
public class DashboardResource {

    /** Teto de dias por consulta, para nao permitir varrer o historico inteiro. */
    private static final long MAX_RANGE_DAYS = 366 * 3;

    @Inject
    DashboardService service;

    @ConfigProperty(name = "nasfinance.timezone")
    String timezone;

    /**
     * Resumo do periodo. Sem parametros, devolve o mes corrente.
     *
     * @param from inicio do periodo (inclusive), ISO-8601
     * @param to   fim do periodo (inclusive), ISO-8601
     */
    @GET
    public DashboardSummary summary(@RestQuery LocalDate from, @RestQuery LocalDate to) {
        LocalDate today = LocalDate.now(ZoneId.of(timezone));

        LocalDate start = from != null ? from : today.withDayOfMonth(1);
        LocalDate end = to != null ? to : start.plusMonths(1).minusDays(1);

        if (end.isBefore(start)) {
            throw BusinessException.unprocessable(
                    "Periodo invalido",
                    java.util.List.of("A data final (" + end + ") e anterior a inicial (" + start + ")"));
        }

        if (java.time.temporal.ChronoUnit.DAYS.between(start, end) > MAX_RANGE_DAYS) {
            throw BusinessException.unprocessable(
                    "Periodo muito longo",
                    java.util.List.of("O intervalo maximo e de " + MAX_RANGE_DAYS + " dias"));
        }

        return service.summary(start, end);
    }
}
