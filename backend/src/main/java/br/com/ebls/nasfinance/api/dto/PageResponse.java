package br.com.ebls.nasfinance.api.dto;

import java.util.List;

/**
 * Envelope de paginacao generico.
 *
 * @param <T> tipo dos itens da pagina
 * @param page  indice da pagina, base zero
 * @param size  quantidade de itens por pagina
 * @param total total de registros que casam com o filtro (todas as paginas)
 */
public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long total,
        int totalPages) {

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long total) {
        int totalPages = size <= 0 ? 0 : (int) Math.ceil((double) total / size);
        return new PageResponse<>(items, page, size, total, totalPages);
    }
}
