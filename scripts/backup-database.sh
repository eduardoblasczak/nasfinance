#!/usr/bin/env bash
# =============================================================
# nasFinance - backup diario do banco
# =============================================================
# Roda via cron, sem interacao humana. Dump logico (pg_dump)
# comprimido, com retencao automatica e verificacao de integridade
# do arquivo gerado.
#
# A checagem de integridade nao e paranoia gratuita: foi a falta
# dela que quase deixou passar uma imagem Docker corrompida durante
# o deploy do fix de acentuacao (rede WiFi do servidor derrubou bytes
# no meio da transferencia, e o "sucesso" aparente do scp escondeu
# isso). Aqui a mesma classe de falha e detectada antes de o backup
# ser considerado valido.
#
# Instalacao (rodar uma vez):
#   chmod +x ~/nasfinance/scripts/backup-database.sh
#   (crontab -l 2>/dev/null | grep -vF "backup-database.sh"; \
#    echo "15 3 * * * /home/eduardo/nasfinance/scripts/backup-database.sh >> /data/nasfinance/backups/cron.log 2>&1") \
#    | crontab -
# =============================================================

set -euo pipefail

CONTAINER="nasfinance-db"
DB_USER="nasfinance"
DB_NAME="nasfinance"
BACKUP_DIR="/data/nasfinance/backups"
RETENTION_DAYS=30
LOG_FILE="$BACKUP_DIR/backup.log"

DATE=$(date +%F_%H%M%S)
FILE="$BACKUP_DIR/nasfinance-$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

# Falha cedo e com mensagem clara se o container nao estiver de pe,
# em vez de um erro criptico de "connection refused" do pg_dump.
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    log "ERRO: container $CONTAINER nao esta rodando, backup abortado"
    exit 1
fi

log "Iniciando backup"

# --clean --if-exists inclui DROP antes de cada CREATE no dump: uma
# restauracao (docker exec -i ... psql) fica idempotente, sem precisar
# derrubar o banco manualmente antes.
if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" --clean --if-exists "$DB_NAME" \
        | gzip > "$FILE"; then
    log "ERRO: pg_dump ou gzip falhou"
    rm -f "$FILE"
    exit 1
fi

# Confirma que o .gz gerado nao esta truncado/corrompido antes de
# confiar nele como backup valido.
if ! gzip -t "$FILE"; then
    log "ERRO: arquivo de backup corrompido apos gerar -- $FILE"
    rm -f "$FILE"
    exit 1
fi

SIZE=$(du -h "$FILE" | cut -f1)
log "Backup OK: $FILE ($SIZE)"

# Retencao: apaga backups com mais de RETENTION_DAYS dias. Com uma
# base de financas pessoais (poucas centenas de linhas), cada dump
# comprimido fica na casa dos KB -- 30 dias de historico e irrelevante
# em disco, mas evita crescimento sem limite ao longo dos anos.
find "$BACKUP_DIR" -name 'nasfinance-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete >> "$LOG_FILE" 2>&1

log "Backup finalizado"
