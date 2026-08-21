import { Link } from 'react-router-dom'
import { Smartphone, ArrowRight } from 'lucide-react'
import { Card, CardHeader } from './ui/Card'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Transaction } from '@/types'

interface RecentTransactionsProps {
  transactions: Transaction[]
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <Card>
      <CardHeader
        title="Ultimos lancamentos"
        action={
          <Link
            to="/lancamentos"
            className="flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Ver todos
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />

      {transactions.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-muted">
          Nenhum lancamento ainda. Use o botao "Novo lancamento" para comecar.
        </p>
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      )}
    </Card>
  )
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isExpense = transaction.flow === 'EXPENSE'

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: transaction.categoryColor ?? '#898781' }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm text-ink">
            {transaction.description || transaction.categoryName || 'Sem descricao'}
          </p>
          {/* Marca visualmente o que entrou pelo Atalho do iPhone: ajuda a
              conferir se a automacao esta funcionando de fato. */}
          {transaction.source === 'SHORTCUT' && (
            <Smartphone
              className="size-3 shrink-0 text-ink-muted"
              aria-label="Registrado pelo atalho do iPhone"
            />
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {transaction.categoryName ?? 'Sem categoria'} · {transaction.accountName} ·{' '}
          {formatDate(transaction.occurredOn)}
        </p>
      </div>

      {/* O sinal +/− carrega a direcao; a cor apenas reforca. */}
      <span
        className={`shrink-0 text-sm font-semibold tabular ${
          isExpense ? 'text-ink' : 'text-good'
        }`}
      >
        {isExpense ? '−' : '+'} {formatCurrency(transaction.amount)}
      </span>
    </li>
  )
}
