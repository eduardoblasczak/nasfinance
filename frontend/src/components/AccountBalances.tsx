import { Card, CardHeader } from './ui/Card'
import { formatCurrency } from '@/lib/format'
import type { AccountBalance } from '@/types'

interface AccountBalancesProps {
  balances: AccountBalance[]
}

/**
 * Saldo por conta.
 *
 * FORMA: lista, não gráfico. São poucos valores, cada um lido individualmente
 * ("quanto tenho no vale refeição?") e não comparados entre si — comparar o
 * saldo da conta corrente com o do vale refeição não responde pergunta
 * nenhuma. Um gráfico de barras aqui acrescentaria tinta sem acrescentar
 * leitura.
 */
export function AccountBalances({ balances }: AccountBalancesProps) {
  if (balances.length === 0) {
    return (
      <Card>
        <CardHeader title="contas" />
        <p className="px-7 pb-7 text-sm text-faint">Nenhuma conta cadastrada.</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="contas" subtitle="Saldo atual e movimento do período" />

      <ul className="px-7 pb-7">
        {balances.map((account) => {
          const negative = account.balance < 0

          return (
            <li
              key={account.accountId}
              className="flex items-center gap-4 border-b border-ghost/50 py-3.5 last:border-0"
            >
              <span
                className="size-1.5 shrink-0"
                style={{ backgroundColor: account.color }}
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{account.accountName}</p>
                <p className="eyebrow mt-1 tracking-[0.08em]">
                  {account.periodExpense > 0 && `− ${formatCurrency(account.periodExpense)}`}
                  {account.periodExpense > 0 && account.periodIncome > 0 && '  ·  '}
                  {account.periodIncome > 0 && `+ ${formatCurrency(account.periodIncome)}`}
                  {account.periodExpense === 0 && account.periodIncome === 0 && 'sem movimento'}
                </p>
              </div>

              {/* Saldo negativo usa cor de alerta E o sinal do próprio valor:
                  a cor sozinha não comunicaria nada a quem não a distingue. */}
              <span
                className={`shrink-0 font-mono text-sm tabular ${negative ? 'text-negative' : 'text-fg'}`}
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
