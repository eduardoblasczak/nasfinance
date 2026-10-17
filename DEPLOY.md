# Deploy na Oracle Cloud

Alvo: VM `nasfinance` na Oracle Cloud (sa-saopaulo-1), Ubuntu 24.04 LTS,
shape `VM.Standard.E2.1.Micro` — 1 OCPU, 954 MiB de RAM, 2 GB de swap,
46,6 GB de disco. Always Free.

Exposicao **sempre** via Cloudflare Tunnel, com Cloudflare Access na frente.
Nenhuma porta publicada: nem no host, nem no roteador.

> **Historico.** Ate setembro de 2026 isto rodava no `nas-server` (notebook
> reaproveitado em casa, 3,2 GB de RAM). Ele parou de dar boot em definitivo.
> O que mudou na migracao esta marcado com **[Oracle]** ao longo do texto —
> vale ler esses trechos antes de reaproveitar qualquer comando antigo.

Acesso (alias ja configurado em `~/.ssh/config` na maquina de dev):

```bash
ssh nasfinance-oracle
```

---

## 1. Provisionar a VM (uma vez)

**Swap.** A imagem da Oracle vem **sem swap**. Numa maquina de 1 GB rodando
JVM, isso significa que o kernel nao tem para onde correr sob pressao: ele
mata o processo em vez de paginar.

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
```

> `swappiness=10` e nao o padrao 60: paginar o heap da JVM trava a tela por
> segundos. Com 10 o kernel prefere descartar cache de disco, e o swap fica
> como rede de seguranca contra o OOM killer — nao como parte da operacao
> normal.

**Docker**, pelo repositorio oficial (nao pelo `get.docker.com`: o
repositorio deixa auditavel o que entra no sistema):

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

> O `usermod` so vale em **nova sessao**. Saia e reconecte, senao `docker ps`
> responde "permission denied" e parece que a instalacao falhou.

**Diretorios de dados.** **[Oracle]** Aqui ha um disco so, entao tudo fica
em `/opt/nasfinance` (no `nas-server` era `/data`, uma particao separada):

```bash
sudo mkdir -p /opt/nasfinance/postgres /opt/nasfinance/backups
sudo chown 70:70 /opt/nasfinance/postgres && sudo chmod 700 /opt/nasfinance/postgres
sudo chown ubuntu:ubuntu /opt/nasfinance/backups
```

> UID/GID **70** e o usuario `postgres` dentro da imagem alpine. Sem esse
> `chown`, o container sobe e morre no `initdb` com "permission denied".

Conferir:

```bash
free -h && docker --version && docker compose version && ls -ln /opt/nasfinance
```

---

## 2. Construir a imagem **na maquina de dev**

**[Oracle] Esta e a mudanca mais importante do roteiro.** Antes a build
acontecia no proprio servidor. Nao da mais: uma build Maven + Node nao cabe
em 1 OCPU e 954 MiB. A imagem e construida localmente e enviada pronta.

Na maquina Windows (Docker roda no WSL — ver `docker-desktop-quebrado-windows`):

```bash
wsl -e bash -c "cd /mnt/c/Users/eduar/Documents/Projeto_NAS/docker/nasFinance && docker build -t nasfinance:latest ."
```

> **Confira a tag.** O compose de producao referencia `nasfinance:latest`.
> Ja aconteceu de existir tambem um `nasfinance-app:latest` mais recente e a
> imagem antiga ir para producao sem ninguem notar.

Verifique que a imagem tem mesmo o codigo atual — data de criacao nao prova
nada, porque o Docker preserva o mtime dos arquivos em camadas de cache. O
que prova e o **conteudo**:

```bash
wsl -e bash -c "cid=\$(docker create nasfinance:latest); docker cp \$cid:/app/app/nasfinance-1.0.0-SNAPSHOT.jar /tmp/app.jar; docker rm -f \$cid; python3 -c \"
import zipfile
z = zipfile.ZipFile('/tmp/app.jar')
for n in [x for x in z.namelist() if x.endswith('.css')]:
    print(n, len(z.read(n)))
\""
```

Empacotar com checksum:

```bash
wsl -e bash -c "cd /mnt/c/Users/eduar/Documents/Projeto_NAS/docker/nasFinance && docker save nasfinance:latest | gzip -1 > nasfinance-image.tar.gz && sha256sum nasfinance-image.tar.gz"
```

```bash
tar -czf nasfinance-deploy.tar.gz docker-compose.prod.yml Dockerfile cloudflared/docker-compose.yml cloudflared/.env.example scripts/backup-database.sh
```

---

## 3. Enviar e carregar

```bash
scp nasfinance-image.tar.gz nasfinance-deploy.tar.gz nasfinance-oracle:/tmp/
```

**Conferir o checksum ANTES de carregar.** Isto nao e zelo excessivo: uma
transferencia truncada ja passou despercebida neste projeto porque o
`docker load` falhou, o `compose up` seguinte subiu feliz com a imagem
**antiga**, e o deploy pareceu bem-sucedido.

```bash
ssh nasfinance-oracle "echo '<SHA256>  /tmp/nasfinance-image.tar.gz' | sha256sum -c -"
```

So com `OK`:

```bash
ssh nasfinance-oracle "mkdir -p ~/nasfinance && tar -xzf /tmp/nasfinance-deploy.tar.gz -C ~/nasfinance && gunzip -c /tmp/nasfinance-image.tar.gz | docker load"
```

---

## 4. Preparar o `.env`

```bash
cd ~/nasfinance && nano .env
```

| Variavel | Observacao |
|---|---|
| `DB_NAME` | `nasfinance` |
| `DB_USER` | `nasfinance` |
| `DB_PASSWORD` | pode ser novo — o banco nasce vazio nesta VM |
| `SHORTCUT_TOKEN` | **reutilize o valor antigo**, do gerenciador de senhas |
| `APP_TIMEZONE` | `America/Sao_Paulo` |

> **O `SHORTCUT_TOKEN` tem de ser o mesmo de antes.** Token novo quebra o
> atalho do iPhone, que teria de ser editado no celular. A senha do banco,
> essa pode mudar a vontade.

Para gerar valores novos, se for o caso:

```bash
echo "DB_PASSWORD=$(openssl rand -base64 24)"; echo "SHORTCUT_TOKEN=$(openssl rand -hex 32)"
```

> A aplicacao **recusa subir** se `SHORTCUT_TOKEN` for o valor de
> desenvolvimento ou tiver menos de 24 caracteres. E proposital: um token
> fraco aqui deixaria qualquer pessoa lancar transacoes.

---

## 5. Subir a aplicacao

**[Oracle]** Sem `--build` — a imagem ja veio pronta:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

**[Oracle] Verificacao de saude.** Nao existe mais porta publicada, entao
`curl` no host **nao funciona** — nem em `127.0.0.1`, nem em `172.17.0.1`.
O jeito de falar com o app e entrar na rede dele:

```bash
docker run --rm --network nasfinance curlimages/curl -s http://nasfinance-app:8080/q/health/ready
```

> Isso elimina de vez a confusao entre `127.0.0.1` e `172.17.0.1` que
> consumiu tempo no `nas-server`: la a porta era publicada em `docker0`
> para o `cloudflared` alcancar, e um `curl` no endereco errado respondia
> `000` mesmo com o app perfeitamente saudavel.

O `start_period` do healthcheck e de **120s**. Com 1 OCPU, 60s nao bastam
para a JVM subir, e o `restart: unless-stopped` entraria num laco de
reinicio — sintoma que parece crash, mas e so impaciencia.

---

## 6. Expor pelo Cloudflare Tunnel

**[Oracle]** O `cloudflared` agora roda **em container, na mesma rede do
app**, e o alcanca pelo nome. Antes era um servico no host apontando para
uma porta publicada.

**A ordem importa.** As duas aplicacoes do Cloudflare Access precisam existir
**antes** de o hostname passar a resolver. A janela entre uma coisa e outra e
exatamente o tempo em que `financas.ebls.com.br` fica aberto para quem souber
o endereco.

As duas aplicacoes, em **Access controls → Applications**:

| Aplicacao | Destino | Politica |
|---|---|---|
| `financas` | `financas.ebls.com.br` | `Allow` — somente o e-mail do dono |
| `financas - atalho iphone` | `financas.ebls.com.br/api/v1/quick-entry` | **`Service Auth`** |

> **`Service Auth`, nunca `Bypass`.** `Bypass` desliga todos os controles e
> nao registra nada no log. `Service Auth` exige o par de token de servico e
> deixa rastro. A interface da Cloudflare ja gravou `Block` no lugar de
> `Service Auth` ao ser operada rapido — confira o valor depois de salvar.

Criar o tunel em **Networks → Tunnels & Mesh → Create a tunnel →
Cloudflared**, nome `nasfinance-oracle`, conector **Docker**. Copie do
comando exibido apenas a parte depois de `--token`.

Public hostname:

| Campo | Valor |
|---|---|
| Subdominio | `financas` |
| Dominio | `ebls.com.br` |
| Path | *(vazio)* |
| Servico | `HTTP` |
| URL | `nasfinance-app:8080` |

Subir o conector:

```bash
cd ~/nasfinance/cloudflared && cp .env.example .env && nano .env   # cole o TUNNEL_TOKEN
docker compose --env-file .env up -d && docker logs -f cloudflared
```

> **Se o tunel antigo ainda reivindicar o hostname**, remova a rota dele
> primeiro (`nas-server-tunnel → Published application routes`). Dois tuneis
> nao dividem o mesmo hostname — ou o novo falha, ou o DNS continua apontando
> para um conector que nunca mais vai responder.

> **SSE atraves do tunel:** o canal de tempo real envia um heartbeat a cada
> 25 segundos, abaixo do timeout de ocioso da Cloudflare. Se o dashboard
> mostrar "Offline" depois de alguns minutos, e aqui que se investiga.

---

## 7. Atalho do iPhone

Detalhes completos em [`IPHONE_SHORTCUT.md`](IPHONE_SHORTCUT.md). Resumo:

- **URL:** `https://financas.ebls.com.br/api/v1/quick-entry`
- **Metodo:** `POST`
- **Cabecalhos:** `CF-Access-Client-Id`, `CF-Access-Client-Secret` (token de
  servico do Access) e `Authorization: Bearer <SHORTCUT_TOKEN>`
- **Corpo:** JSON com `amount`, `category`, `account`

Nomes de conta e categoria sao comparados **sem acento e sem diferenciar
maiusculas** — "Vale Refeicao", "vale refeição" e "VALE REFEIÇÃO" casam com
o mesmo registro.

Conferir os nomes validos:

```bash
curl -s -H "Authorization: Bearer <TOKEN>" -H "CF-Access-Client-Id: <ID>" -H "CF-Access-Client-Secret: <SECRET>" https://financas.ebls.com.br/api/v1/quick-entry/options
```

---

## Manutencao

### Backup do banco

O dump no mesmo disco do banco **nao e backup**: se o disco falhar, os dois
somem juntos. Foi assim que o banco do Draft se perdeu. A copia remota e o
que torna isto um backup de verdade; a local so serve para restauracao
rapida.

**[Oracle]** `scripts/backup-database.sh` envia o dump para o **Object
Storage** da Oracle usando **Instance Principal** — a VM se identifica pela
propria identidade, entao nao ha chave de API nem token em disco, e nada que
expire em silencio.

Pre-requisitos, uma vez, no console da Oracle:

1. Bucket no Object Storage (ex.: `nasfinance-backups`).
2. **Dynamic Group** com a regra `instance.id = '<OCID da VM nasfinance>'`.
3. **IAM Policy**: `allow dynamic-group <nome> to manage objects in tenancy where target.bucket.name = 'nasfinance-backups'`.
4. OCI CLI na VM: `bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"`.

Instalar o cron:

```bash
chmod +x ~/nasfinance/scripts/backup-database.sh
(crontab -l 2>/dev/null | grep -vF "backup-database.sh"; \
 echo "15 3 * * * OCI_BUCKET=nasfinance-backups /home/ubuntu/nasfinance/scripts/backup-database.sh >> /opt/nasfinance/backups/cron.log 2>&1") \
 | crontab -
```

Testar sem esperar a madrugada:

```bash
OCI_BUCKET=nasfinance-backups ~/nasfinance/scripts/backup-database.sh; echo "exit=$?"; tail -5 /opt/nasfinance/backups/backup.log
```

> O script **sai com codigo diferente de zero** se o envio remoto falhar,
> mesmo com o dump local tendo dado certo. Um backup que existe so na mesma
> maquina do banco nao conta como sucesso.

> A retencao **remota** nao e feita pelo script, de proposito: configure uma
> lifecycle policy no bucket. Deixar o script apagar objetos remotos exigiria
> dar a ele permissao de delete, e um backup nao deveria ter como destruir os
> proprios backups. A retencao local e de 30 dias.

**Restaurar.** O dump usa `--clean --if-exists`, entao e seguro rodar contra
um banco que ja tem dados — ele derruba e recria as tabelas antes de
repopular.

**Pare a aplicacao antes.** O `--clean` executa `DROP TABLE`, e a JVM mantem
um pool de conexoes abertas: com o app no ar, o DROP fica esperando as
conexoes ou falha, e a restauracao termina pela metade — estado pior do que
o inicial.

```bash
cd ~/nasfinance && docker compose -f docker-compose.prod.yml --env-file .env stop app
```

```bash
gunzip -c /opt/nasfinance/backups/nasfinance-<DATA>.sql.gz | docker exec -i nasfinance-db psql -U nasfinance -d nasfinance
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env start app
```

> **Backup nao testado nao e backup.** Depois de instalar o cron, faca pelo
> menos uma restauracao de verdade e confira a contagem de lancamentos antes
> e depois.

### Atualizar apos mudanca de codigo

Repita as secoes 2 e 3 (build local, checksum, `docker load`) e entao:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate
```

### Memoria

```bash
docker stats --no-stream nasfinance-app nasfinance-db cloudflared
free -h
```

Referencia medida nesta VM: app ~184 MiB, banco ~31 MiB, cloudflared ~30 MiB.
Os limites do compose (512M / 256M / 128M) ficam bem acima disso de proposito
— limite e contencao de vazamento, nao dimensionamento do uso normal.
