# Deploy no nas-server

> **Status: ainda nao executado.** Este documento e o roteiro planejado.
> Valide localmente antes (`docker compose up --build` no WSL).

Alvo: Ubuntu 26.04, 3,2 GB RAM + 4 GB swap, rede WiFi. Exposicao **sempre**
via Cloudflare Tunnel — nunca porta aberta no roteador.

---

## 1. Confirmar a porta livre

**Antes de qualquer coisa.** A escolha de `8092` e provisoria; `8090` e do
Draft e `8091` do wake-api.

```bash
sudo ss -tulpn | grep -w 8092
```

Sem saida = livre. Se estiver ocupada, escolha outra e ajuste `APP_PORT` no
`.env`.

---

## 2. Empacotar e enviar

Enquanto o projeto ainda estiver sendo ajustado, o codigo vai por `tar` +
`scp`, nao por `git push`. Na maquina Windows, a partir da raiz do projeto:

```bash
tar --exclude=node_modules --exclude=target --exclude=.git --exclude=dist -czf nasfinance.tar.gz .
```

```bash
scp nasfinance.tar.gz usuario@nas-server:/tmp/
```

No servidor:

```bash
mkdir -p ~/nasfinance && tar -xzf /tmp/nasfinance.tar.gz -C ~/nasfinance && cd ~/nasfinance
```

---

## 3. Preparar o .env e o diretorio de dados

```bash
cp .env.prod.example .env
```

Gere os segredos e cole no `.env` (`nano .env`):

```bash
echo "DB_PASSWORD=$(openssl rand -base64 24)"; echo "SHORTCUT_TOKEN=$(openssl rand -hex 32)"
```

> A aplicacao **recusa subir** se `SHORTCUT_TOKEN` for o valor de
> desenvolvimento ou tiver menos de 24 caracteres. Isso e proposital: um token
> fraco aqui deixaria qualquer pessoa lancar transacoes.

O banco fica em `/data` (175 G livres), nao em `/` (30 G, onde vive o Docker):

```bash
sudo mkdir -p /data/nasfinance/postgres && sudo chown -R 70:70 /data/nasfinance/postgres
```

> UID/GID 70 e o usuario `postgres` dentro da imagem alpine.

---

## 4. Build por estagio

A build inteira de uma vez, com WiFi instavel, falha sem indicar onde. Rode
estagio a estagio para isolar o problema. **Desacoplado do SSH** — uma queda
de sessao nao pode matar a build:

```bash
nohup docker build --target frontend-build -t nasfinance:stage-frontend . > /tmp/build-frontend.log 2>&1 &
```

Acompanhe com `tail -f /tmp/build-frontend.log`. Se passar:

```bash
nohup docker build --target backend-build -t nasfinance:stage-backend . > /tmp/build-backend.log 2>&1 &
```

E entao a imagem final:

```bash
nohup docker build -t nasfinance:latest . > /tmp/build-final.log 2>&1 &
```

---

## 5. Subir

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Verifique que o Flyway criou o schema e o app ficou saudavel:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

```bash
curl -s http://172.17.0.1:8092/q/health/ready
```

> **172.17.0.1, nao 127.0.0.1.** A porta e publicada na interface `docker0`
> (ver o comentario em `docker-compose.prod.yml`), porque o `cloudflared`
> roda em container e nao alcancaria uma porta presa na loopback do host.
> Consequencia pratica: `curl` em `127.0.0.1:8092` responde `000` (conexao
> recusada) mesmo com o app perfeitamente saudavel — o endereco e que esta
> errado, nao o container.

---

## 6. Expor pelo Cloudflare Tunnel

No painel Zero Trust, criar um **Public Hostname**:

| Campo | Valor |
|---|---|
| Subdominio | `financas` |
| Dominio | `ebls.com.br` |
| Servico | `HTTP` |
| URL | `172.17.0.1:8092` |

`172.17.0.1` e o gateway da bridge padrao do Docker, por onde o `cloudflared`
alcanca a porta publicada na loopback do host.

> **SSE atraves do tunel:** o canal de tempo real envia um heartbeat a cada 25
> segundos, abaixo do timeout de ocioso do Cloudflare. Se o dashboard mostrar
> "Offline" apos alguns minutos, e aqui que se investiga.

---

## 7. Atalho do iPhone

Novo atalho com a acao **Obter conteudo de URL**:

- **URL:** `https://financas.ebls.com.br/api/v1/quick-entry`
- **Metodo:** `POST`
- **Cabecalho:** `Authorization` = `Bearer <SHORTCUT_TOKEN do .env>`
- **Corpo:** JSON com `amount`, `category`, `account`

Use *Pedir Entrada* para o valor e *Escolher em Menu* para categoria e conta —
menu evita erro de digitacao, que o backend rejeitaria com `422`.

Para conferir os nomes validos:

```bash
curl -s -H "Authorization: Bearer <TOKEN>" https://financas.ebls.com.br/api/v1/quick-entry/options
```

---

## Manutencao

### Backup do banco

O volume em `/data` nao e backup — um `DROP` acidental ou disco corrompido
o acompanha. `scripts/backup-database.sh` roda via cron: dump diario
comprimido, com verificacao de integridade do `.gz` gerado e retencao de
30 dias.

**Instalar (uma vez):**

```bash
scp scripts/backup-database.sh usuario@nas-server:~/nasfinance/scripts/
```

```bash
chmod +x ~/nasfinance/scripts/backup-database.sh
(crontab -l 2>/dev/null | grep -vF "backup-database.sh"; \
 echo "15 3 * * * /home/eduardo/nasfinance/scripts/backup-database.sh >> /data/nasfinance/backups/cron.log 2>&1") \
 | crontab -
```

**Testar manualmente** (sem esperar o cron rodar de madrugada):

```bash
~/nasfinance/scripts/backup-database.sh && tail -5 /data/nasfinance/backups/backup.log
```

**Restaurar** um backup (o dump usa `--clean --if-exists`, entao e seguro
rodar contra um banco que ja tem dados — ele derruba e recria as tabelas
antes de repopular):

```bash
gunzip -c /data/nasfinance/backups/nasfinance-2026-09-01_031500.sql.gz \
  | docker exec -i nasfinance-db psql -U nasfinance -d nasfinance
```

Atualizar apos mudanca de codigo:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Uso de memoria dos containers:

```bash
docker stats --no-stream nasfinance-app nasfinance-db
```
