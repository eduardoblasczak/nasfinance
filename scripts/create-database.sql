-- =============================================================
-- Criacao do banco local de desenvolvimento
-- =============================================================
-- Rode UMA VEZ, conectado como superusuario (postgres):
--
--   psql -U postgres -h localhost -p 5432 -f scripts/create-database.sql
--
-- As tabelas NAO sao criadas aqui: quem cuida disso e o Flyway, na
-- primeira subida da aplicacao. Este script so prepara usuario e bancos.
--
-- A senha abaixo vale apenas para a maquina local. No servidor, o usuario
-- e a senha vem do .env e nunca sao versionados.
-- =============================================================

-- Usuario da aplicacao (nao e superusuario: o app nao precisa disso)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nasfinance') THEN
        CREATE ROLE nasfinance WITH LOGIN PASSWORD 'nasfinance';
    END IF;
END
$$;

-- CREATE DATABASE nao funciona dentro de bloco DO (nao pode rodar em
-- transacao), entao usamos \gexec: a consulta gera o comando e o psql o executa
-- apenas quando o banco ainda nao existe.
SELECT 'CREATE DATABASE nasfinance OWNER nasfinance'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'nasfinance')
\gexec

SELECT 'CREATE DATABASE nasfinance_test OWNER nasfinance'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'nasfinance_test')
\gexec

\echo ''
\echo '=== Bancos criados ==='
\echo 'nasfinance       -> desenvolvimento'
\echo 'nasfinance_test  -> testes automatizados'
\echo 'usuario/senha    -> nasfinance / nasfinance (somente local)'
