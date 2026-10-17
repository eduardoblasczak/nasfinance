#!/usr/bin/env bash
# =============================================================
# nasFinance - dispara uma coleta na Pluggy (PATCH /items/{id})
# =============================================================
# Este script ESCREVE na Pluggy: pede ao banco uma coleta nova. Nao
# escreve no banco local, nem importa nada — quem importa e a
# sincronizacao, depois.
#
# Existe porque a atualizacao automatica de 24h e das aplicacoes em
# PRODUCAO. Numa conta pessoal do Meu Pluggy ela nao acontece: o item
# e coletado uma vez, quando voce conecta, e congela ali. Medido —
# `lastUpdatedAt` ficou em 12/10 01:13 por tres dias, e a sincronizacao
# encerrou SKIPPED todas as manhas, corretamente, porque de fato nao
# havia nada novo para trazer.
#
# MEDIDO EM 15/10/2026: neste conector o PATCH NAO funciona. Devolve
# 400 "MeuPluggy item cant be updated", e isso e por desenho -- o item
# da aplicacao e um proxy de uma conexao que pertence ao servico Meu
# Pluggy, e so ele coleta no banco. Nao ha como disparar coleta pela
# API, com ou sem MFA.
#
# O script continua util pelo que ele mede de passagem: o estado do
# item e, principalmente, a IDADE do dado. Quando o Meu Pluggy para de
# coletar, ele para em silencio -- ponto verde no painel, item em
# UPDATED/SUCCESS, nenhum erro -- e a unica evidencia e um lancamento
# que nunca chegou.
#
# Limite: client IDs novos podem atualizar uma vez por hora via API.
#
# Uso (na VM):
#   bash ~/nasfinance/scripts/pluggy-refresh.sh
# =============================================================

set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/nasfinance/.env}"
API="https://api.pluggy.ai"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-240}"

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

# ---------------------------------------------------------------
echo "== 1. Autenticando =="
# Corpo por arquivo, nao por argumento: argumentos de processo sao
# visiveis a qualquer usuario da maquina via /proc.
AUTH_BODY=$(mktemp)
PATCH_BODY=$(mktemp)
trap 'rm -f "$AUTH_BODY" "$PATCH_BODY"' EXIT
printf '{"clientId":"%s","clientSecret":"%s"}' "$PLUGGY_CLIENT_ID" "$PLUGGY_CLIENT_SECRET" > "$AUTH_BODY"

API_KEY=$(curl -sS -X POST "$API/auth" \
    -H 'Content-Type: application/json' \
    --data-binary "@$AUTH_BODY" | jq -r '.apiKey // empty')

[ -n "$API_KEY" ] || { echo "FALHOU: nenhuma apiKey devolvida."; exit 1; }
echo "ok"

# ---------------------------------------------------------------
echo
echo "== 2. Estado ANTES =="
BEFORE=$(curl -sS "$API/items/$PLUGGY_ITEM_ID" -H "X-API-KEY: $API_KEY")
BEFORE_UPDATE=$(echo "$BEFORE" | jq -r '.lastUpdatedAt // "nunca"')
echo "$BEFORE" | jq -r '
    "conector:        \(.connector.name // "?") (\(if .connector.oauth then "oauth" else "direto" end))",
    "status:          \(.status // "?")",
    "execucao:        \(.executionStatus // "?")",
    "ultima coleta:   \(.lastUpdatedAt // "nunca")",
    "consentimento:   expira em \(.consentExpiresAt // "—")"'

# O conector declara se pede MFA. Saber ANTES de chamar o PATCH torna
# um eventual 400 interpretavel em vez de misterioso.
MFA=$(echo "$BEFORE" | jq -r '
    (.connector.credentials // [])
    | map(select(.mfa == true) | .name)
    | if length == 0 then "nenhuma" else join(", ") end')
echo "credencial MFA:  $MFA"

# ---------------------------------------------------------------
echo
echo "== 3. Pedindo coleta nova (PATCH /items/{id}) =="
# Corpo vazio de proposito: todos os campos sao opcionais, e nao
# queremos reescrever credencial nem webhook — so disparar a coleta.
printf '{}' > "$PATCH_BODY"

HTTP=$(curl -sS -o /tmp/pluggy-patch.json -w '%{http_code}' \
    -X PATCH "$API/items/$PLUGGY_ITEM_ID" \
    -H "X-API-KEY: $API_KEY" \
    -H 'Content-Type: application/json' \
    --data-binary "@$PATCH_BODY")

echo "HTTP $HTTP"
jq -r '
    if .message then "mensagem: \(.message)" else empty end,
    if .code then "codigo:   \(.code)" else empty end,
    if .status then "status:   \(.status)" else empty end,
    if .executionStatus then "execucao: \(.executionStatus)" else empty end
' /tmp/pluggy-patch.json 2>/dev/null || cat /tmp/pluggy-patch.json

if [ "$HTTP" != "200" ]; then
    echo
    echo "NAO disparou. Leitura do codigo:"
    echo "  400 'MeuPluggy item cant be updated' -> esperado, e nao tem conserto"
    echo "       deste lado: o item da aplicacao e um PROXY de uma conexao que"
    echo "       pertence ao servico Meu Pluggy. Quem coleta no banco e ele,"
    echo "       a cada 24h; o proxy so reflete. Por isso recusa o PATCH."
    echo "  400 com nome de credencial -> conector exige MFA nova a cada coleta"
    echo "  409 -> ja existe coleta em andamento"
    echo "  429 -> limite de uma atualizacao por hora (compartilhado por CPF)"
    echo
    echo "== Idade do dado =="
    # Com o PATCH indisponivel, a unica coisa acionavel e a idade: se o
    # Meu Pluggy parou de coletar, nada aqui conserta e a conexao precisa
    # ser refeita em https://meu.pluggy.ai. O modo de falha e silencioso --
    # ponto verde no painel, item em UPDATED/SUCCESS, zero erro -- e so
    # aparece como lancamento que nunca chegou.
    if [ "$BEFORE_UPDATE" = "nunca" ]; then
        echo "nunca coletou"
    else
        AGE_HOURS=$(( ( $(date -u +%s) - $(date -u -d "$BEFORE_UPDATE" +%s) ) / 3600 ))
        echo "ultima coleta: $BEFORE_UPDATE (${AGE_HOURS}h atras)"
        if [ "$AGE_HOURS" -gt 30 ]; then
            echo
            echo "VELHO: passou de 30h. A cadencia prometida e 24h, entao o"
            echo "Meu Pluggy nao esta coletando. Reconecte o banco no painel"
            echo "https://meu.pluggy.ai e rode este script de novo para"
            echo "confirmar que a data avancou."
        fi
    fi
    exit 1
fi

# ---------------------------------------------------------------
echo
echo "== 4. Acompanhando a coleta =="
# A coleta e assincrona: o PATCH volta na hora, com o item em UPDATING.
# Sem esperar, a sincronizacao seguinte leria o cache velho e encerraria
# SKIPPED de novo — o mesmo sintoma, agora com uma causa a mais.
DEADLINE=$((SECONDS + TIMEOUT_SECONDS))
LAST=""

while [ "$SECONDS" -lt "$DEADLINE" ]; do
    ITEM=$(curl -sS "$API/items/$PLUGGY_ITEM_ID" -H "X-API-KEY: $API_KEY")
    STATUS=$(echo "$ITEM" | jq -r '.status // "?"')
    EXEC=$(echo "$ITEM" | jq -r '.executionStatus // "?"')

    if [ "$STATUS/$EXEC" != "$LAST" ]; then
        printf '  [%3ds] %s / %s\n' "$SECONDS" "$STATUS" "$EXEC"
        LAST="$STATUS/$EXEC"
    fi

    case "$STATUS" in
        UPDATING|LOGIN_IN_PROGRESS|WAITING_USER_INPUT) sleep 10 ;;
        *) break ;;
    esac
done

# ---------------------------------------------------------------
echo
echo "== 5. Estado DEPOIS =="
AFTER=$(curl -sS "$API/items/$PLUGGY_ITEM_ID" -H "X-API-KEY: $API_KEY")
AFTER_UPDATE=$(echo "$AFTER" | jq -r '.lastUpdatedAt // "nunca"')
echo "$AFTER" | jq -r '
    "status:          \(.status // "?")",
    "execucao:        \(.executionStatus // "?")",
    "ultima coleta:   \(.lastUpdatedAt // "nunca")",
    "erro:            \(.error.message // "—")"'

echo
# Este e o unico veredito que importa. `status: UPDATED` com a data
# parada significa "nada coletado", que e indistinguivel de sucesso se
# ninguem comparar as duas datas.
if [ "$AFTER_UPDATE" != "$BEFORE_UPDATE" ]; then
    echo "COLETOU: $BEFORE_UPDATE -> $AFTER_UPDATE"
    echo "Agora a sincronizacao tem o que importar."
else
    echo "NAO COLETOU: a data continua em $BEFORE_UPDATE"
fi
