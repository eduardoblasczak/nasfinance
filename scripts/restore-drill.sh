#!/usr/bin/env bash
# =============================================================
# nasFinance - simulado de restauracao
# =============================================================
# Prova que a restauracao SUBSTITUI os dados, e nao apenas que o
# comando roda sem reclamar.
#
# Um `psql` que aceita o arquivo e nao aplica nada sai com codigo 0 e
# parece sucesso. Esse e o modo de falha perigoso aqui: voce so descobre
# no dia em que precisa do backup. Por isso o teste insere um marcador
# DEPOIS do dump e verifica que ele desapareceu — se sumiu, o conteudo do
# banco foi mesmo trocado pelo do arquivo.
#
# DESTRUTIVO: restaura o banco para o estado do dump recem-criado.
# Qualquer lancamento feito entre o dump e a restauracao se perde. Por
# isso exige confirmacao explicita:
#
#   CONFIRM=yes OCI_BUCKET=nasfinance-backups ~/nasfinance/scripts/restore-drill.sh
# =============================================================

set -euo pipefail

CONTAINER_DB="nasfinance-db"
DB_USER="nasfinance"
DB_NAME="nasfinance"
BACKUP_DIR="/opt/nasfinance/backups"
COMPOSE_DIR="$HOME/nasfinance"
COMPOSE_FILE="docker-compose.prod.yml"
MARKER="MARCADOR-RESTORE-DRILL"

if [ "${CONFIRM:-}" != "yes" ]; then
    echo "ERRO: este script restaura o banco. Rode com CONFIRM=yes se e isso que voce quer."
    exit 1
fi

psql_q() {
    docker exec "$CONTAINER_DB" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"
}

echo "== 1. Estado antes =="
CAT_ANTES=$(psql_q 'SELECT count(*) FROM categories;')
TX_ANTES=$(psql_q 'SELECT count(*) FROM transactions;')
echo "categorias=$CAT_ANTES lancamentos=$TX_ANTES"

echo
echo "== 2. Backup novo =="
"$(dirname "$0")/backup-database.sh"
DUMP=$(ls -t "$BACKUP_DIR"/nasfinance-*.sql.gz | head -1)
echo "dump: $DUMP"

echo
echo "== 3. Marcador criado DEPOIS do dump =="
# Nao pode existir no arquivo. Se sobreviver a restauracao, o dump nao
# foi aplicado.
psql_q "DELETE FROM categories WHERE name = '$MARKER';" >/dev/null
psql_q "INSERT INTO categories (name, flow, color) VALUES ('$MARKER', 'EXPENSE', '#ff0000');" >/dev/null
CAT_COM_MARCADOR=$(psql_q 'SELECT count(*) FROM categories;')
echo "categorias com marcador=$CAT_COM_MARCADOR (esperado: $((CAT_ANTES + 1)))"

echo
echo "== 4. Parando a aplicacao =="
# O dump usa --clean, que executa DROP TABLE. A JVM mantem um pool de
# conexoes abertas: com o app no ar o DROP trava ou falha no meio, e a
# restauracao termina pela metade — estado pior do que o inicial.
cd "$COMPOSE_DIR"
docker compose -f "$COMPOSE_FILE" --env-file .env stop app

echo
echo "== 5. Restaurando =="
if gunzip -c "$DUMP" | docker exec -i "$CONTAINER_DB" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 > /tmp/restore-drill.log 2>&1; then
    echo "psql: OK"
else
    echo "psql: FALHOU -- veja /tmp/restore-drill.log"
    tail -20 /tmp/restore-drill.log
    docker compose -f "$COMPOSE_FILE" --env-file .env start app
    exit 1
fi

echo
echo "== 6. Religando a aplicacao =="
docker compose -f "$COMPOSE_FILE" --env-file .env start app

echo
echo "== 7. Veredito =="
MARCADORES=$(psql_q "SELECT count(*) FROM categories WHERE name = '$MARKER';")
CAT_DEPOIS=$(psql_q 'SELECT count(*) FROM categories;')
TX_DEPOIS=$(psql_q 'SELECT count(*) FROM transactions;')

echo "marcadores=$MARCADORES  (esperado: 0)"
echo "categorias=$CAT_DEPOIS  (esperado: $CAT_ANTES)"
echo "lancamentos=$TX_DEPOIS  (esperado: $TX_ANTES)"
echo

FALHOU=0
[ "$MARCADORES" = "0" ]        || { echo "FALHA: o marcador sobreviveu -- o dump NAO foi aplicado"; FALHOU=1; }
[ "$CAT_DEPOIS" = "$CAT_ANTES" ] || { echo "FALHA: contagem de categorias nao bate"; FALHOU=1; }
[ "$TX_DEPOIS" = "$TX_ANTES" ]   || { echo "FALHA: contagem de lancamentos nao bate"; FALHOU=1; }

if [ "$FALHOU" = "1" ]; then
    echo
    echo "RESULTADO: FALHOU -- este backup nao serve para restaurar."
    exit 1
fi

echo "RESULTADO: PASSOU -- backup restaurado e conferido."
