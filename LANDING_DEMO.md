# Página pública e demonstração ao vivo — proposta

> **Status: no ar.** Fases 1, 2, 3, 4 e 6 prontas; falta o Atalho de demonstração (5).
> Revisão 2 (17/10/2026): **sem Java e sem custo.** A primeira versão rodava o
> backend Quarkus no Cloudflare Containers (US$ 5/mês); foi descartada. Limites
> do plano gratuito conferidos em 17/10/2026 (fontes no fim).

Uma página pública em `nasfinance.ebls.com.br`, fora do Cloudflare Access, para
dois públicos: **recrutadores**, que querem ver julgamento de engenharia, e
**curiosos e entusiastas** de alternativas às grandes empresas de finanças e
tecnologia, que querem ver um software pessoal funcionando de verdade.

O centro é uma demonstração ao vivo: a pessoa copia os parâmetros da API do
Atalho, faz um `POST` pelo Postman, pelo curl, pelo iPhone ou pela própria
página — e o valor aparece na hora, para todo mundo que estiver olhando. Ao
lado, o **app de verdade** para navegar, com dados fictícios.

---

## 1. O que a realidade impõe

### 1.1 O app real não tem login — a fronteira é o Access

A aplicação não tem autenticação própria: quem protege `/api/v1/*` é o
Cloudflare Access. Um hostname público apontando para a produção exporia
saldos, extratos e o painel da Pluggy.

**Consequência:** a demo não tem nenhum caminho até a VM, o túnel ou o banco
real. Nem um proxy, nem um segredo compartilhado.

### 1.2 O plano gratuito da Cloudflare cobre tudo

| Recurso | Limite gratuito | Uso previsto |
|---|---|---|
| Arquivos estáticos (landing e app) | **sem limite**, sem custo | toda visita |
| Worker (a API da demo) | 100 mil requisições/dia, 10 ms de CPU cada | só chamadas de API |
| Durable Object (o estado compartilhado) | 100 mil requisições/dia, 13.000 GB-s/dia, SQLite de 1 GB, 30 s de CPU por requisição | um único objeto |
| SQLite do Durable Object: linhas lidas | **5 milhões/dia** | ~0 por requisição; até ~30 depois de uma escrita (lançamentos de visitante); ~1,5 mil no reseed diário |
| SQLite do Durable Object: linhas gravadas | **100 mil/dia** (exclusão e `setAlarm` contam) | ~2,9 mil no reseed diário (~730 linhas + índices) e ~8 por lançamento de visitante (insert e índices, depois o delete da expiração e o alarme) |

Um objeto de 128 MB acordado 24 h consome 10.800 GB-s: cabe no limite mesmo no
pior caso.

As cotas de linhas são as que mais apertam: no plano gratuito, estourar
qualquer uma faz a operação falhar até 00:00 UTC (fonte: página de preços dos
Durable Objects, nov/2026). Por isso a leitura não passa pelo SQLite: o
histórico fictício do dia (13 meses, ~730 linhas) vive em memória no objeto e
toda agregação — dashboard, lançamentos, revisão, saldos, Análises — é feita
em JavaScript sobre ele mais os lançamentos de visitante (teto de 30), que só
são relidos depois de uma escrita (`src/store.ts`). Medido no `wrangler dev`
contando `rowsRead` de cada cursor: o dashboard de 3 anos lia 7.225 linhas por
chamada, e agora lê 0. Ao acordar, o objeto regera o histórico do dia sem ler a
tabela (lê 2 linhas do `meta`); o reseed diário — ~730 inserts numa transação —
levou ~0,45 s de ponta a ponta no `wrangler dev`, contra ~25 ms de uma
requisição comum, longe dos 30 s de CPU.

**E o plano gratuito não cobra excedente — ele para.** Se alguém esgotar a
cota, a API da demo fica fora até 00:00 UTC; a landing e o app continuam
abrindo (arquivo estático não conta), e a página diz "a demonstração esgotou
por hoje". Não existe fatura surpresa possível.

### 1.3 Espelho fiel sem rodar Java

O que o visitante vê e toca é a interface; é ela que precisa ser a real. A
regra de negócio do backend (importação da Pluggy, conciliação, migrações) não
aparece numa demo.

**Consequência:** a interface da demo é **o próprio frontend do app**, do mesmo
repositório, compilado em modo demonstração. Só a API é reimplementada — em
TypeScript, num Worker, com o mesmo contrato JSON. Os tipos vêm do mesmo
`frontend/src/types.ts`: se o contrato do app real mudar, o espelho **deixa de
compilar** em vez de divergir calado.

### 1.4 O contrato do Atalho aceita texto livre

`QuickEntryRequest` tem `description` (até 200 caracteres) e `occurredOn`.
Num feed ao vivo e público, texto livre vira pichação em minutos, e uma data
arbitrária faz o lançamento sumir da tela.

**Consequência:** na demo, só passam valor, categoria, conta e direção, e
categoria e conta vêm de uma lista fixa. O que ficou de fora é dito na página.

### 1.5 "Roda localmente" deixou de ser verdade

O app real roda numa VM da **Oracle Cloud**; o tráfego passa pela
**Cloudflare**, que termina o TLS na borda; os dados bancários passam pela
**Pluggy**. A página de segurança (3.3) diz só o que é verdade.

---

## 2. Arquitetura

```
                          nasfinance.ebls.com.br  — um Worker, um hostname
                         ┌──────────────────────────────────────────────────┐
 navegador ──────────────► /            landing        (estático, grátis)    │
 navegador ──────────────► /app/...     o app REAL     (estático, grátis)    │
 Postman / curl / iPhone ► /api/v1/...  a API espelho  (Worker)  ──┐        │
                         └──────────────────────────────────────────┼───────┘
                                                                     ▼
                                     Durable Object "demo" — instância única
                                     SQLite: contas, categorias, lançamentos
                                     conexões SSE abertas · alarme de limpeza

        ✕ nenhum caminho até a VM, o túnel, o Access ou o banco de produção
```

Mesma origem para tudo: sem CORS, e a URL que o visitante copia —
`https://nasfinance.ebls.com.br/api/v1/quick-entry` — tem o mesmo caminho da produção.

### 2.1 O app real em modo demonstração

Mudanças pequenas no frontend, todas desligadas no build de produção:

| Mudança | Para quê |
|---|---|
| `base` do Vite e `basename` do router vindos de `VITE_BASE` (padrão `/`) | servir o mesmo app em `/app/` |
| `VITE_DEMO=true` | faixa "Demonstração — dados fictícios"; esconde editar, excluir e configurar |
| nada mais | o hook de tempo real já usa `/api/v1/events/stream`, que o Worker implementa |

O botão **+** do próprio app continua funcionando na demo, com as mesmas regras
do Atalho (seção 2.3): é outra porta de entrada para o mesmo feed ao vivo.

### 2.2 A API espelho

O Worker implementa, com as mesmas formas de JSON dos DTOs Java:

| Rota | Na demo |
|---|---|
| `GET` dashboard, lançamentos, contas, categorias, revisão, status da Pluggy | dados fictícios, com o histórico do dia em memória mais os lançamentos de visitante; tudo agregado em JS, com as mesmas regras do `DashboardService` |
| `GET /api/v1/analytics/{categories,recurring,cashflow}` | as Análises (ver `ANALYTICS.md`), com as regras do `AnalyticsRules` repetidas em `src/analytics.ts` |
| `POST /api/v1/quick-entry` e `POST /api/v1/transactions` | gravam, com as regras de 2.3 |
| `GET /api/v1/quick-entry/options` | a lista fixa de contas e categorias |
| `GET /api/v1/events/stream` | SSE no mesmo formato do `TransactionEvent` (`CREATED`, `DELETED`, `HEARTBEAT` a cada 25 s) |
| `GET /api/v1/demo/feed` | **só da demo**: os lançamentos de visitantes e quais são de quem pergunta (`mine`), pela chave em `X-Demo-Visitante`. A chave dos outros nunca sai do objeto |
| qualquer outra escrita | 403, "Somente leitura na demonstração" |

**Dados fictícios relativos a hoje.** O histórico (~3 meses) é gerado a partir da
data atual, não gravado com datas fixas — senão, em dois meses, o dashboard de
"este mês" da demo estaria vazio. São 13 meses fechados mais o corrente (~730 linhas),
para as Análises; o saldo inicial das contas absorve o que vem antes dos últimos
~3 meses, e os saldos do dashboard ficam onde estavam (`src/seed.ts`).

**Limpeza por alarme do Durable Object:** cada lançamento de visitante some
**10 min** depois de criado; no máximo **30** ao mesmo tempo. O histórico
fictício nunca expira.

### 2.3 A cerca, na ordem em que filtra

1. **Borda:** uma regra de rate limiting do WAF barra rajadas antes de chegarem
   ao Worker — requisição barrada ali não gasta a cota.
2. **Rota:** só as de 2.2. Qualquer outra coisa: 404.
3. **Corpo:** até 1 KB, JSON válido.
4. **Normalização:** descarta `description` e `occurredOn`; `amount` entre
   R$ 0,01 e R$ 10.000,00, com no máximo 2 casas. Conta ou categoria fora da
   lista: **422 com as opções válidas, com a mesma mensagem do app real.**
5. **Limite por IP no Durable Object:** 10 `POST`/min e 100/dia; global 120/min.
   Estourou: 429 com `Retry-After`. IP só em memória, durante a janela.
6. **Token:** `Authorization: Bearer` com um token **público**, exibido na
   página, de formato diferente do real. Ele existe para o exemplo ser idêntico
   ao Atalho de verdade, não para proteger nada — e a página diz isso.
7. **"Você":** a página gera uma chave de visitante (em `localStorage`) e a
   mostra já preenchida no exemplo, no cabeçalho `X-Demo-Visitante`. O objeto
   guarda quem criou cada lançamento por 10 min, e a página destaca os seus.

---

## 3. A página

Uma página só, nesta ordem.

| # | Seção | Pesa mais para |
|---|---|---|
| 1 | **Abertura:** uma frase dizendo o que é, com o feed ao vivo já visível — a demo *é* a abertura. Ações: "Testar agora" e "Abrir o app". | os dois |
| 2 | **Por que existe:** software pessoal, auto-hospedado. App de finanças gratuito costuma pagar a conta com os seus dados; este não tem modelo de negócio. Sem tom de marketing. | entusiastas |
| 3 | **Como funciona:** três entradas, um painel — Atalho (na hora), Open Finance (conciliação diária), tela. Um diagrama. | os dois |
| 4 | **Teste ao vivo:** ver 3.1. | os dois |
| 5 | **Segurança:** ver 3.3. | os dois |
| 6 | **Decisões de engenharia:** ver 3.2. | recrutadores |
| 7 | **Stack**, e como a própria demo foi feita (ver 3.4). | recrutadores |
| 8 | **Rodapé:** autor, LinkedIn, GitHub, aviso de dados fictícios. | — |

O visual fica com o `ui-designer`, com a linguagem do redesign e as mesmas
regras contra a "cara de IA". Texto honesto e específico, sem superlativos.

### 3.1 Quatro jeitos de testar

1. **Formulário na própria página**, que mostra a requisição HTTP exata sendo
   enviada. A maioria dos visitantes não vai abrir o Postman.
2. **curl** copiável, com a chave do visitante já preenchida.
3. **Collection do Postman** pronta para importar (derivada da que já existe em `postman/`).
4. **Atalho do iPhone de demonstração**, compartilhado pelo iCloud: a pessoa
   instala, registra um gasto no celular e vê aparecer na tela do computador.

Regras exibidas junto: dados fictícios; cada lançamento some em 10 minutos;
o token é público; categoria e conta vêm da lista; não envie dados reais.

### 3.2 Histórias de engenharia

Curtas, cada uma com problema, decisão e consequência:

- **O sinal que inverte:** na conta corrente, negativo é saída; no cartão,
  positivo é despesa. A direção vem do tipo da transação, nunca do sinal — com
  teste usando valores reais.
- **O id que não é id:** a Pluggy apaga e recria transações de cartão no
  fechamento da fatura. A deduplicação usa uma chave natural.
- **Cinco dias de ponto verde:** o agregador parou de coletar sem nenhum erro
  em lugar nenhum. Daí veio a faixa que mostra a idade do dado.
- **O Desfazer que mentia:** uma troca de filtro enviava a exclusão na hora,
  com o botão Desfazer ainda na tela. Achado por revisão antes de ir ao ar.

### 3.3 Segurança — só o que é verdade

- Single-tenant e auto-hospedado: um usuário, um servidor, um banco. Sem
  anúncios, sem venda de dados, sem analytics de terceiros.
- Todo acesso passa pela autenticação do Cloudflare Access. O Atalho exige
  token de serviço **e** um token próprio da aplicação.
- Open Finance com consentimento **somente leitura**: a integração não
  consegue mover dinheiro.
- Banco sem porta exposta; container somente leitura, sem privilégios, sem root.
- Backup diário fora do servidor, com restauração testada.
- A demo é uma cópia isolada, com dados fictícios: nada que acontece nela
  alcança a instância real.

### 3.4 Transparência sobre a demo

Dito na página, sem esconder: **a interface é o código real; a API da demo é
uma reimplementação do contrato em TypeScript, rodando na borda da Cloudflare,
com os mesmos tipos do app.** Para um recrutador, isso é mais interessante que
fingir que é a mesma coisa.

---

## 4. O que precisa ser construído

Tudo no mesmo repositório. Deploy com `wrangler deploy` direto do Windows —
sem Docker, sem VM.

```
demo/
  worker/        Worker + Durable Object (TypeScript), wrangler.jsonc
  landing/       a página (Vite)
  build.mjs      monta dist/: landing em /, app real (VITE_BASE=/app/, VITE_DEMO=true) em /app/
```

| Fase | Entrega | Critério para seguir |
|---|---|---|
| 1 — modo demo no frontend ✅ | `VITE_BASE`, `basename`, `VITE_DEMO` (constante de build via `define`) | **nenhum texto do modo demo no bundle de produção** (conferido com grep) e produção funcionando como antes. O critério original, "mesmo hash de bundle", era inatingível: só passar o `basename` ao router já muda o bundle |
| 2 — API espelho ✅ | Worker, Durable Object, dados fictícios relativos a hoje, SSE, limpeza; o `build.mjs` reescreve o `manifest.json` copiado para `/app/` | o app real em `/app/` funcionou inteiro contra ela no `wrangler dev`: dashboard, filtros, fila, um `POST` externo aparecendo ao vivo na tela aberta, expiração por alarme e teto de 30 |
| 3 — a cerca ✅ | normalização, limites, 401/403/413/422/429, chave de visitante; o formulário do app, em modo demo, troca data e descrição por um aviso (aceitar e descartar parecia defeito) | cada camada testada isoladamente: 403 e 401 sem acordar o objeto; o 11º envio por minuto barrado no Worker (`X-Demo-Limite: worker`); os limites do objeto testados sozinhos com valores reduzidos; `X-Demo-Ignorado` lista o que foi descartado |
| 4 — landing ✅ | as 8 seções (`ui-designer`), favicons na raiz, collection do Postman; o evento `CREATED` leva uma marca (`visitorTag`) para a página reconhecer o que é seu sem reler o feed | 375 px e desktop sem rolagem horizontal, console limpo; um POST externo com a chave da página ganhou "você", outro não, e a página fez **zero** leituras extras do feed — a versão anterior relia o feed a cada evento, e o custo crescia com (pessoas olhando × envios) |
| 5 — Atalho e Postman | Atalho de demonstração no iCloud; collection da demo | testados num iPhone real |
| 6 — entrada no ar ✅ | `security-reviewer` em tudo; DNS; regra do WAF | **no ar em 22/10/2026** em `nasfinance.ebls.com.br`. Revisão feita, 8 achados corrigidos. O plano gratuito aceitou os dois limitadores na borda. Medido em produção: conexão ao vivo abre em ~0,3 s, e a vaga de uma conexão fechada volta em ~1 s (`enable_request_signal`). Regra de rate limiting do WAF criada em 22/10/2026 (30 req/10 s por IP em `/api/`, bloqueio de 10 s): numa rajada de 60, 27 barradas na borda, sem gastar cota |

---

## 5. Riscos conhecidos

### 5.1 O espelho divergir do app

Mitigado pelos tipos compartilhados (1.3): mudança de contrato quebra a
compilação do Worker. O que os tipos não pegam — regra de cálculo do dashboard —
é coberto por um teste do Worker com o mesmo cenário de um teste do backend.

### 5.2 Cota esgotada por abuso

Não custa dinheiro; tira a demo do ar até 00:00 UTC. A regra do WAF e o limite
por IP tornam isso trabalhoso; a página explica o que aconteceu em vez de
quebrar.

A cota de linhas lidas do SQLite não depende do limite por IP: o custo de cada
requisição é limitado pelo desenho. Antes, com o histórico de 13 meses, um
único IP dentro das 120 leituras/minuto esgotava os 5 milhões do dia em ~11
minutos pelo dashboard de 3 anos (7.225 linhas por chamada) e em menos de uma
hora pelas Análises. Hoje uma leitura custa 0 linhas com o objeto acordado e no
máximo ~30 (os lançamentos de visitante) logo depois de uma escrita — e
escrita tem o seu próprio limite (10/min e 100/dia por IP, 120/min no total).
O que sobra é a cota de requisições (100 mil/dia), que já era o teto antes, e a
de linhas gravadas: ~8 por lançamento contra 100 mil/dia dá ~12 mil lançamentos,
o que exige ~120 IPs no teto diário de 100 cada, ou o limite global de 120/min
por ~1h40. Abuso distribuído derruba a demo; um IP sozinho, não.

### 5.3 O limite de rajada na borda pode não existir no plano gratuito

A documentação do Rate Limiting binding não diz se ele está no plano gratuito. O código trata a ausência
(`BURST` é opcional): se o deploy recusar, remove-se o bloco `ratelimits` do `wrangler.jsonc` e os
limites exatos do Durable Object seguem valendo sozinhos — testados assim na fase 3. A diferença é só
que rajadas passam a acordar o objeto antes de serem barradas.

### 5.4 A conta da Cloudflare é a mesma da produção

Túnel e Access da produção moram na mesma conta. O `wrangler` deve usar um
**token de escopo mínimo** (Workers e o domínio `nasfinance.ebls.com.br`),
nunca o login com permissão de conta inteira.

### 5.5 Repositório público

Se o código for aberto, o `security-reviewer` precisa varrer o **histórico
inteiro do git** atrás de segredos, não só os arquivos atuais.

---

## 6. Decisões — fechadas em 18/10/2026

| # | Decisão | Fechada como |
|---|---|---|
| 1 | Repositório público? | privado por enquanto; a página não linka código |
| 2 | Autor | Eduardo Blasczak — [GitHub](https://github.com/eduardoblasczak), [LinkedIn](https://www.linkedin.com/in/eduardoblasczak/), [ebls.com.br](https://ebls.com.br) |
| 3 | Analytics | nenhum; o texto de 3.3 fica como está |
| 4 | Atalho de demonstração no iCloud | sim, publicado pela conta Apple do Eduardo (fase 5) |
| 5 | Tempo e teto dos lançamentos de visitantes | 10 min e 30 |
| 6 | O botão **+** do app aceitar lançamentos na demo | sim |

---

## Fontes (consultadas em 17/10/2026)

- Preços e limites do Workers: https://developers.cloudflare.com/workers/platform/pricing/
- Limites do Workers: https://developers.cloudflare.com/workers/platform/limits/
- Durable Objects, documentação completa: https://developers.cloudflare.com/durable-objects/llms-full.txt
- Preços do Durable Objects (plano gratuito): https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/durable-objects/durable-objects-pricing.mdx
- Namespaces novos só com SQLite: https://developers.cloudflare.com/changelog/post/2026-07-09-restrict-new-kv-backed-namespaces/
