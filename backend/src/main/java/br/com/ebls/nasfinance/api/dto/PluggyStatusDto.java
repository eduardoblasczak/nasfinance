package br.com.ebls.nasfinance.api.dto;

import java.time.OffsetDateTime;

/**
 * Estado da integracao, para a tela de configuracao.
 * <p>
 * Responde de uma vez as perguntas que surgem quando alguem desconfia que a
 * sincronizacao parou: esta ligada? as credenciais existem? a Pluggy coletou
 * algo? quando foi a ultima execucao, e como ela terminou?
 *
 * @param enabled        a integracao esta habilitada por configuracao
 * @param configured     client id e secret presentes
 * @param itemStatus     status do item na Pluggy, ou {@code null} se inacessivel
 * @param itemLastUpdate ultima coleta da Pluggy
 * @param lastRunAt      inicio da ultima execucao do nosso job
 * @param lastRunStatus  como ela terminou
 * @param lastRunError   mensagem, se falhou
 * @param linkedAccounts quantas contas da Pluggy ja apontam para contas daqui
 */
public record PluggyStatusDto(
        boolean enabled,
        boolean configured,
        String itemStatus,
        OffsetDateTime itemLastUpdate,
        OffsetDateTime lastRunAt,
        String lastRunStatus,
        String lastRunError,
        long linkedAccounts) {
}
