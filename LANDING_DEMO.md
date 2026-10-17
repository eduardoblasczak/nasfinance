# Página pública e demonstração ao vivo — proposta

> **Status: proposta, nada construído.** Aguardando as decisões da seção 6.
> Preços e limites da Cloudflare conferidos em 17/10/2026 (fontes no fim) —
> o Cloudflare Containers é recente e pode mudar.

Uma página pública em `nasfinance.ebls.com.br`, fora do Cloudflare Access, para
dois públicos: **recrutadores**, que querem ver julgamento de engenharia, e
**curiosos e entusiastas** de alternativas às grandes empresas de finanças e
tecnologia, que querem ver um software pessoal funcionando de verdade.

O centro da página é uma demonstração ao vivo: a pessoa copia os parâmetros da
API do Atalho, faz um `POST` pelo Postman, pelo curl, pelo iPhone ou pela
própria página — e o valor aparece na tela na hora, para todo mundo que estiver
olhando. Rodando **o código real**, com dados fictícios, sem nenhum caminho até
a instância de produção.

---

## 1. O que a realidade impõe

### 1.1 O app real não tem login — a fronteira é o Access

A aplicação não tem autenticação própria: quem protege `/api/v1/*` é o
Cloudflare Access. Um hostname público apontando para `nasfinance-app`
**exporia saldos, extratos e o painel da Pluggy** — e bastaria um erro de
configuração no túnel para isso acontecer.

**Consequência:** a demo é outra instância, com outro banco e dados fictícios.
Não compartilha container, banco, túnel nem segredo com a produção.

### 1.2 A VM não comporta uma segunda instância

954 MiB, dos quais 768 MiB já reservados para app e banco. Uma segunda JVM não
cabe, e tráfego público disputaria CPU com o app real.

**Consequência:** a demo roda fora da VM.

### 1.3 Código real na Cloudflare exige Containers

Um Worker comum não executa JVM. O **Cloudflare Containers** executa uma imagem
Docker comandada por um Worker — e é o que permite rodar o Quarkus de verdade.

| Item | Valor |
|---|---|
| Plano exigido | Workers Paid, **US$ 5/mês** |
| Incluído por mês | 25 GiB-h de memória, 375 vCPU-min, 200 GB-h de disco |
| Cobrança | a cada 10 ms **ativos**; dorme após `sleepAfter` e para de cobrar |
| Instância `basic` | 1/4 vCPU, 1 GiB, 4 GB de disco |

Fazendo a conta para a `basic`: o incluído cobre **~25 h acordada por mês**.
Acima disso, ~US$ 0,03 por hora. Acordada 24/7, seriam ~US$ 20/mês.

**Consequência:** custo fixo de US$ 5 e, com `sleepAfter`, provavelmente nada
além disso. Mas a JVM em 1/4 de vCPU pode demorar a acordar — nesta VM Oracle o
`start_period` do healthcheck é de 120 s. **Isso precisa ser medido antes de
qualquer outra coisa** (fase 0).

### 1.4 Certificado gratuito só cobre um nível de subdomínio

O Universal SSL cobre `ebls.com.br` e `*.ebls.com.br`, não
`demo.nasfinance.ebls.com.br`. Cobrir o segundo nível exige plano pago.

**Consequência:** os hostnames são `nasfinance.ebls.com.br` e
`nasfinance-demo.ebls.com.br`.

### 1.5 O contrato do Atalho aceita texto livre

`QuickEntryRequest` tem `description` (até 200 caracteres) e `occurredOn`.
Num feed ao vivo e público, texto livre vira pichação em minutos, e uma data
arbitrária faz o lançamento sumir da tela.

**Consequência:** na demo, só passam valor, categoria, conta e direção — e
categoria e conta vêm de uma lista fixa. O que ficou de fora é dito na página.

### 1.6 "Roda localmente" deixou de ser verdade

Desde a migração, o app roda numa VM da **Oracle Cloud**; o tráfego passa pela
**Cloudflare**, que termina o TLS na borda; os dados bancários passam pela
**Pluggy**. Uma página de segurança com uma afirmação falsa perde a
credibilidade inteira no primeiro visitante técnico.

**Consequência:** o texto de segurança da seção 3.3 diz só o que é verdade —
e ainda soa forte.

---

## 2. Arquitetura proposta

```
 navegador ──────► nasfinance.ebls.com.br ───────┐
                   (landing estática)             │
 Postman / curl ─► nasfinance.ebls.com.br/api ────┤   Worker "nasfinance-demo"
 Atalho (iCloud) ─►                               │   · serve a landing
                                                  │   · valida, limita, marca o visitante
 navegador ──────► nasfinance-demo.ebls.com.br ───┘   · acorda e repassa ao container
                   (o app completo, só leitura)                  │
                                                                 ▼
                                        Durable Object + Container — instância ÚNICA
                                        ┌───────────────────────────────────────┐
                                        │ Postgres 17 (efêmero)                 │
                                        │ nasfinance — mesmo código, perfil     │
                                        │ `demo`, dados fictícios               │
                                        └───────────────────────────────────────┘

             ✕ nenhum caminho até a VM, o túnel, o Access ou o banco de produção
```

Quatro princípios:

1. **Mesmo código, não um fork.** A demo é o mesmo repositório construído com o
   perfil `demo`. Toda mudança no app real aparece na demo no deploy seguinte;
   um fork apodreceria em semanas.
2. **Instância única** (`max_instances = 1`): todo visitante vê o mesmo estado,
   e o custo tem teto natural.
3. **Efêmera por desenho.** O disco do container some quando ele dorme; cada
   despertar recomeça do zero, com os dados fictícios. A demo se limpa sozinha.
4. **O Worker é a cerca.** Todo abuso morre no Worker, **antes** de acordar o
   container — acordar custa dinheiro e segundos.

### 2.1 Dois hostnames, um Worker

| Hostname | Serve |
|---|---|
| `nasfinance.ebls.com.br` | landing estática + `/api/v1/quick-entry`, `/api/v1/quick-entry/options` e `/api/v1/events/stream` da demo. Mesma origem: sem CORS. |
| `nasfinance-demo.ebls.com.br` | o app completo em modo demonstração — a pessoa navega pelo dashboard real com dados fictícios. |

A URL que o visitante copia é `https://nasfinance.ebls.com.br/api/v1/quick-entry`:
o mesmo caminho da produção.

### 2.2 Perfil `demo` no código real

Tudo desligado fora do perfil `demo`.

| Peça | O que faz |
|---|---|
| `DemoModeFilter` | com `nasfinance.demo.enabled=true`, nega toda escrita (403, "Somente leitura na demonstração") **exceto** `POST /api/v1/quick-entry`, e nega `/q/metrics`. Lista do que é permitido, não do que é proibido: rota nova nasce bloqueada. |
| `GET /api/v1/meta` | devolve `{ "demo": true }`. O frontend mostra a faixa "Demonstração — dados fictícios" e esconde as ações de edição. |
| Migração `db/demo` | contas, categorias e ~3 meses de histórico fictício, para o dashboard ter o que mostrar. Só entra via `%demo.quarkus.flyway.locations`. |
| `DemoCleanupJob` | a cada minuto: apaga lançamentos do Atalho com mais de **10 min** e mantém no máximo **30**. |
| Testes de proteção | provam que, fora do perfil `demo`, o filtro está desligado, o seed não carrega e o job não roda. Dado fictício na produção seria o pior bug possível deste projeto. |
| `Dockerfile.demo` | a mesma aplicação + Postgres na mesma imagem (o entrypoint sobe o banco e depois a JVM), com `MaxRAMPercentage` reduzido para dividir 1 GiB. A imagem de produção não muda. |

O `SHORTCUT_TOKEN` da demo é **público por definição**, de formato diferente do
real, e a página diz isso abertamente.

### 2.3 O Worker, na ordem em que filtra

1. **Rota:** só as listadas em 2.1. Qualquer outra coisa: 404 sem acordar nada.
2. **Corpo:** até 1 KB, JSON válido.
3. **Normalização:** descarta `description` e `occurredOn`; `amount` entre
   R$ 0,01 e R$ 10.000,00, com no máximo 2 casas. Categoria ou conta fora da
   lista seguem para o app — o **422 com a lista válida é a resposta real**, e
   é uma boa demonstração de validação.
4. **Limite:** por IP, 10 `POST`/min e 100/dia; global, 120 `POST`/min.
   Estourou: 429 com `Retry-After`, sem tocar no container. Por fora, uma regra
   de rate limiting do WAF da Cloudflare.
5. **"Você":** a página gera uma chave de visitante (em `localStorage`) e a mostra
   já preenchida no exemplo, no cabeçalho `X-Demo-Visitante`. O Worker remove o
   cabeçalho antes de repassar, guarda o `id` devolvido pelo `201` no Durable
   Object por 10 min, e a página destaca os lançamentos daquela pessoa.
6. **Despertar:** se o container estiver dormindo, a página recebe um estado
   "acordando o servidor de demonstração…" em vez de silêncio.
7. **Privacidade:** IP só em memória, durante a janela do limite. Nada gravado.

### 2.4 Tempo real

O SSE real (`/api/v1/events/stream`, heartbeat de 25 s), repassado pelo Worker.
Um `POST` chega → o app emite o evento → toda página aberta atualiza. É o mesmo
mecanismo que atualiza o dashboard real quando o iPhone lança um gasto. O
streaming através de Worker → Container é validado na fase 0.

---

## 3. A página

Uma página só, nesta ordem.

| # | Seção | Para quem pesa mais |
|---|---|---|
| 1 | **Abertura:** uma frase dizendo o que é, com o feed ao vivo já visível — a demo *é* a abertura. Ações: "Testar agora" e "Abrir o app de demonstração". | os dois |
| 2 | **Por que existe:** software pessoal, auto-hospedado. App de finanças gratuito costuma pagar a conta com os seus dados; este não tem modelo de negócio. Sem tom de marketing. | entusiastas |
| 3 | **Como funciona:** três entradas, um painel — Atalho (na hora), Open Finance (conciliação diária), tela. Um diagrama. | os dois |
| 4 | **Teste ao vivo:** ver 3.1. | os dois |
| 5 | **Segurança:** ver 3.3. | os dois |
| 6 | **Decisões de engenharia:** ver 3.2. | recrutadores |
| 7 | **Stack:** Quarkus 3 / Java 21, React 19 / TypeScript, Postgres 17, Cloudflare (Tunnel, Access, Containers), Oracle Cloud, Pluggy. | recrutadores |
| 8 | **Rodapé:** autor, LinkedIn, GitHub, aviso de dados fictícios. | — |

O visual fica com o `ui-designer`, depois do redesign, com a mesma linguagem do
app e as mesmas regras contra a "cara de IA". Texto honesto e específico, sem
superlativos.

### 3.1 Quatro jeitos de testar

1. **Formulário na própria página**, que mostra a requisição HTTP exata sendo
   enviada. A maioria dos visitantes não vai abrir o Postman.
2. **curl** copiável, com a chave do visitante já preenchida.
3. **Collection do Postman** pronta para importar (derivada da que já existe em `postman/`).
4. **Atalho do iPhone de demonstração**, compartilhado pelo iCloud: a pessoa
   instala, registra um gasto no celular e vê aparecer na tela do computador.
   É a demonstração que mais vende o produto.

Regras exibidas junto: dados fictícios; cada lançamento some em 10 minutos;
o token é público; categoria e conta vêm da lista (`GET /quick-entry/options`);
não envie dados reais.

### 3.2 Histórias de engenharia

Curtas, cada uma com o problema, a decisão e a consequência. Candidatas:

- **O sinal que inverte:** na conta corrente, negativo é saída; no cartão,
  positivo é despesa. A direção vem do tipo da transação, nunca do sinal — e há
  teste com valores reais provando isso.
- **O id que não é id:** a Pluggy apaga e recria transações de cartão no
  fechamento da fatura. A chave de deduplicação é natural, espelhando a dela.
- **Cinco dias de ponto verde:** o agregador parou de coletar sem nenhum erro
  em lugar nenhum. Daí veio a faixa que mostra a idade do dado.
- **Deploy de uma VM que não compila:** 954 MiB não comportam a build; a
  imagem é construída fora e conferida por checksum antes de carregar.

### 3.3 Segurança — o que dá para afirmar com verdade

- Single-tenant e auto-hospedado: um usuário, um servidor, um banco. Sem
  anúncios, sem venda de dados, sem analytics de terceiros.
- Todo acesso passa pela autenticação do Cloudflare Access. O Atalho exige
  token de serviço **e** um token próprio da aplicação.
- Open Finance com consentimento **somente leitura**: a integração não
  consegue mover dinheiro.
- Banco sem porta exposta; container somente leitura, sem privilégios, com
  usuário sem root; nada publicado na internet além do túnel.
- Backup diário fora do servidor, com restauração testada.
- A demo é outra instância, em outra infraestrutura, com dados fictícios: nada
  que acontece nela alcança a instância real.

---

## 4. O que precisa ser construído

Código novo no mesmo repositório: `demo/` (Worker em TypeScript, `wrangler.jsonc`,
`Dockerfile.demo`, entrypoint) e `landing/` (Vite, estático).

| Fase | Entrega | Critério para seguir |
|---|---|---|
| **0 — prova de conceito** | imagem atual + Postgres num Container `basic`; medir o despertar; validar SSE através do Worker; validar `wrangler deploy` a partir do WSL (o Docker só existe lá) | despertar em até ~20 s com o aviso "acordando". Senão, ver risco 5.1 |
| 1 — perfil `demo` | filtro, `/meta`, seed, limpeza, testes de proteção, faixa no frontend | `mvnw.cmd -B test` verde |
| 2 — Worker | rotas, validação, limites, chave de visitante, despertar | testes do Worker; abuso simulado não acorda o container |
| 3 — landing | as 8 seções (ui-designer) | 375 px e desktop, sem rolagem horizontal |
| 4 — Atalho e Postman | Atalho de demonstração no iCloud; collection da demo | testados num iPhone real |
| 5 — entrada no ar | `security-reviewer` em tudo; DNS; regra do WAF; alerta de cobrança | zero achado crítico ou alto |

---

## 5. Riscos conhecidos

### 5.1 Despertar lento

JVM + Postgres em 1/4 de vCPU podem levar dezenas de segundos. Mitigações, em
ordem de custo: a landing é estática e abre na hora, e o estado "acordando" é
honesto; manter acordado em horário comercial com um Cron Trigger (~12 h/dia ≈
US$ 9/mês além do incluído); instância maior. Último recurso: reimplementar só
o contrato do Atalho no Worker — perde a "cópia do código real", por isso fica
por último.

### 5.2 Custo por abuso

Alguém mantendo o container acordado 24/7 custaria ~US$ 20/mês. A instância
única é o teto natural; o rate limit no Worker evita o despertar; e a Cloudflare
não tem trava de gasto, então entra um **alerta de cobrança**.

### 5.3 A conta da Cloudflare é a mesma da produção

Túnel e Access da produção moram na mesma conta. O token do `wrangler` na
máquina de desenvolvimento precisa de **escopo mínimo** (Workers e DNS desta
zona), nunca permissão de conta inteira.

### 5.4 Repositório público

Se o código for aberto, o `security-reviewer` precisa varrer o **histórico
inteiro do git** atrás de segredos, não só os arquivos atuais.

---

## 6. Decisões em aberto

1. **O repositório vai ser público?** Muda o rodapé, permite uma seção "rode o
   seu" (forte para o público entusiasta) e exige a varredura de 5.4.
2. **Orçamento:** US$ 5/mês fixo, com pior caso de ~US$ 20 — ok? Manter acordado
   em horário comercial (~US$ 9 a mais) ou aceitar o despertar lento?
3. **Autor:** nome e links que aparecem na página.
4. **Analytics:** nenhum (o texto de 3.3 fica como está) ou Cloudflare Web
   Analytics, que não usa cookie (aí o texto muda)?
5. **Atalho no iCloud:** publicado pela sua conta Apple — ok?
6. **`nasfinance-demo.ebls.com.br`** como hostname do app de demonstração — ok?
7. **10 minutos e 30 lançamentos** — ok?

---

## Fontes (consultadas em 17/10/2026)

- Preços do Workers e do Containers: https://developers.cloudflare.com/workers/platform/pricing/
- Containers, documentação completa: https://developers.cloudflare.com/containers/llms-full.txt
- Containers em disponibilidade geral e cobrança por 10 ms: https://bex.co/blog/2026/07/28/cloudflare-containers-ga-per-10ms-billing
- Limites do Universal SSL: https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations
