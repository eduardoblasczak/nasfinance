# Sincronização com a Pluggy — proposta

> **Status: proposta, nada implementado.** Este documento existe para ser
> discutido e aprovado antes de qualquer linha de código. Os números abaixo
> foram medidos em 13/10/2026 com `scripts/pluggy-explore.sh` contra a conta
> real, não estimados.

O objetivo original do projeto era "toda vez que eu faça um PIX ou gaste algo
no cartão, salva na aplicação". A Pluggy não entrega exatamente isso — e a
primeira seção explica por quê, porque isso redefine o que estamos
construindo.

---

## 1. O que a realidade impõe

Seis restrições, todas verificadas, que determinam o desenho inteiro.

### 1.1 Os dados se movem uma vez por dia

O conector **MeuPluggy** (plano pessoal, gratuito) atualiza a cada 24 horas e
**não aceita atualização manual**. Consultar de hora em hora não traria nada
novo.

**Consequência:** o Atalho do iPhone continua sendo o caminho instantâneo e
fica *mais* importante, não menos. A Pluggy vira a rede de segurança — pega o
que você esqueceu de lançar, traz o que nunca passa pelo celular (débito
automático, assinatura, tarifa) e confere o que você lançou. É conciliação do
dia seguinte, não captura em tempo real.

### 1.2 Não existe identificador estável

| Conta | Transações | `providerId` preenchido |
|---|---|---|
| Corrente | 382 | **0** |
| Cartão | 100 | **0** |

`providerId` só vem em conectores Open Finance; o MeuPluggy é **Direct**. E o
`id` da própria Pluggy **não serve como chave**: na virada da fatura ela apaga
e recria a transação com `id` novo, e — nas palavras da documentação —
*"nothing links the old id to the new one"*.

### 1.3 O sinal do valor significa coisas opostas

```
Corrente:    -5,00   DEBIT    PIX ENVIADO         negativo = saída
             33,00   CREDIT   PIX recebido        positivo = entrada

Cartão:      51,85   DEBIT    Compra              positivo = despesa
           -169,89   CREDIT   PAGAMENTO FATURA    negativo = pagamento
```

**Nunca olhar o sinal.** O campo `type` é consistente nos dois casos:
`DEBIT` sai, `CREDIT` entra.

### 1.4 "Pagamento de fatura" não é receita

O `-169,89 CREDIT` no cartão é você pagando a fatura com dinheiro que saiu da
conta corrente. Importado como receita, o mesmo dinheiro aparece duas vezes.
Pior: as compras do cartão **já** foram lançadas como despesa quando
ocorreram, então contar também o pagamento da fatura na conta corrente
duplicaria a despesa.

### 1.5 A chave recomendada não é única

Na conta corrente, `(data, valor, descrição)` tem **4 grupos repetidos,
somando 10 registros** — dois "Troco Guardado" de R$ 0,01 no mesmo dia são
duas transações legítimas.

Mas a resposta traz o campo **`order`**, e a documentação diz que a própria
Pluggy, sem id do banco, casa transações por *"description, amount, date, and
its position among identical transactions on the same day"*. Ou seja: a chave
que ela usa internamente é `(data, valor, descrição, order)`, e está
disponível para nós.

### 1.6 Volume é irrelevante

482 transações em 6 meses. Qualquer estratégia cabe na VM de 954 MiB; nenhuma
decisão aqui precisa ser tomada por desempenho.

---

## 2. Decisões propostas

### 2.1 Consulta agendada, não webhook

A aplicação consulta a Pluggy uma vez por dia. **Não** expomos endpoint de
webhook.

**Por quê.** `financas.ebls.com.br` está atrás do Cloudflare Access. Um POST
da Pluggy bateria na parede de login. As alternativas seriam uma terceira
aplicação do Access com Service Auth (só funciona se a Pluggy permitir
cabeçalhos customizados) ou uma política de Bypass — que desliga os controles
e não registra nada, exatamente o que evitamos quando montamos o Access.

Como os dados só se movem a cada 24h, não perdemos nada. E ganhamos: zero
superfície de ataque nova, zero segredo adicional exposto.

**Cadência.** Diária, às 06:00 BRT. Antes de buscar qualquer transação, o job
lê `GET /items/{id}` e compara `lastUpdatedAt` com o da última execução
bem-sucedida. Se não mudou, encerra sem fazer nada — barato e evita
reprocessar o mesmo conjunto todo dia.

### 2.2 Chave natural espelhando a da Pluggy

```
external_id = sha256(pluggyAccountId | date | amount | description | order)
```

Guardada em `transactions.external_id` com `source = AGGREGATOR`. O índice
único parcial `uq_transactions_source_external` que já existe passa a ter
função real: rodar a sincronização duas vezes não duplica nada.

**Por que essa composição.** É exatamente a chave que a Pluggy usa quando não
tem id do banco. Ela é estável precisamente quando a Pluggy considera que é a
mesma transação, e muda precisamente quando a Pluggy faria delete + create.
Herdamos a semântica dela em vez de inventar uma concorrente.

**O que ela não resolve.** Se a fatura fechar e a descrição ou o valor mudar,
a chave muda e entra uma linha nova. Isso é inerente — não há informação que
ligue as duas. Fica a cargo da fila de revisão (2.4).

### 2.3 Tradução para o nosso modelo

| Pluggy | nasFinance |
|---|---|
| `type = DEBIT` | `flow = EXPENSE` |
| `type = CREDIT` | `flow = INCOME` |
| `amount` | `abs(amount)` |
| `date` (ISO, UTC) | `occurred_on` convertido para GMT-3 |
| `description` | `description` |
| `id`, `category`, parcelas | `notes` (rastro de auditoria) |
| — | `source = AGGREGATOR` |

A conversão de fuso não é detalhe: a Pluggy devolve UTC, e uma compra de
22h em Brasília chega como `date` do dia seguinte. Sem converter, lançamentos
noturnos caem no dia errado — e, no fim do mês, no mês errado.

**Categoria.** A Pluggy classificou **482 de 482** transações. A proposta é
usar isso como **sugestão**, não como verdade: manter `category_id` nulo e
guardar a categoria dela em `notes`, deixando a fila de revisão oferecer o
mapeamento. Classificar automaticamente com um vocabulário que não é o seu
produziria um dashboard que parece certo e não é.

### 2.4 Fila de revisão — o coração da proposta

Nem toda transação importada pode entrar direto. Três situações exigem uma
decisão humana, e a proposta é tratá-las com **um mecanismo só**:

**a) Possível duplicata do Atalho.** Você lança R$ 139,37 "Pizzaria" às 20h
pelo iPhone; três horas depois a Pluggy traz `IFD*PIZZARIA EXEMPLO` de R$
139,37. É a mesma compra. O critério de suspeita: mesma conta, mesmo valor,
data dentro de ±3 dias, e um lançamento `SHORTCUT` ou `MANUAL` ainda não
conciliado.

**Não fundir automaticamente.** Dois cafés de R$ 12 no mesmo dia no mesmo
cartão são duas compras. O sistema propõe; você decide.

**b) Sem categoria.** Toda transação importada chega sem categoria (2.3).

**c) Pagamento de fatura e transferências.** Ver 2.5.

Isso absorve a "fase 5 — fila de não-classificados" que já estava no plano da
interface: vira uma fila só, com três motivos possíveis.

### 2.5 Pagamento de fatura: limitação assumida

O modelo atual **não tem transferência** — `flow` é `EXPENSE` ou `INCOME`, e
nada mais. Dinheiro que sai de uma conta sua para outra conta sua não tem
como ser representado honestamente hoje.

Proposta para a v1:

- Cartão, `operationType = PAGAMENTO_FATURA` → **ignorar na importação**. A
  despesa real já foi registrada quando cada compra ocorreu.
- Conta corrente, débito que parece ser pagamento de fatura → **mandar para a
  fila de revisão**, não adivinhar. A detecção por descrição é frágil, e
  errar aqui some com uma despesa real ou cria uma fantasma.

**Suporte a transferências de verdade é projeto separado** — exige migration,
mudança no modelo, no dashboard e nos relatórios. Não cabe aqui, e fingir que
cabe produziria meia implementação.

### 2.6 Transações `PENDING`

Compras de cartão ficam `PENDING` até a fatura fechar. Elas são gasto real e
devem aparecer — se esperássemos o fechamento, o dashboard atrasaria até um
mês, o que anula o propósito.

São também as mais sujeitas a restatement. A proposta é **importar `PENDING`**
e deixar a fila de revisão lidar com o resíduo. **Esta é a decisão que eu
inverteria primeiro** se a fila de revisão ficar barulhenta demais na
prática.

---

## 3. O que precisa ser construído

Em ordem, cada item entregável e verificável sozinho.

| # | Peça | Observação |
|---|---|---|
| 1 | Cliente HTTP da Pluggy | `/auth`, `/items/{id}`, `/accounts`, `/v2/transactions` com cursor |
| 2 | Migration V3 | `pluggy_account_links`, `pluggy_sync_runs`, e `review_status` em `transactions` |
| 3 | Vínculo de contas | Qual conta da Pluggy corresponde a qual conta sua — seção nova na tela de Configuração |
| 4 | Serviço de sincronização | Tradução, chave natural, detecção de suspeita |
| 5 | Agendamento | `@Scheduled` diário, com a checagem de `lastUpdatedAt` |
| 6 | Fila de revisão (API) | Listar, aceitar, fundir, descartar |
| 7 | Fila de revisão (tela) | Absorve a antiga "fase 5" |

**Não começar pelo 1.** A ordem de valor é **2 → 3 → 1 → 4**: sem o vínculo de
contas, um cliente HTTP perfeito não tem onde gravar nada.

### Registro de execução

A tabela `pluggy_sync_runs` guarda início, fim, `lastUpdatedAt` do item,
quantos registros entraram, quantos foram ignorados, quantos foram para
revisão, e o erro se houver. Sem ela, "a sincronização rodou essa noite?" só
se responde garimpando log — e um job silencioso que parou de rodar é
exatamente o tipo de falha que passa meses sem ser notada. A mesma lição do
backup.

---

## 4. Riscos conhecidos

**O conector pode expirar.** O consentimento do Open Finance tem validade. O
job precisa tratar `status != UPDATED` como condição esperada e avisar, não
estourar exceção. Sem isso, a sincronização morre em silêncio e você só
descobre quando sentir falta dos lançamentos.

**A documentação da Pluggy está inconsistente consigo mesma.** O guia "Personal
use" ensina `GET /transactions`, que hoje responde `410 ENDPOINT_DEPRECATED`.
A fonte confiável é o OpenAPI em `/openapi/pluggy-api.json`. Vale assumir que
outros exemplos da prosa também estão defasados.

**Limite de 5 conexões** no plano pessoal, e uso comercial não é permitido.

**Restatement de fatura gera linha nova.** Já explicado em 2.2 — mitigado, não
resolvido.

---

## 5. Decisões que dependem de você

1. **`PENDING` entra?** Proposta: sim (2.6). SIM
2. **Categoria da Pluggy classifica automaticamente?** Proposta: não, só
   sugere (2.3). Só sugerir
3. **Qual janela sincronizar?** Proposta: 90 dias a cada execução. Mais que
   isso é reprocessar passado estável; menos arrisca perder lançamento que
   apareceu atrasado. Não entendi, isso não seria diário?
4. **O que fazer com os 6 meses de histórico que já existem?** Importar tudo
   de uma vez encheria a fila de revisão com 482 itens. Alternativa: importar
   só a partir de hoje e deixar o passado como está. Importar só a partir de hoje

   Ignore as transações menores de 1 real, pois eu tenho habilitado uma função do picpay que guarda no cofrinho valor que falta para uma transferência pix ficar com um valor redondo
