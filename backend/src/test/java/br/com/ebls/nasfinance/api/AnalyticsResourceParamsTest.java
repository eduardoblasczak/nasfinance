package br.com.ebls.nasfinance.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.YearMonth;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import br.com.ebls.nasfinance.api.error.BusinessException;

/**
 * Parametro ruim precisa virar 400 com motivo, nunca 404 sem corpo nem 500.
 */
class AnalyticsResourceParamsTest {

    private static final YearMonth NOW = YearMonth.of(2026, 11);

    @Test
    @DisplayName("ausente ou vazio usa o padrao")
    void defaults() {
        assertEquals(6, AnalyticsResource.parseInt("months", null, 6, 3, 12));
        assertEquals(6, AnalyticsResource.parseInt("months", "", 6, 3, 12));
        assertEquals(NOW, AnalyticsResource.parseMonth("month", null, NOW));
        assertEquals(NOW, AnalyticsResource.parseMonth("month", " ", NOW));
    }

    @Test
    @DisplayName("limites da faixa sao aceitos")
    void bounds() {
        assertEquals(3, AnalyticsResource.parseInt("months", "3", 6, 3, 12));
        assertEquals(24, AnalyticsResource.parseInt("months", "24", 12, 3, 24));
        assertEquals(YearMonth.of(2000, 1), AnalyticsResource.parseMonth("month", "2000-01", NOW));
        assertEquals(NOW, AnalyticsResource.parseMonth("month", "2026-11", NOW));
    }

    @Test
    @DisplayName("fora da faixa, malformado ou gigante: 400 com o nome do parametro")
    void invalid() {
        for (String raw : new String[] { "2", "13", "abc", "-1", "6.5", "99999999999" }) {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> AnalyticsResource.parseInt("months", raw, 6, 3, 12), raw);
            assertEquals(400, e.getStatus());
            assertTrue(e.getDetails().get(0).startsWith("months:"), raw);
        }
    }

    @Test
    @DisplayName("mes futuro, inexistente ou fora do formato: 400")
    void invalidMonth() {
        for (String raw : new String[] { "2026-12", "2026-13", "2026-1", "+2026-10", "1999-12", "2026/10" }) {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> AnalyticsResource.parseMonth("month", raw, NOW), raw);
            assertEquals(400, e.getStatus());
            assertTrue(e.getDetails().get(0).startsWith("month:"), raw);
        }
    }
}
