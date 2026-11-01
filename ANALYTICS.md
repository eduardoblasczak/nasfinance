# Análises — leva 1

Página nova `/analises` no app. Três rotas só de leitura, todas atrás do Access em produção e da
`guardRead` na demo. Tipos em `frontend/src/types.ts` (seção "análises"); a demo os reaproveita
por `demo/src/contract.ts`.

## Regras que valem para as três

- Só `NOT_IGNORED` (ver `Transaction`). Direção pelo `flow`, nunca pelo sinal: `amount` é sempre positivo.
- "Hoje" e o mês corrente em `America/Sao_Paulo` (a mesma config que o `DashboardResource` usa).
- Mês no formato `YYYY-MM`. Valores em reais com 2 casas (`BigDecimal` no back, `number` no JSON).
- Parâmetro fora da faixa ou malformado: 400 no formato `ApiError`, com o motivo em `details`.
- Agregação no banco (`GROUP BY`), não em Java: a VM tem 1 GB.

## GET /api/v1/analytics/categories?month=YYYY-MM&baseline=6  → `CategoryTrends`

- `month` opcional (padrão: mês corrente); não pode ser futuro. `baseline` 1–12, padrão 6.
- `throughDay` = hoje se `month` é o corrente, senão o último dia do mês.
- Base = os `baseline` meses imediatamente anteriores. No mês corrente, `averageToDate` compara
  janelas iguais (dia 1 a `throughDay`, limitado ao tamanho de cada mês), para não punir o mês em
  andamento. Em mês fechado, `averageToDate` = `averageFullMonth`: fevereiro fechado se compara com
  os meses de base inteiros, não com o dia 1 a 28 de cada um.
- Só despesas. Sem categoria vira uma linha `categoryId: null`, nome "Sem categoria".
- `rows` ordenadas por `current` decrescente; inclui categorias com `current` 0 mas
  `averageFullMonth` > 0. `deltaPct` nulo com `averageFullMonth` > 0 = gasto que veio antes do
  costume ("adiantado"); com `averageFullMonth` 0 = categoria nova.
- `monthly`: os meses de base inteiros e, por último, o mês de referência só até `throughDay`.

## GET /api/v1/analytics/recurring?months=6  → `RecurringExpenses`

- `months` 3–12, padrão 6. Janela = os `months` meses fechados mais o corrente.
- Só despesas. Série = descrição normalizada (minúsculas, sem acento, sem dígitos e pontuação,
  espaços colapsados) + conta. Descrição nula usa o nome da categoria.
- É recorrente se aparece em pelo menos 3 meses distintos da janela e o valor varia pouco
  (desvio padrão / média ≤ 0,25), contando no máximo um lançamento por mês (o de maior valor).
- E é cobrança, não hábito: a série tem no máximo 1,5 lançamento por mês em que apareceu
  (total de lançamentos / `monthsSeen` ≤ 1,5). Sem isso, o maior Uber ou iFood de cada mês parece
  fixo e infla o custo mensal.
- Série que parou sai da lista: se `lastDate` é anterior a 45 dias antes de hoje, a cobrança não
  aconteceu no último ciclo e não entra em `items` nem em `monthlyTotal`.
- `items` ordenados por `averageAmount` decrescente.
- A máquina propõe, o usuário decide (regra da casa): a rota só lista, não altera nada.

## GET /api/v1/analytics/cashflow?months=12  → `Cashflow`

- `months` 3–24, padrão 12: o mês corrente (`partial: true`) e os anteriores, do mais antigo ao mais novo.
- Mês sem movimento aparece com zeros (série contínua para o gráfico).
- `averageNet` ignora o mês parcial.

## Demo

A API espelho (`demo/src`) responde as mesmas três rotas com a mesma semântica sobre o seed. O seed
precisa cobrir pelo menos 12 meses para o fluxo de caixa e ter cobranças fixas suficientes para a
recorrência aparecer.

---

# Análises — leva 2

Mesmas regras gerais da leva 1 (NOT_IGNORED, direção pelo `flow`, America/Sao_Paulo, 400 no formato
`ApiError`, agregação no banco). Tipos na seção "análises, leva 2" de `frontend/src/types.ts`.

## GET /api/v1/analytics/calendar?months=6  → `SpendingCalendar`

- `months` 1–12, padrão 6. Janela = do dia 1 do mês `months − 1` meses atrás até hoje.
- Só despesas. Um item por dia da janela, inclusive os sem gasto (série contínua).
- A média por dia da semana sai daqui, na tela: não há rota própria.

## GET /api/v1/analytics/merchants?months=3&limit=10  → `TopMerchants`

- `months` 1–12, padrão 3, **contando o mês corrente** (como no calendário: do dia 1 do mês
  `months − 1` meses atrás até hoje; `1` = só este mês). `limit` 1–50, padrão 10.
- `totalMerchants` = quantos estabelecimentos há na janela antes do corte do `limit`.
- Só despesas com descrição; a chave usa a mesma normalização da recorrência, **sem** a conta
  (o mesmo mercado no débito e no cartão é um estabelecimento só).
- Ordenado por `total` decrescente. Categoria = a do lançamento mais recente da série.

## GET /api/v1/analytics/budget-pace  → `BudgetPace`

- Sempre o mês corrente. Só categorias com teto (`monthly_budget`) e despesa ou teto > 0.
- `status`: `OVER` se `spent > budget`; senão `WARN` se `projected > budget`; senão `OK`.
- `throughDay` = hoje; `dailyAllowance` = (budget − spent) / (daysInMonth − throughDay + 1).
- Só o gasto variável segue o ritmo: `fixedSpent` = despesas do mês que pertencem a séries
  recorrentes (a regra de `/recurring` com a janela padrão), e
  `projected = fixedSpent + (spent − fixedSpent) / throughDay × daysInMonth`. Sem isso, o aluguel pago
  no dia 10 projeta a Moradia a 300% do teto. A tela diz "no ritmo atual", não "vai gastar".
- Ordenado por `projectedPct` decrescente.

## GET /api/v1/analytics/sources?months=3  → `EntrySources`

- `months` 1–12, padrão 3, contando o mês corrente (mesma janela de `/merchants`). Só despesas.
- `sources`: contagem e total por `TransactionSource` (todas as fontes, mesmo com zero).
- Confirmação: um lançamento MANUAL ou SHORTCUT está confirmado quando o extrato trouxe a mesma
  compra — uma transação AGGREGATOR ligada a ele por `duplicateOf` (qualquer `reviewStatus`, inclusive
  a duplicata resolvida como ignorada). `pendingReview` conta os manuais com uma suspeita de
  duplicata ainda `PENDING` apontando para eles — e esses também entram em `confirmedByBank`:
  pendentes são um subconjunto dos confirmados, não uma parte separada. A rota não muda nada: só conta.
- Para o vínculo sobreviver, "Não contar" na fila mantém o `duplicateOf` da cópia ignorada
  (`ReviewService.ignore`). "Manter os dois" apaga o vínculo (não é a mesma compra), e
  "Consolidar" apaga o lançamento manual — a compra passa a contar como AGGREGATOR e sai de
  `manualEntries`. Duplicatas resolvidas com "Não contar" antes dessa mudança perderam o vínculo.

## Demo

A API espelho responde as quatro rotas com a mesma semântica, sobre o histórico em memória (sem
nova leitura ampla do SQLite). O seed precisa ter tetos em algumas categorias e alguns lançamentos
de Atalho confirmados por um AGGREGATOR ligado por `duplicateOf`, para a leva 2 ter o que mostrar.
