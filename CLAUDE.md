# nasFinance

Financas pessoais de um usuario so. Quarkus 3.38 / Java 21 + React 19 / TS / Vite 7 / Tailwind v4, Postgres 17.
Producao: VM Oracle (1 OCPU, 954 MiB) atras de Cloudflare Tunnel + Access. Entradas chegam por 3 caminhos:
tela, Atalho do iPhone (`POST /api/v1/quick-entry`) e Pluggy/Open Finance (sincronizacao diaria as 06:00).

Este diretorio e um repositorio git proprio, separado do `Projeto_NAS` que o contem.

## Regras de colaboracao — inegociaveis

1. **Servidor remoto: nunca execute nada**, nem leitura. Mostre o comando; o usuario roda e cola o resultado.
2. Comandos locais no Windows: pode rodar.
3. **PowerShell 5.1**: sem `&&` (use `;` ou linhas separadas). Mensagem multilinha so com here-string
   `@'...'@`, com o `'@` na coluna 0. Dentro do SSH (Ubuntu) `&&` funciona.
4. **Script para a VM vai como arquivo**, nunca colado: `cmd /c "ssh nasfinance-oracle bash -s < C:\caminho\script.sh"`.
   Here-string no PowerShell insere BOM na linha 1 e CR na ultima, e o exit code continua 0 — o script quebra calado.
   Arquivo com fim de linha LF. Em comando inline: aspas duplas por fora, simples por dentro, sem `\` e sem `\"`
   (o PowerShell corrompe os dois).
5. **Commits: o usuario executa.** Gere os comandos; muitos commits pequenos; Conventional Commits em ingles
   (siga `git log`); **sem linha `Co-Authored-By`**. Sempre `git add <paths>; git commit <paths> -m "..."` —
   o pathspec impede de levar junto o que estiver staged por outro motivo. Um comando por bloco.
6. Segredos nunca no chat. Nunca digite senha em lugar nenhum.
7. Afirme que algo compila/passa so com o exit code do proprio comando (`${PIPESTATUS[0]}`), nunca o de um `| tail`.

## Build e teste

- **Frontend** (`frontend/`): `npm run build` (tsc + vite). Dev: `npm run dev`, com `VITE_API_TARGET` apontando a API.
- **Backend** (`backend/`): JDK 25 no Windows, sem `JAVA_HOME` definido. Compilar e testar (segundos):
  `$env:JAVA_HOME = 'C:\Program Files\Java\jdk-25.0.2'; .\mvnw.cmd -B test` (PowerShell). O WSL nao tem JDK.
- Imagem de producao (roda os testes de novo): Docker so existe no WSL —
  `wsl -e bash -c "cd /mnt/c/Users/eduar/Documents/Projeto_NAS/docker/nasFinance && docker build -t nasfinance:latest ."`
- Deploy (detalhes em `DEPLOY.md`): build local -> `docker save | gzip` + `sha256sum` -> `scp` com caminho absoluto
  -> na VM `sha256sum -c` **antes** do `docker load` -> `compose up -d --force-recreate app`.

## Mapa

- `backend/.../nasfinance/`: `api` (resources, `dto`, `error`, `security`), `domain` (Panache active record),
  `service`, `pluggy` (cliente HTTP + `PluggyTranslator`, regras puras e testadas).
- `frontend/src/`: `pages`, `components` (`ui/` = primitivas), `hooks`, `lib/api.ts` (unico cliente HTTP).
- `scripts/`: backup, restore drill, diagnosticos da Pluggy. Docs: `DEPLOY.md`, `PLUGGY_SYNC.md`, `IPHONE_SHORTCUT.md`.

## Convencoes de codigo

- Comentario explica **por que**, em portugues. Java sem acento; TS/TSX com acento. Siga a densidade do arquivo.
- Leitura que toca relacao LAZY precisa de `@Transactional` (convencao em `TransactionService`).
- Config `String` opcional e `Optional<String>`: `${VAR:}` vira null e **impede o boot**.
- Text block do Java remove espaco no fim da linha — concatenar HQL depois dele gera `WHEREt`.
- Toda agregacao exclui ignorados: `Transaction.NOT_IGNORED` / `NOT_IGNORED_T`.
- Variavel de ambiente nova: declarar no `docker-compose.prod.yml` (o compose so repassa o que lista) e
  recriar o container (`--force-recreate`); env so e lida na criacao.
- Front: URLs relativas via `lib/api.ts`; cores so por token de `index.css`; alvo de toque >= 44 px;
  zero rolagem horizontal em 375 px. Acao da fila avisa a navegacao com o evento `REVIEW_CHANGED`.

## Armadilhas de dominio — cada uma ja custou caro

- **Direcao do dinheiro vem de `type` (DEBIT/CREDIT), nunca do sinal de `amount`.** O sinal inverte entre
  conta corrente e cartao. Errar nao gera erro: gera receita plausivel no lugar de despesa.
- Chave natural da importacao: `(conta, data UTC da Pluggy, valor, descricao, order)`. Id de transacao de
  cartao muda no fechamento da fatura. `occurredOn` e convertido para America/Sao_Paulo; a chave nao.
- Pagamento de fatura no cartao nao e receita; o debito correspondente na conta vira `POSSIBLE_TRANSFER`.
- Nunca funda duplicata nem aplique a categoria da Pluggy automaticamente: a maquina propoe, o usuario decide.
- **O item do Meu Pluggy e um proxy**: `PATCH /items/{id}` devolve 400 `MeuPluggy item cant be updated`.
  So o botao **Atualizar** em meu.pluggy.ai dispara coleta. A atualizacao automatica de 24h **nao aconteceu**
  (5 dias parado em out/2026, painel com ponto verde). Sync `SKIPPED` sem erro = cache da Pluggy sem nada novo.
- Pluggy: use `/v2/transactions` (cursor); `/transactions` devolve 410. O OpenAPI deles vale mais que a prosa.

## Seguranca e infra

- Access protege tudo; `/api/v1/quick-entry` tem aplicacao propria com **Service Auth** (nunca Bypass) e ainda
  exige `Authorization: Bearer <SHORTCUT_TOKEN>` (`@ShortcutSecured`). Fora isso nao ha autenticacao na
  aplicacao — o Access e a fronteira.
- VM: alias SSH `nasfinance-oracle`, app em `~/nasfinance`, banco em `/opt/nasfinance/postgres`. Containers
  `nasfinance-app` (512M), `nasfinance-db` (256M), `cloudflared`, na rede `nasfinance`, **sem porta publicada**.
  Inspecionar o app: `docker exec nasfinance-app wget -qO- http://localhost:8080/...`
- Backup 03:15 (cron) para bucket OCI, permissao sem delete. Restore drill: `scripts/restore-drill.sh`.

## Agentes (`.claude/agents/`)

- `ui-designer` — implementa e eleva a experiencia ao nivel de app de banco. Use para qualquer tela.
- `security-reviewer` — so leitura; rode antes de todo deploy e em toda mudanca de endpoint, auth ou infra.
- `ops` — escreve comandos e scripts para a VM; nao tem shell e nao executa nada.
