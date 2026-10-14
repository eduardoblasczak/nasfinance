-- =============================================================
-- V4 — lancamentos ignorados
-- =============================================================
-- Necessario por um problema que so apareceu ao implementar a fila de
-- revisao: APAGAR um lancamento importado nao resolve nada. A chave
-- natural que impede a reimportacao sai do banco junto com ele, e a
-- proxima sincronizacao — que relê uma janela de 90 dias toda noite —
-- traz o mesmo gasto de volta.
--
-- O caso concreto e o pagamento da fatura do cartao visto na conta
-- corrente: nao e despesa (as compras ja entraram uma a uma), mas
-- tambem nao pode simplesmente sumir.
--
-- IGNORED resolve os dois lados: a linha permanece, segurando a chave,
-- e sai de todos os totais.
-- =============================================================

ALTER TABLE transactions
    DROP CONSTRAINT ck_transactions_review_status;

ALTER TABLE transactions
    ADD CONSTRAINT ck_transactions_review_status CHECK (review_status IN
        ('NONE', 'PENDING', 'DISMISSED', 'IGNORED'));

COMMENT ON COLUMN transactions.review_status IS
    'PENDING = aguarda decisao; DISMISSED = avaliado e mantido; IGNORED = existe para segurar a chave de deduplicacao, mas nao entra em nenhum total';

-- Toda agregacao de valores filtra por review_status <> 'IGNORED'. Este
-- indice parcial cobre o caminho inverso: listar o que foi ignorado,
-- para quem quiser conferir o que ficou de fora.
CREATE INDEX idx_transactions_ignored
    ON transactions (occurred_on DESC)
    WHERE review_status = 'IGNORED';
