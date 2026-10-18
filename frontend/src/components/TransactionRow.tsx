import { Money } from './ui/Money'
import { PhoneIcon } from './ui/icons'
import { formatDayLabel } from '@/lib/format'
import type { Transaction } from '@/types'

interface TransactionRowProps {
  transaction: Transaction
  /** Abre o lançamento para editar. Sem ele, a linha é só leitura. */
  onSelect?: () => void
  /** Mostra o dia na linha de apoio — quando a lista não é agrupada por dia. */
  showDate?: boolean
  /** Recém-chegado pelo canal em tempo real: destaque de um instante. */
  flash?: boolean
}

/**
 * Uma linha de lançamento, igual em toda a interface.
 *
 * A linha inteira é o alvo do toque (e não um lápis de 16 px escondido no
 * hover): no celular não existe hover, e o lápis ficava invisível ou
 * pequeno demais para o polegar.
 */
export function TransactionRow({ transaction, onSelect, showDate = false, flash = false }: TransactionRowProps) {
  const expense = transaction.flow === 'EXPENSE'
  const title = transaction.description || transaction.categoryName || 'Sem descrição'

  const content = (
    <>
      {/* A cor da categoria é marca de reconhecimento, não informação: o nome
          da categoria vem escrito logo abaixo. */}
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: transaction.categoryColor ?? 'var(--color-faint)' }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[0.9375rem] text-fg">{title}</span>
          {/* Marca o que entrou pelo Atalho do iPhone: ajuda a conferir se a
              automação está funcionando de fato. */}
          {transaction.source === 'SHORTCUT' && <PhoneIcon className="size-3.5 shrink-0 text-faint" />}
        </span>
        <span className="mt-0.5 block truncate text-[0.8125rem] text-faint">
          {transaction.categoryName ?? 'Sem categoria'} · {transaction.accountName}
          {showDate && ` · ${formatDayLabel(transaction.occurredOn)}`}
        </span>
      </span>
      <Money value={transaction.amount} sign={expense ? '-' : '+'} className="shrink-0 text-[0.9375rem] font-semibold" />
    </>
  )

  const base = `flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-2.5 text-left ${flash ? 'flash' : ''}`

  return (
    <li>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className={`${base} transition-colors duration-150 hover:bg-white/[0.03] active:bg-white/[0.06]`}
        >
          {content}
        </button>
      ) : (
        <div className={base}>{content}</div>
      )}
    </li>
  )
}
