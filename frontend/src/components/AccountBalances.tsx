import { Money } from './ui/Money'
import type { AccountBalance } from '@/types'

interface AccountBalancesProps {
  balances: AccountBalance[]
  /**
   * Linha de movimento do período sob o nome. Desligada quando o período
   * inteiro está vazio: "Sem movimento no período" repetido em toda conta só
   * reforça a impressão de que algo sumiu, e a tela já explica isso uma vez.
   */
  showActivity?: boolean
}

/**
 * Saldo por conta.
 *
 * FORMA: lista, não gráfico. São poucos valores, cada um lido individualmente
 * ("quanto tenho no vale refeição?") e não comparados entre si. Um gráfico
 * de barras aqui acrescentaria tinta sem acrescentar leitura.
 */
export function AccountBalances({ balances, showActivity = true }: AccountBalancesProps) {
  if (balances.length === 0) {
    return <p className="px-4 py-10 text-center text-[0.9375rem] text-faint">Nenhuma conta cadastrada. Crie uma em Ajustes.</p>
  }

  return (
    <ul className="divide-y divide-separator">
      {balances.map((account) => {
        const negative = account.balance < 0
        const moved = account.periodExpense > 0 || account.periodIncome > 0

        return (
          <li key={account.accountId} className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: account.color }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] text-fg">{account.accountName}</p>
              {showActivity && (
                <p className="mt-0.5 truncate text-[0.8125rem] text-faint">
                  {!moved && 'Sem movimento no período'}
                  {account.periodIncome > 0 && <Money value={account.periodIncome} sign="+" />}
                  {account.periodIncome > 0 && account.periodExpense > 0 && '  ·  '}
                  {account.periodExpense > 0 && <Money value={account.periodExpense} sign="-" />}
                </p>
              )}
            </div>
            {/* Negativo: sinal E cor. A cor sozinha não diria nada a quem não
                a distingue. */}
            <Money
              value={account.balance}
              sign={negative ? '-' : 'none'}
              negative={negative}
              className="shrink-0 text-[0.9375rem] font-semibold text-fg"
            />
          </li>
        )
      })}
    </ul>
  )
}
