import { useId, useState } from 'react'
import { Money } from '@/components/ui/Money'
import { ChevronDownIcon } from '@/components/ui/icons'
import { card, quietButton } from '@/components/ui/styles'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { useReveal } from '@/hooks/useMotion'
import { useResource } from '@/hooks/useResource'
import { getTopMerchants } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import type { Merchant, TopMerchants } from '@/types'
import {
  CountUpMoney,
  EmptyCard,
  SectionError,
  SectionHeader,
  Skeleton,
  StaleNotice,
  WindowPicker,
  formatShare,
  monthsLabel,
} from './common'

export const MERCHANT_WINDOWS = [1, 3, 6, 12] as const

/** O ranking abre com dez; "Ver todos os N" pede o máximo do contrato. */
const TOP = 10
const ALL = 50

interface Props {
  months: number
  onMonthsChange: (months: number) => void
}

/**
 * Onde mais gasto: os estabelecimentos que mais levaram, com quantas vezes e
 * o tíquete médio — a diferença entre "vou muito" e "cada ida sai cara".
 *
 * A barra é a fatia do total gasto na janela, na régua do primeiro colocado:
 * as fatias costumam ser pequenas (o maior leva 10%, 15%), e numa régua de
 * 0 a 100% todas as barras seriam tocos iguais. O número da fatia vem
 * escrito ao lado, para a régua relativa não enganar.
 */
export function MerchantsSection({ months, onMonthsChange }: Props) {
  const titleId = useId()
  // O limite só cresce: depois de buscar 50, voltar para "os 10 primeiros" é
  // um corte na tela, sem outra ida ao servidor.
  const [limit, setLimit] = useState(TOP)
  const [showAll, setShowAll] = useState(false)
  const { data, loading, refreshing, error, reload } = useResource(`${months}|${limit}`, () => getTopMerchants({ months, limit }))

  return (
    <section aria-labelledby={titleId}>
      <SectionHeader
        id={titleId}
        title="Onde mais gasto"
        support={`Os lugares que mais levaram ${monthsLabel(months)}, pela descrição do lançamento.`}
      >
        <WindowPicker label="Meses no ranking" value={months} options={MERCHANT_WINDOWS} onChange={onMonthsChange} />
      </SectionHeader>
      {loading ? (
        <div aria-busy="true" aria-label="Carregando os estabelecimentos" className="grid grid-cols-1 gap-3">
          <Skeleton className="h-[11rem]" rows={1} />
          <Skeleton className="h-[30rem] lg:h-[20rem]" rows={6} />
        </div>
      ) : !data ? (
        <SectionError what="O ranking de estabelecimentos" error={error} onRetry={reload} />
      ) : (
        <div aria-busy={refreshing} className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
          <StaleNotice error={error} />
          <MerchantsBody
            data={data}
            months={months}
            showAll={showAll}
            loadingAll={refreshing && limit === ALL && data.items.length <= TOP}
            onShowAll={(value) => {
              setShowAll(value)
              if (value) setLimit(ALL)
            }}
          />
        </div>
      )}
    </section>
  )
}

interface BodyProps {
  data: TopMerchants
  months: number
  showAll: boolean
  loadingAll: boolean
  onShowAll: (value: boolean) => void
}

function MerchantsBody({ data, months, showAll, loadingAll, onShowAll }: BodyProps) {
  const { hidden } = useMoneyVisibility()
  const [ref, revealed] = useReveal<HTMLDivElement>()

  if (data.items.length === 0) {
    return (
      <EmptyCard title={`Nenhum estabelecimento ${monthsLabel(months)}`}>
        Cada lugar onde você gastou aparece aqui, somado pela descrição do lançamento — o mesmo mercado no débito e no cartão
        conta como um só.
      </EmptyCard>
    )
  }

  const share = (item: Merchant) => (data.totalExpense > 0 ? (item.total / data.totalExpense) * 100 : 0)
  const topShare = data.items.slice(0, 3).reduce((sum, item) => sum + share(item), 0)
  const maxShare = Math.max(...data.items.map(share), 0.0001)
  // Oculto, a ordem por valor seria o próprio segredo: vira alfabética.
  const items = hidden ? [...data.items].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')) : data.items
  const visible = showAll ? items : items.slice(0, TOP)
  // Há mais para ver só se a janela tem mais lugares do que a lista mostra
  // fechada; acima de 50 (o teto do contrato), o botão diz que são os maiores.
  const canExpand = data.totalMerchants > Math.min(data.items.length, TOP)
  const expandLabel =
    data.totalMerchants <= ALL ? `Ver todos os ${data.totalMerchants}` : `Ver os ${ALL} maiores de ${data.totalMerchants}`
  // Linhas por coluna no desktop; no celular a grade tem uma coluna só e as
  // linhas a mais entram implícitas, na ordem normal.
  const rows = Math.ceil(visible.length / 2)

  return (
    // No desktop, resumo em faixa por cima e o ranking em duas colunas (1–5 |
    // 6–10): ao lado de um resumo curto, uma coluna só de dez linhas deixava
    // meia tela vazia.
    <div ref={ref} className="grid grid-cols-1 gap-3">
      <div className={`${card} px-5 py-5 lg:flex lg:items-end lg:justify-between lg:gap-10`}>
        <div>
          <p className="text-[0.9375rem] text-dim">Gasto {monthsLabel(months)}</p>
          <CountUpMoney
            value={data.totalExpense}
            active={revealed}
            className="mt-1 block text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg"
          />
          <p className="mt-1 text-[0.875rem] text-faint">
            em {data.totalMerchants} {data.totalMerchants === 1 ? 'lugar' : 'lugares diferentes'}
          </p>
        </div>
        {!hidden && data.items.length >= 3 && (
          <p className="mt-4 border-t border-separator pt-4 text-[1.125rem] leading-tight font-bold text-fg lg:mt-0 lg:max-w-[28rem] lg:border-t-0 lg:pt-0 lg:text-right">
            Os 3 primeiros levam <span className="tabular">{formatShare(topShare)}</span>
            <span className="mt-1 block text-[0.875rem] font-normal text-faint">
              {data.items
                .slice(0, 3)
                .map((item) => item.label)
                .join(', ')}
              .
            </span>
          </p>
        )}
      </div>

      <div className={card}>
        <ol
          className="grid grid-cols-1 divide-y divide-separator lg:grid-flow-col lg:grid-cols-2"
          style={{ gridTemplateRows: `repeat(${rows}, auto)` }}
        >
          {visible.map((item, index) => (
            <MerchantRow
              lastOfColumn={index === rows - 1}
              key={item.key}
              item={item}
              rank={hidden ? null : index + 1}
              share={share(item)}
              ratio={revealed ? share(item) / maxShare : 0}
              index={index}
              hidden={hidden}
            />
          ))}
        </ol>
        {(canExpand || showAll) && (
          <div className="border-t border-separator px-2 py-1">
            <button
              type="button"
              aria-expanded={showAll}
              disabled={loadingAll}
              onClick={() => onShowAll(!showAll)}
              // Largura mínima: o rótulo troca para "Carregando…" e o botão
              // não pode encolher debaixo do dedo.
              className={`${quietButton} w-full min-w-[12rem]`}
            >
              {loadingAll ? 'Carregando…' : showAll ? `Mostrar só os ${TOP} primeiros` : expandLabel}
              <ChevronDownIcon className={`size-4 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface RowProps {
  /** Última da primeira coluna no desktop: sem a linha divisória embaixo. */
  lastOfColumn: boolean
  item: Merchant
  rank: number | null
  share: number
  ratio: number
  index: number
  hidden: boolean
}

function MerchantRow({ lastOfColumn, item, rank, share, ratio, index, hidden }: RowProps) {
  const color = item.categoryColor ?? 'var(--color-faint)'
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${lastOfColumn ? 'lg:border-b-0' : ''}`}>
      <span
        className="mt-px w-6 shrink-0 text-right text-[0.875rem] font-semibold text-faint tabular"
        aria-hidden={rank === null}
      >
        {rank === null ? '·' : rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className="min-w-0 flex-1 truncate text-[0.9375rem] text-fg">{item.label}</p>
          <Money value={item.total} className="shrink-0 text-[0.9375rem] font-semibold text-fg" />
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-faint">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="min-w-0 truncate">
            {item.categoryName ?? 'Sem categoria'} · {item.count} {item.count === 1 ? 'vez' : 'vezes'}
            {item.count > 1 && (
              <>
                {' '}
                · <Money value={item.average} /> cada<span className="sr-only">, em média</span>
              </>
            )}
          </span>
        </p>
        {!hidden && (
          <div className="mt-2 flex items-center gap-3">
            <span aria-hidden="true" className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="slide-x absolute inset-0 rounded-full"
                style={{
                  backgroundColor: color,
                  transform: `translateX(${(ratio - 1) * 100}%)`,
                  transitionDelay: `${Math.min(index, 10) * 40}ms`,
                }}
              />
            </span>
            <span className="w-12 shrink-0 text-right text-[0.8125rem] text-dim tabular">
              {formatShare(share)}
              <span className="sr-only"> do total gasto ({formatCurrency(item.total)})</span>
            </span>
          </div>
        )}
      </div>
    </li>
  )
}
