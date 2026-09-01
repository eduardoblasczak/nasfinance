import { Link } from 'react-router-dom'
import { Card, CardHeader } from './ui/Card'
import { PhoneIcon } from './ui/icons'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Transaction } from '@/types'

interface RecentTransactionsProps {
  transactions: Transaction[]
  /** Id recém-chegado pelo canal em tempo real; recebe destaque momentâneo. */
  flashId?: number | null
  onNew: () => void
}

export function RecentTransactions({ transactions, flashId, onNew }: RecentTransactionsProps) {
  return (
    <Card>
      <CardHeader
        title="últimos lançamentos"
        action={
          <button
            type="button"
            onClick={onNew}
            className="border-none bg-accent px-5 py-3 font-mono text-2xs tracking-[0.1em] text-void uppercase transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-accent-2"
          >
            + novo
          </button>
        }
      />

      {transactions.length === 0 ? (
        <p className="px-7 pb-7 text-sm text-faint">
          Nenhum lançamento ainda. Use "+ novo" para começar.
        </p>
      ) : (
        <ul className="px-7 pb-7">
          {transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              flash={flashId === transaction.id}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-ghost px-7 py-4">
        <Link
          to="/lancamentos"
          className="eyebrow transition-colors duration-400 hover:text-accent"
        >
          ver todos →
        </Link>
      </div>
    </Card>
  )
}

function TransactionRow({ transaction, flash }: { transaction: Transaction; flash: boolean }) {
  const isExpense = transaction.flow === 'EXPENSE'

  return (
    <li
      className={`flex items-center gap-4 border-b border-ghost/50 py-3.5 last:border-0 ${flash ? 'flash' : ''}`}
    >
      <span
        className="size-1.5 shrink-0"
        style={{ backgroundColor: transaction.categoryColor ?? '#898781' }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-fg">
            {transaction.description || transaction.categoryName || 'Sem descrição'}
          </span>
          {/* Marca o que entrou pelo Atalho do iPhone: ajuda a conferir se a
              automação está funcionando de fato. */}
          {transaction.source === 'SHORTCUT' && <PhoneIcon />}
        </div>
        <p className="eyebrow mt-1 tracking-[0.08em]">
          {transaction.categoryName ?? 'sem categoria'} · {transaction.accountName} ·{' '}
          {formatDate(transaction.occurredOn)}
        </p>
      </div>

      {/* O sinal carrega a direção; a cor apenas reforça. */}
      <span
        className={`shrink-0 font-mono text-sm tabular ${isExpense ? 'text-fg' : 'text-accent'}`}
      >
        {isExpense ? '−' : '+'} {formatCurrency(transaction.amount)}
      </span>
    </li>
  )
}
