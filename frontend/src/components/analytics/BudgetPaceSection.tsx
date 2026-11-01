import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Money } from '@/components/ui/Money'
import { card, secondaryButton } from '@/components/ui/styles'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { useReveal } from '@/hooks/useMotion'
import { useResource } from '@/hooks/useResource'
import { getBudgetPace } from '@/lib/api'
import { DEMO } from '@/lib/demo'
import { formatMonthName } from '@/lib/format'
import type { BudgetPace, BudgetPaceRow, BudgetPaceStatus } from '@/types'
import { CountUpMoney, EmptyCard, SectionError, SectionHeader, Skeleton, StaleNotice } from './common'

/**
 * Onde a marca do teto fica no trilho. Em 75%, e não na ponta: sobra um
 * quarto da régua para mostrar o quanto passa (até 133% do teto) — e, como a
 * régua de cada linha é o próprio teto, as marcas ficam alinhadas umas sob as
 * outras e a coluna inteira se lê de relance: o que cruza a linha, passou.
 */
const TETO_AT = 0.75

/**
 * Ritmo do teto: para cada categoria com teto, o que já foi, onde o ritmo
 * atual leva no fim do mês e quanto dá para gastar por dia para caber.
 *
 * É a pergunta do dia a dia ("ainda posso pedir comida esta semana?"), por
 * isso abre a página. Linguagem de estimativa do começo ao fim — "no ritmo
 * atual", "por volta de": a projeção é uma reta (gasto ÷ dias × dias do mês)
 * e não sabe que o aluguel já foi pago e não volta este mês.
 */
export function BudgetPaceSection() {
  const titleId = useId()
  const { data, loading, refreshing, error, reload } = useResource('budget-pace', () => getBudgetPace())

  return (
    <section aria-labelledby={titleId}>
      <SectionHeader
        id={titleId}
        title="Ritmo do teto"
        support={
          data
            ? `Dia ${data.throughDay} de ${data.daysInMonth}: quanto já foi de cada teto e onde o ritmo atual chega.`
            : 'Quanto já foi de cada teto e onde o ritmo atual chega no fim do mês.'
        }
      />
      {loading ? (
        <div
          aria-busy="true"
          aria-label="Carregando o ritmo do teto"
          className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <Skeleton className="h-[13rem]" rows={1} />
          <Skeleton className="h-[22rem]" rows={4} />
        </div>
      ) : !data ? (
        <SectionError what="O ritmo do teto" error={error} onRetry={reload} />
      ) : (
        <div aria-busy={refreshing}>
          <StaleNotice error={error} />
          <PaceBody data={data} />
        </div>
      )}
    </section>
  )
}

function PaceBody({ data }: { data: BudgetPace }) {
  const { hidden } = useMoneyVisibility()
  const [ref, revealed] = useReveal<HTMLDivElement>()

  if (data.rows.length === 0) {
    return (
      <EmptyCard
        title="Nenhuma categoria tem teto"
        action={
          // Na demonstração as configurações são só de leitura: o convite
          // para definir um teto levaria a um formulário que não salva.
          DEMO ? undefined : (
            <Link to="/configuracoes" className={secondaryButton}>
              Definir um teto
            </Link>
          )
        }
      >
        Com um teto mensal numa categoria, ela aparece aqui: quanto já foi, para onde o ritmo leva e quanto dá para gastar por
        dia.
      </EmptyCard>
    )
  }

  // Oculto, a ordem por risco já contaria quem estourou: vira alfabética.
  const rows = hidden ? [...data.rows].sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'pt-BR')) : data.rows

  return (
    <div ref={ref} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <PaceSummary data={data} revealed={revealed} hidden={hidden} />
      <div className={card}>
        {!hidden && <PaceLegend />}
        <ul className="divide-y divide-separator pt-1">
          {rows.map((row, index) => (
            <PaceRow key={row.categoryId} row={row} index={index} revealed={revealed} hidden={hidden} />
          ))}
        </ul>
      </div>
    </div>
  )
}

const STATUS: Record<BudgetPaceStatus, { label: string; plural: string; tone: string }> = {
  OK: { label: 'No ritmo', plural: 'no ritmo', tone: 'text-accent' },
  WARN: { label: 'Pode passar', plural: 'podem passar', tone: 'text-warning' },
  OVER: { label: 'Passou', plural: 'passaram', tone: 'text-negative' },
}

/**
 * O número do mês e o placar: quantos tetos passaram, quantos podem passar.
 * A barra fina do mês é a referência do ritmo — 58% do mês andado com 80% do
 * teto gasto é a conta que a pessoa faz de cabeça; a barra faz por ela.
 */
function PaceSummary({ data, revealed, hidden }: { data: BudgetPace; revealed: boolean; hidden: boolean }) {
  const count = (status: BudgetPaceStatus) => data.rows.filter((row) => row.status === status).length
  const over = count('OVER')
  const warn = count('WARN')
  const ok = count('OK')
  const spent = data.rows.reduce((total, row) => total + row.spent, 0)
  const budget = data.rows.reduce((total, row) => total + row.budget, 0)
  const elapsed = data.throughDay / data.daysInMonth
  const name = formatMonthName(`${data.month}-01`)

  const headline =
    over > 0
      ? `${over} ${over === 1 ? 'teto já passou' : 'tetos já passaram'}`
      : warn > 0
        ? `${warn} ${warn === 1 ? 'categoria pode passar' : 'categorias podem passar'} do teto`
        : 'Tudo dentro do teto, no ritmo atual'

  return (
    <div className={`${card} px-5 py-5`}>
      <p className="text-[0.9375rem] text-dim">Gasto nas categorias com teto</p>
      <CountUpMoney
        value={spent}
        active={revealed}
        className="mt-1 block text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg"
      />
      <p className="mt-1 text-[0.875rem] text-faint">
        de <Money value={budget} /> somando os tetos
      </p>

      {/* O mês andado: a régua contra a qual cada teto se mede. */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
          <span className="text-dim">
            {name.charAt(0).toUpperCase() + name.slice(1)}, dia {data.throughDay} de {data.daysInMonth}
          </span>
          <span className="text-faint tabular">{Math.round(elapsed * 100)}% do mês</span>
        </div>
        <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="slide-x h-full rounded-full bg-dim"
            style={{ transform: `translateX(${((revealed ? elapsed : 0) - 1) * 100}%)` }}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-separator pt-4">
        {hidden ? (
          // O placar diz quem estourou sem dizer quanto: oculto também.
          <p className="text-[0.9375rem] text-faint">Ritmo oculto. Toque no olho para ver.</p>
        ) : (
          <>
            <p className="text-[1.25rem] leading-tight font-bold text-fg">{headline}</p>
            {/* O placar só quando há mais de um estado: "8 passaram" embaixo
                de "8 tetos já passaram" repetiria a manchete. */}
            {[over, warn, ok].filter((value) => value > 0).length > 1 && (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem]">
                {(
                  [
                    ['OVER', over],
                    ['WARN', warn],
                    ['OK', ok],
                  ] as const
                )
                  .filter(([, value]) => value > 0)
                  .map(([status, value]) => (
                    <li key={status} className={`inline-flex items-center gap-1.5 ${STATUS[status].tone}`}>
                      <StatusIcon status={status} />
                      <span className="tabular">{value}</span>
                      <span className="text-dim">{value === 1 ? STATUS[status].label.toLowerCase() : STATUS[status].plural}</span>
                    </li>
                  ))}
              </ul>
            )}
            {/* Nos primeiros dias a reta é quase só chute: um mercado no dia
                2 vira "vai gastar 15 vezes isso". Avisar antes do susto. */}
            {data.throughDay <= 5 && (
              <p className="mt-2 text-[0.8125rem] text-faint">Começo de mês: com poucos dias, a projeção muda rápido.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PaceLegend() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3.5 text-[0.8125rem] text-faint">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-full bg-dim" />
        até hoje
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-full border-[1.5px] border-dashed border-dim" />
        no ritmo atual
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-0.5 rounded-full bg-fg" />
        teto
      </span>
    </div>
  )
}

function PaceRow({ row, index, revealed, hidden }: { row: BudgetPaceRow; index: number; revealed: boolean; hidden: boolean }) {
  // Régua da linha = o próprio teto em TETO_AT; o que passa de 133% fica
  // preso na ponta e o texto diz o número.
  const ratio = (value: number) => (revealed ? Math.min((value / row.budget) * TETO_AT, 1) : 0)
  const delay = Math.min(index, 8) * 45
  const status = STATUS[row.status]

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-fg">{row.categoryName}</span>
        <span className="shrink-0 text-right text-[0.9375rem]">
          <Money value={row.spent} className="font-semibold text-fg" />
          <span className="text-[0.8125rem] text-faint">
            {' '}
            de <Money value={row.budget} />
          </span>
        </span>
      </div>

      <div className="mt-2 ml-[1.375rem] flex items-center gap-3">
        {/* overflow-x: clip deixa a marca do teto passar do trilho na
            vertical sem a camada deslocada empurrar a página para o lado. */}
        <span className="relative h-2 min-w-0 flex-1 overflow-x-clip" aria-hidden="true">
          <span className="absolute inset-0 overflow-hidden rounded-full bg-white/[0.06]">
            {!hidden && (
              <>
                {/* A projeção é uma barra tracejada inteira por baixo da
                    sólida: só aparece o trecho que vai além do gasto. Chega
                    depois da sólida, para ler como "e daqui continua". */}
                {row.projected > row.spent && (
                  <span
                    className="slide-x absolute inset-0 rounded-full border-[1.5px] border-dashed"
                    style={{
                      borderColor: row.color,
                      backgroundColor: `color-mix(in srgb, ${row.color} 16%, transparent)`,
                      transform: `translateX(${(ratio(row.projected) - 1) * 100}%)`,
                      transitionDelay: `${delay + 250}ms`,
                    }}
                  />
                )}
                <span
                  className="slide-x absolute inset-0 rounded-full"
                  style={{
                    backgroundColor: row.color,
                    transform: `translateX(${(ratio(row.spent) - 1) * 100}%)`,
                    transitionDelay: `${delay}ms`,
                  }}
                />
              </>
            )}
          </span>
          <span
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-fg"
            style={{ left: `${TETO_AT * 100}%` }}
          />
        </span>
        {hidden ? (
          <span className="w-[6.75rem] shrink-0 text-right text-[0.8125rem] text-faint">
            <span aria-hidden="true">••</span>
            <span className="sr-only">situação oculta</span>
          </span>
        ) : (
          // Cor, ícone e palavra juntos: o estado não pode depender só do
          // vermelho, nem para quem não distingue cor nem em tela escura.
          <span
            className={`inline-flex w-[6.75rem] shrink-0 items-center justify-end gap-1 text-[0.8125rem] font-semibold ${status.tone}`}
          >
            <StatusIcon status={row.status} />
            {status.label}
          </span>
        )}
      </div>

      {!hidden && <PaceDetail row={row} />}
    </li>
  )
}

/** A frase da linha: o que a barra mostra, em número e com o que fazer. */
function PaceDetail({ row }: { row: BudgetPaceRow }) {
  const base = 'mt-1.5 ml-[1.375rem] text-[0.8125rem] leading-snug text-faint'
  if (row.status === 'OVER') {
    return (
      <p className={base}>
        <Money value={row.spent - row.budget} className="text-dim" /> acima do teto. No ritmo atual, por volta de{' '}
        <Money value={row.projected} /> no fim do mês.
        <Fixed row={row} />
      </p>
    )
  }
  const allowance =
    row.dailyAllowance !== null && row.dailyAllowance > 0 ? (
      <>
        {row.status === 'WARN' ? 'Para caber, até ' : 'Dá para gastar '}
        <Money value={row.dailyAllowance} className="text-dim" /> por dia até o fim do mês.
      </>
    ) : null
  return (
    <p className={base}>
      {row.status === 'WARN' ? (
        <>No ritmo atual, chega a uns {Math.round(row.projectedPct)}% do teto. </>
      ) : row.spent === 0 ? (
        // Sem gasto, a reta dá zero: "fecha em R$ 0,00" seria uma promessa.
        <>Nada ainda este mês. </>
      ) : (
        <>
          No ritmo atual, fecha por volta de <Money value={row.projected} />.{' '}
        </>
      )}
      {allowance}
      <Fixed row={row} />
    </p>
  )
}

/**
 * O fixo já pago fica fora do ritmo (ver ANALYTICS.md): sem dizer isso, a
 * projeção da Moradia logo depois do aluguel parece baixa demais.
 */
function Fixed({ row }: { row: BudgetPaceRow }) {
  if (!(row.fixedSpent > 0)) return null
  return (
    <span className="block">
      <Money value={row.fixedSpent} /> já {row.fixedSpent === row.spent ? 'é fixo' : 'são fixos'} e não entra no ritmo.
    </span>
  )
}

/** Três formas diferentes, para o estado se ler também sem cor. */
function StatusIcon({ status }: { status: BudgetPaceStatus }) {
  const common = { viewBox: '0 0 16 16', fill: 'none', className: 'size-4 shrink-0', 'aria-hidden': true } as const
  if (status === 'OK') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5.25 8.25l1.9 1.9 3.6-3.9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (status === 'WARN') {
    return (
      <svg {...common}>
        <path d="M8 2.25l6.1 10.75H1.9L8 2.25z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.5v2.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.1" r="0.85" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.25" fill="currentColor" />
      <path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" className="stroke-void" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
