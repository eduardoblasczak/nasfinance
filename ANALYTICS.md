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
