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
#    echo "15 3 * * * OCI_BUCKET=nasfinance-backups /home/ubuntu/nasfinance/scripts/backup-database.sh >> /opt/nasfinance/backups/cron.log 2>&1") \
#    | crontab -
# =============================================================

set -euo pipefail

CONTAINER="nasfinance-db"
DB_USER="nasfinance"
DB_NAME="nasfinance"
BACKUP_DIR="/opt/nasfinance/backups"
RETENTION_DAYS=30
LOG_FILE="$BACKUP_DIR/backup.log"

# Bucket do Object Storage da Oracle. Vazio = so backup local.
#
# Dump no mesmo disco do banco NAO e backup: se o disco falhar, os dois
# somem juntos. Foi assim que o banco do Draft se perdeu. A copia remota
# e o que torna isto um backup de verdade; a copia local so serve para
# restauracao rapida.
#
# A autenticacao usa INSTANCE PRINCIPAL: a VM se identifica pela propria
# identidade na Oracle, entao nao ha chave de API nem token em disco, e
# nada que expire em silencio.
OCI_BUCKET="${OCI_BUCKET:-}"

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
log "Backup local OK: $FILE ($SIZE)"

# ---------------------------------------------------------------
# Copia remota (Object Storage da Oracle)
# ---------------------------------------------------------------
# So aqui o dump vira backup de verdade. Falha no envio NAO apaga o
# arquivo local nem derruba o script com erro silencioso: fica registrada
# no log e o script sai com codigo != 0, para o cron conseguir notar.
UPLOAD_FAILED=0

# Resolve o binario da OCI CLI por caminho absoluto.
#
# O cron roda com PATH minimo (tipicamente /usr/bin:/bin) e NAO le o
# ~/.bashrc — que e justamente onde o instalador da Oracle acrescenta
# ~/bin ao PATH. Um `command -v oci` puro, portanto, funciona quando voce
# testa a mao pelo SSH e falha silenciosamente as 3h15 da manha, deixando
# o backup so no disco do proprio banco todas as noites.
OCI_FROM_PATH="$(command -v oci 2>/dev/null || true)"
OCI_BIN="${OCI_BIN:-}"
if [ -z "$OCI_BIN" ]; then
    for candidate in "$OCI_FROM_PATH" "$HOME/bin/oci" "/usr/local/bin/oci"; do
        if [ -n "$candidate" ] && [ -x "$candidate" ]; then
            OCI_BIN="$candidate"
            break
        fi
    done
fi

if [ -n "$OCI_BUCKET" ]; then
    if [ -z "$OCI_BIN" ]; then
        log "ERRO: OCI CLI nao encontrada (tentei PATH, ~/bin/oci, /usr/local/bin/oci) -- backup existe apenas localmente"
        UPLOAD_FAILED=1
    elif "$OCI_BIN" os object put \
            --auth instance_principal \
            --bucket-name "$OCI_BUCKET" \
            --file "$FILE" \
            --name "nasfinance/$(basename "$FILE")" \
            --force >/dev/null 2>>"$LOG_FILE"; then
        log "Enviado para o Object Storage: $OCI_BUCKET/nasfinance/$(basename "$FILE")"
    else
        log "ERRO: envio para o Object Storage falhou -- backup existe apenas localmente"
        UPLOAD_FAILED=1
    fi
else
    log "AVISO: OCI_BUCKET nao configurado -- backup existe apenas localmente"
    UPLOAD_FAILED=1
fi

# Retencao LOCAL: apaga dumps com mais de RETENTION_DAYS dias. Com uma
# base de financas pessoais (poucas centenas de linhas), cada dump
# comprimido fica na casa dos KB -- 30 dias e irrelevante em disco, mas
# evita crescimento sem limite ao longo dos anos.
#
# A retencao REMOTA nao e feita aqui: configure uma lifecycle policy no
# bucket. Deixar o script apagar objetos remotos significaria dar a ele
# permissao de delete, e um backup nao deveria ter como destruir os
# proprios backups.
find "$BACKUP_DIR" -name 'nasfinance-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete >> "$LOG_FILE" 2>&1

if [ "$UPLOAD_FAILED" = "1" ]; then
    log "Backup finalizado COM FALHA no envio remoto"
    exit 1
fi

log "Backup finalizado"
