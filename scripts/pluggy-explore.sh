#!/usr/bin/env bash
# =============================================================
# nasFinance - sondagem da API da Pluggy
# =============================================================
# Somente LEITURA. Nao grava nada, nem na Pluggy nem no banco.
#
# Responde, com dados reais, as perguntas que decidem o desenho da
# sincronizacao:
#
#   1. Em que estado esta o item, e quando foi a ultima coleta?
#   2. Quantas contas, de que tipo?
#   3. O `providerId` vem preenchido? (A doc diz que so existe em
#      conectores Open Finance, e o MeuPluggy e Direct — se confirmar,
#      nao ha identificador estavel e a conciliacao tera de ser por
#      date + amount + description.)
#   4. (data, valor, descricao) e unico dentro da propria Pluggy?
#
# O resumo e DELIBERADAMENTE agregado: contagens, nomes de campo e
# descricoes truncadas, nao o extrato inteiro. Para desenhar a integracao
# a forma dos dados basta — o conteudo e do dono da conta.
#
# Uso (na VM):
#   bash ~/nasfinance/scripts/pluggy-explore.sh
#   DAYS=365 bash ~/nasfinance/scripts/pluggy-explore.sh
# =============================================================

set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/nasfinance/.env}"
API="https://api.pluggy.ai"
DAYS="${DAYS:-180}"

if [ ! -r "$ENV_FILE" ]; then
    echo "ERRO: nao consegui ler $ENV_FILE"
    exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

for var in PLUGGY_CLIENT_ID PLUGGY_CLIENT_SECRET PLUGGY_ITEM_ID; do
    if [ -z "${!var:-}" ]; then
        echo "ERRO: $var nao esta definida em $ENV_FILE"
        exit 1
    fi
done

command -v jq >/dev/null 2>&1 || { echo "ERRO: jq nao instalado."; exit 1; }

FROM=$(date -u -d "$DAYS days ago" +%F)
TO=$(date -u +%F)

echo "== 1. Autenticando =="
# Corpo por arquivo, nao por argumento: argumentos de processo sao
# visiveis a qualquer usuario da maquina via /proc.
AUTH_BODY=$(mktemp)
trap 'rm -f "$AUTH_BODY"' EXIT
printf '{"clientId":"%s","clientSecret":"%s"}' "$PLUGGY_CLIENT_ID" "$PLUGGY_CLIENT_SECRET" > "$AUTH_BODY"

API_KEY=$(curl -sS -X POST "$API/auth" \
    -H 'Content-Type: application/json' \
    --data-binary "@$AUTH_BODY" | jq -r '.apiKey // empty')

[ -n "$API_KEY" ] || { echo "FALHOU: nenhuma apiKey devolvida."; exit 1; }
echo "ok  (janela consultada: $FROM a $TO)"

echo
echo "== 2. Estado do item =="
# Se a coleta ainda nao terminou, as contas aparecem mas as transacoes
# vem vazias — e isso parece, de fora, um erro de integracao.
ITEM=$(curl -sS "$API/items/$PLUGGY_ITEM_ID" -H "X-API-KEY: $API_KEY")
echo "$ITEM" | jq -r '
  if .id then
    "status:          \(.status // "—")",
    "executionStatus: \(.executionStatus // "—")",
    "lastUpdatedAt:   \(.lastUpdatedAt // "nunca coletado")",
    "createdAt:       \(.createdAt // "—")",
    "connector:       \(.connector.name // "—")  (openFinance=\(.connector.isOpenFinance // "—"))"
  else
    "nao foi possivel ler o item: \(. | tostring | .[0:200])"
  end'

echo
echo "== 3. Contas do item =="
ACCOUNTS=$(curl -sS "$API/accounts?itemId=$PLUGGY_ITEM_ID" -H "X-API-KEY: $API_KEY")
echo "$ACCOUNTS" | jq -r '
  (.results // []) as $a |
  "total: \($a | length)",
  ($a[] | "  - [\(.type)/\(.subtype // "—")] \(.name)  saldo=\(.balance)")'

IDS=$(echo "$ACCOUNTS" | jq -r '(.results // [])[].id')
[ -n "$IDS" ] || { echo "Nenhuma conta — nada mais a inspecionar."; exit 0; }

# ---------------------------------------------------------------
# Percorre TODAS as contas. A versao anterior olhava so a primeira, que
# por acaso era a corrente — justamente a menos interessante, porque o
# problema de id instavel vive no cartao de credito.
# ---------------------------------------------------------------
for ACC in $IDS; do
    NAME=$(echo "$ACCOUNTS" | jq -r --arg id "$ACC" '.results[] | select(.id==$id) | "[\(.type)/\(.subtype // "—")] \(.name)"')

    echo
    echo "== 4. Transacoes: $NAME =="

    # -----------------------------------------------------------
    # /v2/transactions com paginacao por CURSOR.
    #
    # O endpoint antigo (/transactions, com from/to e pageSize) foi
    # aposentado e responde 410 ENDPOINT_DEPRECATED — inclusive para o
    # exemplo que ainda consta no guia "Personal use" da documentacao.
    #
    # O campo `next` ja vem como query string pronta; a doc manda
    # concatenar como esta, sem remontar nada.
    # -----------------------------------------------------------
    PAGES=$(mktemp)
    URL="$API/v2/transactions?accountId=$ACC&dateFrom=$FROM&dateTo=$TO"
    PAGE_COUNT=0

    while [ -n "$URL" ] && [ "$PAGE_COUNT" -lt 20 ]; do
        PAGE=$(curl -sS "$URL" -H "X-API-KEY: $API_KEY")

        # Erro da API nao tem `results`: para aqui em vez de girar em falso.
        if [ "$(echo "$PAGE" | jq -r 'has("results")')" != "true" ]; then
            echo "resposta sem 'results' na pagina $((PAGE_COUNT + 1)):"
            echo "  $(echo "$PAGE" | jq -c '.' | cut -c1-240)"
            break
        fi

        echo "$PAGE" >> "$PAGES"
        PAGE_COUNT=$((PAGE_COUNT + 1))

        NEXT=$(echo "$PAGE" | jq -r '.next // empty')
        URL=""
        [ -n "$NEXT" ] && URL="$API/v2/transactions$NEXT"
    done

    # Junta todas as paginas num unico objeto com o mesmo formato, para o
    # resto do script nao precisar saber que houve paginacao.
    TX=$(jq -s '{results: (map(.results) | add // [])}' "$PAGES" 2>/dev/null || echo '{"results":[]}')
    rm -f "$PAGES"

    COUNT=$(echo "$TX" | jq -r '(.results // []) | length')
    echo "paginas lidas: $PAGE_COUNT"

    if [ "$COUNT" = "0" ]; then
        # Distingue "lista vazia" de "resposta com outro formato" — sem
        # isso, os dois casos sao indistinguiveis e a investigacao para.
        echo "nenhuma transacao na janela."
        continue
    fi

    echo "$TX" | jq -r '
      (.results // []) as $t |
      "quantidade:     \($t | length)",
      "intervalo:      \($t | map(.date) | min | .[0:10]) ate \($t | map(.date) | max | .[0:10])",
      "providerId:     \($t | map(select(.providerId != null)) | length) de \($t | length) preenchidos",
      "description:    \($t | map(select(.description != null and .description != "")) | length) preenchidas",
      "category:       \($t | map(select(.category != null)) | length) classificadas pela Pluggy",
      "",
      "campos do primeiro registro:",
      "  \($t[0] | keys | join(", "))"'

    echo
    echo "  amostra (descricoes truncadas em 24):"
    echo "$TX" | jq -r '
      (.results // [])[0:6][] |
      "    \(.date[0:10])  \(.amount)  \(.type // "—")  \((.description // "")[0:24])"'

    echo
    # A pergunta que decide o algoritmo de conciliacao: se a chave que a
    # propria Pluggy recomenda nao for unica nem dentro dela mesma, vai
    # precisar de desempate antes de qualquer linha de sincronizacao.
    echo "$TX" | jq -r '
      (.results // [])
      | group_by([.date[0:10], .amount, (.description // "")])
      | map(select(length > 1)) as $dups
      | "  chaves (data,valor,descricao) repetidas: \($dups | length) grupo(s), \($dups | map(length) | add // 0) registro(s)"'
done

echo
echo "Fim. Nada foi gravado."
