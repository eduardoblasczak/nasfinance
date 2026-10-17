package br.com.ebls.nasfinance.pluggy;

/**
 * Falha ao falar com a Pluggy.
 * <p>
 * Nao estende as excecoes de negocio da aplicacao de proposito: "a Pluggy esta
 * fora do ar" nao e erro do usuario e nao deve virar 4xx numa requisicao dele.
 * O job de sincronizacao captura isto, registra em {@code pluggy_sync_runs} e
 * encerra — a aplicacao segue funcionando normalmente sem os dados do dia.
 */
public class PluggyException extends RuntimeException {

    public PluggyException(String message) {
        super(message);
    }

    public PluggyException(String message, Throwable cause) {
        super(message, cause);
    }
}
