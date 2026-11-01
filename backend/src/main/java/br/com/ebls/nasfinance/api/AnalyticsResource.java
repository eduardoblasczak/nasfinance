package br.com.ebls.nasfinance.api;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.regex.Pattern;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.resteasy.reactive.RestQuery;

import br.com.ebls.nasfinance.api.dto.Cashflow;
import br.com.ebls.nasfinance.api.dto.CategoryTrends;
import br.com.ebls.nasfinance.api.dto.RecurringExpenses;
import br.com.ebls.nasfinance.api.error.BusinessException;
import br.com.ebls.nasfinance.service.AnalyticsService;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/**
 * Analises so de leitura: tendencia por categoria, cobrancas recorrentes e
 * fluxo de caixa mensal (ver ANALYTICS.md).
 * <p>
 * Os parametros chegam como texto e sao validados aqui. Tipados
 * ({@code @RestQuery int}), um {@code ?months=abc} viraria 404 sem corpo,
 * pela especificacao do JAX-RS; assim, o cliente recebe 400 no formato unico
 * de erro, com o motivo em {@code details}.
 */
@Path("/api/v1/analytics")
@Produces(MediaType.APPLICATION_JSON)
public class AnalyticsResource {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");
    private static final Pattern INTEGER = Pattern.compile("\\d{1,3}");

    /**
     * Piso do parametro {@code month}. Nao e regra de negocio: e o mesmo
     * limite de datas da demonstracao, e impede pedir o ano 0001.
     */
    static final YearMonth MIN_MONTH = YearMonth.of(2000, 1);

    @Inject
    AnalyticsService service;

    @ConfigProperty(name = "nasfinance.timezone")
    String timezone;

    /**
     * Gasto por categoria no mes contra a media dos meses anteriores.
     *
     * @param month    {@code YYYY-MM}; padrao: mes corrente. Nao pode ser futuro.
     * @param baseline meses de comparacao, 1 a 12; padrao 6
     */
    @GET
    @Path("/categories")
    public CategoryTrends categories(@RestQuery String month, @RestQuery String baseline) {
        LocalDate today = today();
        YearMonth reference = parseMonth("month", month, YearMonth.from(today));
        int base = parseInt("baseline", baseline, 6, 1, 12);
        return service.categories(reference, base, today);
    }

    /**
     * Cobrancas que se repetem com valor parecido.
     *
     * @param months meses fechados da janela, 3 a 12; padrao 6 (mais o corrente)
     */
    @GET
    @Path("/recurring")
    public RecurringExpenses recurring(@RestQuery String months) {
        return service.recurring(parseInt("months", months, 6, 3, 12), today());
    }

    /**
     * Entradas e saidas por mes.
     *
     * @param months quantos meses, contando o corrente, 3 a 24; padrao 12
     */
    @GET
    @Path("/cashflow")
    public Cashflow cashflow(@RestQuery String months) {
        return service.cashflow(parseInt("months", months, 12, 3, 24), today());
    }

    private LocalDate today() {
        return LocalDate.now(ZoneId.of(timezone));
    }

    // ---------------------------------------------------------------
    // Validacao
    // ---------------------------------------------------------------

    /**
     * Inteiro opcional numa faixa. Vazio ({@code ?months=}) vale como ausente,
     * como nos filtros das outras telas.
     */
    static int parseInt(String name, String raw, int fallback, int min, int max) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String value = raw.trim();
        // Limita os digitos antes de converter: "99999999999" estouraria o int
        // e viraria 500 em vez de 400.
        if (!INTEGER.matcher(value).matches()) {
            throw invalid(name + ": use um numero inteiro entre " + min + " e " + max);
        }
        int parsed = Integer.parseInt(value);
        if (parsed < min || parsed > max) {
            throw invalid(name + ": use um numero inteiro entre " + min + " e " + max);
        }
        return parsed;
    }

    /** Mes opcional em {@code YYYY-MM}, de 2000-01 ate {@code current}. */
    static YearMonth parseMonth(String name, String raw, YearMonth current) {
        if (raw == null || raw.isBlank()) {
            return current;
        }
        String value = raw.trim();
        String format = name + ": use o formato AAAA-MM (ex.: 2026-10)";
        // O padrao antes do parse: o YearMonth aceitaria "+2026-10".
        if (!MONTH.matcher(value).matches()) {
            throw invalid(format);
        }
        YearMonth parsed;
        try {
            parsed = YearMonth.parse(value);
        } catch (DateTimeParseException e) {
            throw invalid(format); // 2026-13
        }
        if (parsed.isAfter(current)) {
            throw invalid(name + ": o mes " + parsed + " ainda nao comecou");
        }
        if (parsed.isBefore(MIN_MONTH)) {
            throw invalid(name + ": use um mes a partir de " + MIN_MONTH);
        }
        return parsed;
    }

    private static BusinessException invalid(String detail) {
        return BusinessException.badRequest("Parametro invalido", List.of(detail));
    }
}
