import { useId, useState } from 'react'
import { Money } from '@/components/ui/Money'
import { ChevronDownIcon } from '@/components/ui/icons'
import { card, quietButton } from '@/components/ui/styles'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { useReveal } from '@/hooks/useMotion'
import { useResource } from '@/hooks/useResource'
import { getRecurringExpenses } from '@/lib/api'
import { formatDayMonthShort, formatMonthName, todayIsoInSaoPaulo } from '@/lib/format'
import type { RecurringExpense, RecurringExpenses } from '@/types'
import { CountUpMoney, SectionError, SectionHeader, Skeleton } from './common'

/** Quantas cobranças antes do "Mostrar todas". */
const TOP = 6

/**
 * Última cobrança que fugiu da média por mais que isto vira aviso ("última
 * R$ 59,90"): é o reajuste da assinatura que ninguém avisou.
 */
const DRIFT = 0.05

/**
 * Gastos fixos: o que se repete todo mês com valor parecido.
 *
 * Linguagem de proposta do começo ao fim ("parece fixo", "por volta do dia"):
 * a detecção é estatística, e a regra da casa é que a máquina propõe e a
 * pessoa decide. Uma afirmação errada ("sua assinatura de R$ 55,90") ensina a
 * desconfiar de todo o resto da tela.
 */
export function RecurringSection() {
  const titleId = useId()
  const { data, loading, refreshing, error, reload } = useResource('recurring', () => getRecurringExpenses())

  return (
    <section aria-labelledby={titleId}>
      <SectionHeader
        id={titleId}
        title="Gastos fixos"
        support={`O que parece se repetir todo mês com valor parecido, nos últimos ${data?.windowMonths ?? 6} meses.`}
      />
      {loading ? (
        <Skeleton className="h-[26rem]" rows={5} />
      ) : !data ? (
        <SectionError what="A lista de gastos fixos" error={error} onRetry={reload} />
      ) : (
        <div aria-busy={refreshing}>
          <RecurringBody data={data} />
        </div>
      )}
    </section>
  )
}

function RecurringBody({ data }: { data: RecurringExpenses }) {
  const { hidden } = useMoneyVisibility()
  const [ref, revealed] = useReveal<HTMLDivElement>()
  const [showAll, setShowAll] = useState(false)

  if (data.items.length === 0) {
    return (
      <div className={`${card} px-6 py-10 text-center`}>
        <p className="text-[1.0625rem] font-semibold text-fg">Nada parece fixo por enquanto</p>
        <p className="mx-auto mt-2 max-w-[24rem] text-[0.9375rem] text-dim">
          Aparece aqui a cobrança que vem com valor parecido em pelo menos 3 meses diferentes — aluguel, plano,
          assinatura.
        </p>
      </div>
    )
  }

  // Oculto, a ordem por valor seria um ranking: vira alfabética.
  const items = hidden ? [...data.items].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')) : data.items
  const visible = showAll ? items : items.slice(0, TOP)
  const count = data.items.length

  return (
    <div ref={ref} className={card}>
      <div className="px-5 pt-5 pb-4">
        <p className="text-[0.9375rem] text-dim">Parece fixo, por mês</p>
        <CountUpMoney
          value={data.monthlyTotal}
          active={revealed}
          className="mt-1 block text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg"
        />
        <p className="mt-1 text-[0.875rem] text-faint">
          Soma da média de {count} {count === 1 ? 'cobrança' : 'cobranças'}. Uma estimativa pelo histórico.
        </p>
      </div>
      <ul className="divide-y divide-separator border-t border-separator">
        {visible.map((item, index) => (
          <RecurringRow key={item.key} item={item} index={index} revealed={revealed} hidden={hidden} />
        ))}
      </ul>
      {count > TOP && (
        <div className="border-t border-separator px-2 py-1">
          <button type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)} className={`${quietButton} w-full`}>
            {showAll ? 'Mostrar menos' : `Mostrar todas as ${count}`}
            <ChevronDownIcon className={`size-4 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
    </div>
  )
}

function RecurringRow({ item, index, revealed, hidden }: { item: RecurringExpense; index: number; revealed: boolean; hidden: boolean }) {
  const today = todayIsoInSaoPaulo()
  // Data esperada que já passou sem cobrança: talvez tenha sido cancelada,
  // talvez só atrasou. A tela diz o fato ("esperada 28 out.") e deixa a
  // conclusão com quem conhece a conta.
  const overdue = item.nextExpected < today
  const drift = item.averageAmount > 0 && Math.abs(item.lastAmount - item.averageAmount) / item.averageAmount > DRIFT
  const lastMonth = formatMonthName(item.lastDate)

  return (
    <li
      className={`flex items-start gap-3 px-5 py-3 ${revealed ? 'rise' : 'opacity-0'}`}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <span
        className="mt-[0.4375rem] size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: item.categoryColor ?? 'var(--color-faint)' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] text-fg">{item.label}</p>
        <p className="truncate text-[0.8125rem] text-faint">
          {item.categoryName ?? 'Sem categoria'} · {item.accountName}
        </p>
        <p className="text-[0.8125rem] text-faint">
          Por volta do dia {item.typicalDay} · em {item.monthsSeen} meses
          {drift && !hidden && (
            <span className="text-dim">
              {' '}
              · em {lastMonth} veio <Money value={item.lastAmount} />
            </span>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[0.9375rem] font-semibold text-fg">
          <Money value={item.averageAmount} />
          <span className="sr-only"> por mês, em média</span>
        </p>
        <p className={`text-[0.8125rem] tabular ${overdue ? 'text-warning' : 'text-faint'}`}>
          {overdue ? (
            <>
              esperada {formatDayMonthShort(item.nextExpected)}
              <span className="sr-only"> e ainda não apareceu</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">próx. ~</span>
              <span className="sr-only">próxima esperada por volta de </span>
              {formatDayMonthShort(item.nextExpected)}
            </>
          )}
        </p>
      </div>
    </li>
  )
}
