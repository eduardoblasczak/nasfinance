import type { PluggyStatus, PluggySyncRun } from '@/types'

/**
 * Regras de frescor da conexão com a Pluggy.
 *
 * Existem por causa de uma falha medida, não imaginada: em outubro de 2026 o
 * Meu Pluggy ficou 5 dias sem coletar no banco. O painel deles mostrava ponto
 * verde, o item respondia UPDATED/SUCCESS, e a sincronização encerrava todas
 * as manhãs como SKIPPED — corretamente, porque não havia nada novo. Nada em
 * lugar nenhum dizia que algo estava errado; foi preciso sentir falta de um
 * PIX para descobrir.
 *
 * E não há como consertar pela API: o item da aplicação é um proxy da
 * conexão do Meu Pluggy, e `PATCH /items/{id}` devolve 400 "MeuPluggy item
 * cant be updated". A única saída é alguém clicar em Atualizar no painel
 * deles. Então o que dá para fazer daqui é dizer, sem ambiguidade, quando
 * esse clique é necessário.
 */

/**
 * A partir de quantas horas sem coleta o dado é considerado velho.
 *
 * 30 e não 24: a cadência prometida é de 24h, mas a coleta não acontece no
 * mesmo minuto todo dia. Com 24 exatas o aviso piscaria à toa num dia em que
 * a coleta atrasou uma hora, e um aviso que dispara sem motivo ensina a ser
 * ignorado.
 */
export const STALE_AFTER_HOURS = 30

/**
 * Lista de conexões, e não o link direto da conexão do PicPay. O id da
 * conexão no Meu Pluggy muda se ela for refeita; a lista sempre funciona.
 */
export const MEU_PLUGGY_CONNECTIONS_URL = 'https://meu.pluggy.ai/connections'

export type Freshness =
  /** Integração desligada ou sem credenciais: não há o que avisar. */
  | 'off'
  /** Ligada, mas a idade não pôde ser lida (Pluggy fora do ar, por exemplo). */
  | 'unknown'
  | 'fresh'
  | 'stale'

/** Horas inteiras desde um instante ISO. */
export function hoursSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000)
}

export function freshnessOf(status: PluggyStatus, now: Date = new Date()): Freshness {
  if (!status.enabled || !status.configured) return 'off'
  if (!status.itemLastUpdate) return 'unknown'
  return hoursSince(status.itemLastUpdate, now) > STALE_AFTER_HOURS ? 'stale' : 'fresh'
}

/**
 * "há 3 h", "há 5 dias".
 *
 * Em dias a partir de 48h: "há 132 h" exige uma conta de cabeça para virar
 * uma ideia, e a ideia é o que importa nesse aviso.
 */
export function describeAge(hours: number): string {
  if (hours < 1) return 'há menos de 1 h'
  if (hours < 48) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} dias`
}

/** O resultado de uma sincronização, numa frase. */
export function describeRun(run: PluggySyncRun, freshness: Freshness): string {
  if (run.status === 'FAILED') {
    return run.error ?? 'A sincronização falhou.'
  }

  if (run.status === 'SKIPPED') {
    // Com erro, o motivo é outro (integração desligada, item em erro) e já
    // vem escrito. Sem erro, SKIPPED significa "a Pluggy não coletou nada
    // desde a última vez" — exatamente o caso do aviso.
    if (run.error) return run.error
    return freshness === 'stale'
      ? 'Nada novo: a Pluggy não coletou desde a última vez. Atualize no Meu Pluggy primeiro.'
      : 'Nada novo desde a última coleta.'
  }

  if (run.imported === 0) {
    return 'Nada novo: tudo que a Pluggy tem já estava aqui.'
  }

  const imported = run.imported === 1 ? '1 lançamento importado' : `${run.imported} lançamentos importados`
  if (run.flagged === 0) return `${imported}.`
  return `${imported}, ${run.flagged} para conferir.`
}
