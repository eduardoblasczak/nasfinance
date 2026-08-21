import { Card, CardHeader } from './ui/Card'
import { formatCurrency } from '@/lib/format'
import type { AccountBalance } from '@/types'

interface AccountBalancesProps {
  balances: AccountBalance[]
}

/**
 * Saldo por conta.
 *
 * FORMA: lista, nao grafico. Sao poucos valores, cada um lido individualmente
 * ("quanto tenho no vale refeicao?") e nao comparado entre si — comparar o
 * saldo da conta corrente com o do vale refeicao nao responde pergunta
 * nenhuma. Um grafico de barras aqui adicionaria tinta sem adicionar leitura.
 */
export function AccountBalances({ balances }: AccountBalancesProps) {
  if (balances.length === 0) {
    return (
      <Card>
        <CardHeader title="Contas" />
        <p className="px-5 pb-5 text-sm text-ink-muted">Nenhuma conta cadastrada.</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Contas" subtitle="Saldo atual e movimento do periodo" />

      <ul className="divide-y divide-hairline border-t border-hairline">
        {balances.map((account) => {
          const negative = account.balance < 0

          return (
            <li key={account.accountId} className="flex items-center gap-3 px-5 py-3">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: account.color }}
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{account.accountName}</p>
                <p className="mt-0.5 text-xs text-ink-muted tabular">
                  {account.periodExpense > 0 && `− ${formatCurrency(account.periodExpense)}`}
                  {account.periodExpense > 0 && account.periodIncome > 0 && '  ·  '}
                  {account.periodIncome > 0 && `+ ${formatCurrency(account.periodIncome)}`}
                  {account.periodExpense === 0 && account.periodIncome === 0 && 'Sem movimento'}
                </p>
              </div>

              {/* Saldo negativo usa cor de status E sinal explicito: a cor
                  sozinha nao comunicaria nada a quem nao a distingue. */}
              <span
                className={`shrink-0 text-sm font-semibold tabular ${
                  negative ? 'text-critical' : 'text-ink'
                }`}
              >
                {formatCurrency(account.balance)}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
