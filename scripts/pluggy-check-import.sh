#!/usr/bin/env bash
# =============================================================
# nasFinance - conferencia da importacao da Pluggy
# =============================================================
# Somente LEITURA. Mostra o que a sincronizacao fez, no formato em que
# da para comparar com a saida do pluggy-explore.sh.
#
# A pergunta que ele responde e uma so: os sinais entraram certos?
# Um lancamento invertido continua parecendo plausivel na tela -- R$
# 51,85 de receita nao parece mais errado que R$ 51,85 de despesa --
# entao a conferencia precisa ser contra o extrato, nao contra o bom
# senso.
#
# Uso (na VM):
#   bash ~/nasfinance/scripts/pluggy-check-import.sh
# =============================================================

set -euo pipefail

PSQL="docker exec nasfinance-db psql -U nasfinance -d nasfinance"

echo "== Execucoes da sincronizacao =="
$PSQL -c "SELECT id, status, window_from, window_to, imported, skipped, flagged,
                 COALESCE(error, '-') AS erro
          FROM pluggy_sync_runs
          ORDER BY id DESC
          LIMIT 5;"

echo
echo "== Contas vinculadas =="
$PSQL -c "SELECT l.pluggy_type, l.pluggy_name, a.name AS conta_local
          FROM pluggy_account_links l
          JOIN accounts a ON a.id = l.account_id
          ORDER BY l.pluggy_type;"

echo
echo "== O que foi importado =="
# Agrupado por conta e fluxo: e assim que da para bater com o extrato,
# e e aqui que um sinal invertido aparece como uma receita que voce
# sabe que nao existiu.
$PSQL -c "SELECT a.name AS conta, t.flow, count(*) AS qtd, sum(t.amount) AS total
          FROM transactions t
          JOIN accounts a ON a.id = t.account_id
          WHERE t.source = 'AGGREGATOR'
          GROUP BY a.name, t.flow
          ORDER BY a.name, t.flow;"

echo
echo "== Linha a linha =="
$PSQL -c "SELECT t.occurred_on AS data,
                 a.name AS conta,
                 t.flow,
                 t.amount,
                 left(t.description, 26) AS descricao,
                 COALESCE(c.name, '-') AS categoria,
                 t.review_status AS revisao
          FROM transactions t
          JOIN accounts a ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.source = 'AGGREGATOR'
          ORDER BY t.occurred_on DESC, t.id;"

echo
echo "== Fila de revisao =="
$PSQL -c "SELECT review_reason, count(*)
          FROM transactions
          WHERE review_status = 'PENDING'
          GROUP BY review_reason;"

echo
echo "== Chaves duplicadas? (deve ser vazio) =="
# O indice unico parcial ja impede, mas conferir custa nada e prova
# que a chave natural esta mesmo sendo gravada.
$PSQL -c "SELECT external_id, count(*)
          FROM transactions
          WHERE source = 'AGGREGATOR'
          GROUP BY external_id
          HAVING count(*) > 1;"

echo
echo "== Totais do mes (o que o dashboard mostra) =="
$PSQL -c "SELECT flow, sum(amount) AS total, count(*) AS qtd
          FROM transactions
          WHERE occurred_on >= date_trunc('month', CURRENT_DATE)
            AND review_status <> 'IGNORED'
          GROUP BY flow;"
