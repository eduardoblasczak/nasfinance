# Atalho do iPhone — lançamento rápido

Registra uma despesa em 3 toques (valor → categoria → conta), direto do
iPhone, sem abrir o site. Este documento cobre a parte que já está pronta no
servidor (Cloudflare Access) e o passo a passo pra montar o Atalho.

---

## Como a segurança funciona

O endpoint `/api/v1/quick-entry` tem **duas camadas** de proteção, nessa
ordem:

1. **Cloudflare Access — Service Auth.** Antes de a requisição sequer chegar
   no servidor, a borda da Cloudflare exige dois headers
   (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) que identificam um
   *Service Token* cadastrado no Zero Trust. Sem eles, a requisição nem sai
   da rede da Cloudflare — fica registrada como negada, sem custo pro NAS.
2. **Token da aplicação.** Depois de passar pela Cloudflare, o backend ainda
   exige `Authorization: Bearer <SHORTCUT_TOKEN>` (ver
   [`ShortcutTokenFilter`](backend/src/main/java/br/com/ebls/nasfinance/api/security/ShortcutTokenFilter.java)).

Se um dos dois vazar sozinho, o outro ainda segura. É por isso que **nunca
usamos Bypass** no Access — a Cloudflare desaconselha explicitamente, porque
Bypass não loga nada e derruba a segurança pra zero nesse caminho.

### O que já está configurado no Cloudflare (Zero Trust → Access controls)

| Item | Nome | Escopo | Ação |
|---|---|---|---|
| Service Token | `nasfinance-iphone` | — | credencial |
| Aplicação 1 | `financas` | `financas.ebls.com.br` (site inteiro) | `Allow` — só `eduardo.blasczak@gmail.com` |
| Aplicação 2 | `financas - atalho iphone` | `financas.ebls.com.br/api/v1/quick-entry` | `Service Auth` — token acima |

A aplicação 2 é mais específica que a 1 (tem path), então o Cloudflare aplica
ela primeiro nesse caminho — o resto do site continua exigindo login normal.

---

## Antes de montar o Atalho

Você precisa de dois segredos, **nenhum deles passa pelo chat** — nem cola
aqui, nem em nenhuma IA:

1. **Client ID e Client Secret** do Service Token `nasfinance-iphone`. O
   Secret só aparece uma vez, no momento em que o token é criado — se você já
   perdeu, tem que gerar um novo (`Rotate` no painel).
   Guarde os dois no seu gerenciador de senhas.
2. **`SHORTCUT_TOKEN`** — já está no `.env` do servidor. Leia direto de lá:
   ```bash
   grep SHORTCUT_TOKEN ~/nasfinance/.env
   ```
   Isso devolve uma linha `SHORTCUT_TOKEN=xxxxxxxx...` — o valor que importa é
   só a parte **depois do `=`**. No Atalho, o header `Authorization` recebe
   a palavra `Bearer`, um espaço, e esse valor colado logo em seguida, tudo
   numa linha só: `Bearer xxxxxxxx...`. `SHORTCUT_TOKEN` é só o nome da
   variável no servidor — não é isso que se digita no Atalho.

---

## Montando o Atalho (app Atalhos, iPhone)

Toque em **+** para criar um atalho novo. Nomeie como `Novo Gasto`.

| # | Ação | Configuração |
|---|---|---|
| 1 | **Ask for Input** | Prompt: `Valor gasto` · Tipo: Número |
| 2 | **List** | Um item por linha: `Mercado`, `Alimentação`, `Transporte`, `Moradia`, `Contas e Serviços`, `Saúde`, `Educação`, `Lazer`, `Compras`, `Assinaturas`, `Pets`, `Outros` |
| 3 | **Choose from List** | Entrada: lista do passo 2 · Prompt: `Categoria` |
| 4 | **List** | Itens: `Conta Corrente`, `Vale Refeição`, `Cartão de Crédito`, `Dinheiro`, `Poupança` |
| 5 | **Choose from List** | Entrada: lista do passo 4 · Prompt: `Conta` |
| 6 | **Get Contents of URL** | Ver detalhes abaixo |
| 7 | **Get Dictionary Value** | De: resultado do passo 6 · Chave: `amount` |
| 8 | **Show Notification** | Texto: `Registrado: R$ [valor do passo 7]` |

### Passo 6 — Get Contents of URL

- **URL:** `https://financas.ebls.com.br/api/v1/quick-entry`
- **Método:** `POST`
- **Headers:**
  | Header | Valor |
  |---|---|
  | `CF-Access-Client-Id` | seu Client ID |
  | `CF-Access-Client-Secret` | seu Client Secret |
  | `Authorization` | `Bearer ` + o valor lido do `.env` (ver seção acima) |
- **Request Body:** toque em "Show More" pra revelar esse campo. Escolha o
  tipo **JSON**. Toque em "Add new field" três vezes e monte:

  | Chave | Tipo | Valor |
  |---|---|---|
  | `amount` | Number | toque no campo → escolha a variável do passo 1 |
  | `category` | Text | toque no campo → escolha **"Chosen Item" do passo 3** (existem dois "Chosen Item" no seletor; use o do passo 3, não o do 5) |
  | `account` | Text | toque no campo → escolha "Chosen Item" do passo 5 |

  Não precisa de uma ação `Dictionary` separada — esses campos são
  preenchidos direto dentro do próprio Request Body.

`flow` não entra no corpo: a API assume `EXPENSE` quando omitido, que é o
caso mais comum ao usar o Atalho (ver seção "Nova Receita" abaixo se quiser
o caminho inverso).

### Por que não pede descrição

De propósito. É campo opcional na API, e cada toque a mais é atrito no
momento em que você está saindo do caixa. Dá pra completar a descrição
depois, pelo site.

---

## Testando

Rode o Atalho **de dentro do app Atalhos** (não pela Siri) na primeira vez —
se algo estiver errado (token trocado, header faltando), o erro aparece na
tela em vez de sumir numa notificação genérica.

| Sintoma | Causa provável |
|---|---|
| Tela de login da Cloudflare aparece / HTML em vez de JSON | Falta ou erro nos headers `CF-Access-Client-Id`/`CF-Access-Client-Secret` |
| `401` | `SHORTCUT_TOKEN` errado ou ausente no header `Authorization` |
| `422` com lista de categorias/contas | O nome digitado na `List` do Atalho não bate com o cadastrado no banco — a resposta já lista as opções válidas |

Se você renomear uma categoria ou conta pelo site, **edite a `List`**
correspondente no Atalho (passo 2 ou 4) — elas são estáticas, não buscam a
lista atual do servidor a cada execução.

**Acento e caixa não importam na comparação.** "Vale Refeição",
"vale refeicao" e "VALE REFEIÇÃO" encontram o mesmo registro — a busca
normaliza os dois lados antes de comparar (ver
[`TextNormalizer`](backend/src/main/java/br/com/ebls/nasfinance/util/TextNormalizer.java)).
Isso existe porque as migrations semeiam nomes sem diacríticos
("Vale Refeicao"), mas o português natural que qualquer pessoa digita usa
acento — sem essa tolerância, `Alimentação`/`Educação`/`Saúde`/`Vale Refeição`
davam `422` mesmo estando "certos".

---

## Nova Receita (opcional)

Para lançar salário/reembolso pelo celular, duplique este Atalho
(pressione e segure → Duplicate), renomeie para `Nova Receita`, e ajuste:

- Passo 2 (lista de categorias) para: `Salário`, `Freelance`, `Reembolso`,
  `Rendimentos`, `Outros`
- No Request Body do passo 6, adicione a chave `flow` (Text) com valor fixo
  `INCOME`
