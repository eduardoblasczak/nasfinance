import { useId, useState } from 'react'
import { Money } from '@/components/ui/Money'
import { Segmented } from '@/components/ui/Segmented'
import { card, primaryButton, quietButton } from '@/components/ui/styles'
import { ArrowIcon, ChevronDownIcon } from '@/components/ui/icons'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { useReveal } from '@/hooks/useMotion'
import { useResource } from '@/hooks/useResource'
import { getCategoryTrends } from '@/lib/api'
import { formatCurrency, formatMonthLong, formatMonthName, formatMonthShort } from '@/lib/format'
import type { CategoryTrendRow, CategoryTrends } from '@/types'
import { CountUpMoney, MonthSelect, SectionError, SectionHeader, Skeleton, currentMonth, deltaTone, shiftMonth } from './common'

const BASELINES = [
  { value: '3', label: '3' },
  { value: '6', label: '6' },
  { value: '12', label: '12' },
] as const

/** Quantas linhas antes do "Mostrar todas": seis cabem na altura do resumo. */
const TOP = 6

/**
 * Acima da média, para virar destaque, precisa passar dos dois limites: em
 * porcentagem (15%) e em reais (R$ 20). Só a porcentagem faria "Farmácia
 * +400%" aparecer por R$ 8 a mais; só os reais esconderiam a categoria
 * pequena que dobrou.
 */
const HIGHLIGHT_PCT = 15
const HIGHLIGHT_REAIS = 20

interface Props {
  month: string
  baseline: number
  onMonthChange: (month: string) => void
  onBaselineChange: (baseline: number) => void
}

/**
 * Categorias vs. sua média: onde este mês foge do seu normal.
 *
 * A comparação é de janelas iguais (dia 1 até hoje, nos dois lados) — é o
 * que o contrato chama de `averageToDate`. Comparar o mês em andamento com
 * meses inteiros faria todo começo de mês parecer econômico.
 */
export function CategoryTrendsSection({ month, baseline, onMonthChange, onBaselineChange }: Props) {
  const titleId = useId()
  const { data, loading, refreshing, error, reload } = useResource(`${month}|${baseline}`, () =>
    getCategoryTrends({ month, baseline }),
  )

  return (
    <section aria-labelledby={titleId}>
      <SectionHeader id={titleId} title="Categorias vs. sua média" support={supportLine(data, month, baseline)}>
        <MonthSelect value={month} onChange={onMonthChange} />
        <div className="flex items-center gap-2 text-[0.9375rem] text-dim">
          <span aria-hidden="true">Média de</span>
          <Segmented
            label="Meses na média"
            value={String(baseline) as '3' | '6' | '12'}
            options={BASELINES}
            onChange={(value) => onBaselineChange(Number(value))}
          />
          <span aria-hidden="true">meses</span>
        </div>
      </SectionHeader>

      {loading ? (
        <div aria-busy="true" aria-label="Carregando categorias" className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Skeleton className="h-[15.5rem]" rows={2} />
          <Skeleton className="h-[24rem]" rows={5} />
        </div>
      ) : !data ? (
        <SectionError what="A comparação por categoria" error={error} onRetry={reload} />
      ) : (
        // Trocando o filtro, a resposta anterior esmaece em vez de sumir:
        // as barras andam do valor antigo ao novo quando a nova chega.
        <div aria-busy={refreshing} className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
          {error && (
            <p role="alert" className="mb-3 rounded-[var(--radius-inset)] bg-negative/12 px-4 py-3 text-[0.9375rem] text-fg">
              Não deu para atualizar; os números abaixo são da leitura anterior. {error}
            </p>
          )}
          <TrendsBody data={data} onMonthChange={onMonthChange} />
        </div>
      )}
    </section>
  )
}

function supportLine(data: CategoryTrends | null, month: string, baseline: number): string {
  const months = data?.baselineMonths ?? baseline
  if (data && data.month === currentMonth()) {
    return `Até o dia ${data.throughDay}, contra o mesmo trecho dos ${months} meses anteriores.`
  }
  const name = formatMonthName(`${(data?.month ?? month)}-01`)
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} inteiro, contra a média dos ${months} meses anteriores.`
}

function TrendsBody({ data, onMonthChange }: { data: CategoryTrends; onMonthChange: (month: string) => void }) {
  const { hidden } = useMoneyVisibility()
  const [ref, revealed] = useReveal<HTMLDivElement>()
  const isCurrent = data.month === currentMonth()

  // Nenhum gasto ainda no mês corrente: no dia 1º, toda categoria diria "sem
  // gasto" e o total, R$ 0,00. Em vez de uma lista de ausências, a explicação
  // e o caminho mais provável — ver o mês que acabou.
  if (isCurrent && data.totalCurrent === 0) {
    const previous = shiftMonth(data.month, -1)
    const name = formatMonthName(`${data.month}-01`)
    return (
      <div className={`${card} px-5 py-6 md:max-w-[34rem] md:px-6`}>
        <p className="text-[1.25rem] leading-[1.25] font-bold text-fg">
          {name.charAt(0).toUpperCase() + name.slice(1)} ainda não tem gastos
        </p>
        <p className="mt-2 text-[0.9375rem] text-dim">
          A comparação aparece com a primeira despesa do mês. Enquanto isso, dá para ver como o mês passado fechou.
        </p>
        <button type="button" onClick={() => onMonthChange(previous)} className={`${primaryButton} mt-5`}>
          <ArrowIcon className="size-4" />
          Ver {formatMonthName(`${previous}-01`)}
        </button>
      </div>
    )
  }

  if (data.rows.length === 0) {
    return (
      <div className={`${card} px-6 py-10 text-center`}>
        <p className="text-[1.0625rem] font-semibold text-fg">Sem despesas para comparar</p>
        <p className="mx-auto mt-2 max-w-[24rem] text-[0.9375rem] text-dim">
          Nem neste mês nem nos anteriores. Quando houver gastos, cada categoria aparece aqui contra a própria média.
        </p>
      </div>
    )
  }

  return (
    <div ref={ref} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <Summary data={data} revealed={revealed} hidden={hidden} isCurrent={isCurrent} />
      <Rows data={data} revealed={revealed} hidden={hidden} isCurrent={isCurrent} />
    </div>
  )
}

/** O número do mês e as categorias que mais fugiram da média. */
function Summary({ data, revealed, hidden, isCurrent }: { data: CategoryTrends; revealed: boolean; hidden: boolean; isCurrent: boolean }) {
  const totalDelta =
    data.totalAverageToDate > 0 ? ((data.totalCurrent - data.totalAverageToDate) / data.totalAverageToDate) * 100 : null
  const above = data.rows
    .filter(
      (row) =>
        row.deltaPct !== null && row.deltaPct >= HIGHLIGHT_PCT && row.current - row.averageToDate >= HIGHLIGHT_REAIS,
    )
    .sort((a, b) => b.current - b.averageToDate - (a.current - a.averageToDate))
    .slice(0, 3)
  const monthName = formatMonthName(`${data.month}-01`)

  return (
    <div className={`${card} px-5 py-5`}>
      <p className="text-[0.9375rem] text-dim">{isCurrent ? `Gasto até o dia ${data.throughDay}` : `Gasto em ${monthName}`}</p>
      <CountUpMoney
        value={data.totalCurrent}
        active={revealed}
        className="mt-1 block text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg"
      />
      <p className="mt-1 min-h-[1.375rem] text-[0.875rem] tabular">
        {totalDelta === null ? (
          <span className="text-faint">Sem média para comparar ainda</span>
        ) : hidden ? (
          <span className="text-faint">
            <span aria-hidden="true">••</span>
            <span className="sr-only">variação oculta</span> vs. sua média
          </span>
        ) : (
          <TotalDelta pct={totalDelta} average={data.totalAverageToDate} />
        )}
      </p>

      <div className="mt-5 border-t border-separator pt-4">
        <p className="text-[0.8125rem] font-semibold text-dim">Acima do seu normal</p>
        {/* Nos primeiros dias, uma compra mexe dezenas de pontos na
            porcentagem: avisar evita tratar "+400% no dia 2" como alarme. */}
        {isCurrent && data.throughDay <= 5 && !hidden && (
          <p className="mt-1 text-[0.8125rem] text-faint">Começo de mês: com poucos dias, a porcentagem muda rápido.</p>
        )}
        {hidden ? (
          // O destaque é um ranking de quanto passou: oculto, não sobra nada
          // que possa aparecer sem contar o que a pessoa escondeu.
          <p className="mt-2 text-[0.9375rem] text-faint">Comparações ocultas. Toque no olho para ver.</p>
        ) : above.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] text-dim">
            Nenhuma categoria passou da média {isCurrent ? 'até aqui' : `em ${monthName}`}.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {above.map((row, index) => (
              <li
                key={row.categoryId ?? 'none'}
                className={revealed ? 'rise' : 'opacity-0'}
                style={{ animationDelay: `${200 + index * 80}ms` }}
              >
                <p className={`${index === 0 ? 'text-[1.5rem]' : 'text-[1.125rem]'} leading-tight font-bold text-fg`}>
                  <span className="text-negative tabular">+{Math.round(row.deltaPct ?? 0)}%</span>{' '}
                  <span className="font-semibold">em {row.categoryName}</span>
                </p>
                <p className="mt-0.5 text-[0.875rem] text-dim">
                  <Money value={row.current - row.averageToDate} /> a mais que a média
                  {isCurrent ? ` até o dia ${data.throughDay}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TotalDelta({ pct, average }: { pct: number; average: number }) {
  const { arrow, tone, text } = deltaTone(pct)
  return (
    <>
      <span className={tone}>
        {arrow} {text}
      </span>
      <span className="text-faint">
        {' '}
        vs. média de <Money value={average} />
      </span>
    </>
  )
}

function Rows({ data, revealed, hidden, isCurrent }: { data: CategoryTrends; revealed: boolean; hidden: boolean; isCurrent: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  // A escala é a mesma para todas as linhas (atual e média): comprimento só
  // compara com comprimento quando a régua é uma só.
  const max = Math.max(1, ...data.rows.map((row) => Math.max(row.current, row.averageToDate)))

  // Oculto, a ordem por valor já seria um ranking: vira alfabética, como na
  // Visão geral.
  const rows = hidden ? [...data.rows].sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'pt-BR')) : data.rows
  const visible = showAll ? rows : rows.slice(0, TOP)

  return (
    <div className={card}>
      {!hidden && (
        <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3.5 text-[0.8125rem] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-dim" />
            {isCurrent ? 'até hoje' : 'no mês'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded-full bg-fg" />
            sua média {isCurrent ? `até o dia ${data.throughDay}` : ''}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-3 items-end gap-px">
              <span className="h-1.5 w-[3px] bg-white/30" />
              <span className="h-2.5 w-[3px] bg-white/30" />
              <span className="h-2 w-[3px] bg-dim" />
            </span>
            mês a mês
          </span>
        </div>
      )}
      <ul className="divide-y divide-separator pt-1">
        {visible.map((row, index) => {
          const key = String(row.categoryId ?? 'none')
          return (
            <CategoryRow
              key={key}
              row={row}
              max={max}
              index={index}
              revealed={revealed}
              hidden={hidden}
              isCurrent={isCurrent}
              throughDay={data.throughDay}
              open={open === key}
              onToggle={() => setOpen(open === key ? null : key)}
            />
          )
        })}
      </ul>
      {rows.length > TOP && (
        <div className="border-t border-separator px-2 py-1">
          <button type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)} className={`${quietButton} w-full`}>
            {showAll ? 'Mostrar menos' : `Mostrar todas as ${rows.length} categorias`}
            <ChevronDownIcon className={`size-4 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
    </div>
  )
}

interface RowProps {
  row: CategoryTrendRow
  max: number
  index: number
  revealed: boolean
  hidden: boolean
  isCurrent: boolean
  throughDay: number
  open: boolean
  onToggle: () => void
}

/**
 * Uma categoria: barra do mês, marca da média na mesma régua, minigráfico
 * dos meses e a variação. Toque abre o mês a mês com a média do mês inteiro.
 *
 * A barra é uma peça cheia deslizando dentro de um trilho com `overflow`
 * escondido (translateX), e não uma largura animada: só transform, e a ponta
 * arredondada não se deforma como num scaleX.
 */
function CategoryRow({ row, max, index, revealed, hidden, isCurrent, throughDay, open, onToggle }: RowProps) {
  const detailId = useId()
  const ratio = revealed ? row.current / max : 0
  const averageRatio = revealed ? row.averageToDate / max : 0
  const delay = `${Math.min(index, 8) * 45}ms`

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
        className="press block min-h-11 w-full px-4 py-3 text-left hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-fg">{row.categoryName}</span>
          <Money value={row.current} className="shrink-0 text-[0.9375rem] font-semibold" />
        </span>
        <span className="mt-2 ml-[1.375rem] flex items-center gap-3">
          {/* overflow-x: clip — a marca da média é um contêiner da largura
              do trilho deslocado para a direita; sem o corte, ele empurra a
              página para os lados. `clip` (e não `hidden`) deixa a marca
              passar do trilho na vertical. */}
          <span className="relative h-1.5 min-w-0 flex-1 overflow-x-clip" aria-hidden="true">
            <span className="absolute inset-0 overflow-hidden rounded-full bg-white/[0.06]">
              {!hidden && (
                <span
                  className="slide-x absolute inset-0 rounded-full"
                  style={{
                    backgroundColor: row.color,
                    transform: `translateX(${(ratio - 1) * 100}%)`,
                    transitionDelay: delay,
                  }}
                />
              )}
            </span>
            {!hidden && row.averageToDate > 0 && (
              // A marca da média anda pela régua como a barra: um contêiner
              // da largura do trilho, deslocado em % da própria largura.
              <span
                className="slide-x absolute inset-0"
                style={{ transform: `translateX(${averageRatio * 100}%)`, transitionDelay: delay }}
              >
                <span className="absolute -top-[3px] -bottom-[3px] left-0 -ml-px w-0.5 rounded-full bg-fg" />
              </span>
            )}
          </span>
          {!hidden && <Sparkline monthly={row.monthly} color={row.color} revealed={revealed} />}
          <RowDelta row={row} hidden={hidden} />
          <ChevronDownIcon className={`size-4 shrink-0 text-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </span>
        <span className="sr-only">
          {hidden ? '' : `, sua média ${isCurrent ? `até o dia ${throughDay}` : 'no mês'}: ${formatCurrency(row.averageToDate)}`}
        </span>
      </button>
      <div id={detailId} hidden={!open}>
        {open && <RowDetail row={row} hidden={hidden} isCurrent={isCurrent} throughDay={throughDay} />}
      </div>
    </li>
  )
}

function RowDelta({ row, hidden }: { row: CategoryTrendRow; hidden: boolean }) {
  const base = 'w-[4.5rem] shrink-0 text-right text-[0.8125rem] tabular'
  if (hidden) {
    return (
      <span className={`${base} text-faint`}>
        <span aria-hidden="true">••</span>
        <span className="sr-only">variação oculta</span>
      </span>
    )
  }
  if (row.current === 0) {
    return <span className={`${base} text-faint`}>sem gasto</span>
  }
  if (row.deltaPct === null) {
    // Média zero no trecho comparado: não existe porcentagem honesta, e um
    // "+∞%" não diz nada. Se nem o mês inteiro da base teve gasto, é
    // categoria nova; se teve, o gasto só chegou mais cedo que o costume.
    const brandNew = row.averageFullMonth === 0
    return (
      <span className={`${base} text-dim`}>
        {brandNew ? 'novo' : 'adiantado'}
        <span className="sr-only">
          {brandNew ? ': sem gasto nos meses anteriores' : ': nos meses anteriores, esse gasto vinha mais tarde no mês'}
        </span>
      </span>
    )
  }
  const { arrow, tone, text } = deltaTone(row.deltaPct)
  return (
    <span className={`${base} ${tone}`}>
      {arrow} {text}
      <span className="sr-only"> {row.deltaPct > 0 ? 'acima' : 'abaixo'} da média</span>
    </span>
  )
}

/**
 * Minigráfico dos meses: base em cinza, o mês analisado na cor da categoria.
 * Decorativo (aria-hidden): o mês a mês com valores está no detalhe da linha.
 */
function Sparkline({ monthly, color, revealed }: { monthly: CategoryTrendRow['monthly']; color: string; revealed: boolean }) {
  const max = Math.max(1, ...monthly.map((point) => point.total))
  return (
    <span aria-hidden="true" className="flex h-5 w-14 shrink-0 items-end gap-px">
      {monthly.map((point, index) => {
        const last = index === monthly.length - 1
        // Mês com algum gasto nunca some de vez: 1 px diz "teve pouco",
        // diferente de "não teve nada".
        const ratio = point.total > 0 ? Math.max(point.total / max, 0.06) : 0
        return (
          <span
            key={point.month}
            className="scale-y h-full min-w-0 flex-1 rounded-[1px]"
            style={{
              backgroundColor: last ? color : 'rgb(255 255 255 / 0.3)',
              transform: `scaleY(${revealed ? ratio : 0})`,
              transitionDelay: `${150 + index * 25}ms`,
            }}
          />
        )
      })}
    </span>
  )
}

/** Detalhe aberto: o mês a mês com rótulos e a média do mês inteiro. */
function RowDetail({ row, hidden, isCurrent, throughDay }: { row: CategoryTrendRow; hidden: boolean; isCurrent: boolean; throughDay: number }) {
  const max = Math.max(1, ...row.monthly.map((point) => point.total))
  const peak = row.monthly.reduce((best, point) => (point.total > best.total ? point : best), row.monthly[0])

  return (
    <div className="enter px-4 pb-4 pl-[2.375rem]">
      <p className="text-[0.875rem] text-dim">
        No mês inteiro, costuma fechar em <Money value={row.averageFullMonth} className="font-semibold text-fg" />.
        {isCurrent && (
          <>
            {' '}
            Até o dia {throughDay}, a média é <Money value={row.averageToDate} className="font-semibold text-fg" />.
          </>
        )}
      </p>
      {hidden ? (
        <p className="mt-3 flex h-[5.5rem] items-center justify-center rounded-[var(--radius-inset)] bg-surface-2 text-[0.875rem] text-faint">
          Valores ocultos
        </p>
      ) : (
        <>
          <div aria-hidden="true" className="mt-3 flex h-[5.5rem] items-end gap-1 rounded-[var(--radius-inset)] bg-surface-2 px-2.5 pt-3 pb-2">
            {row.monthly.map((point, index) => {
              const last = index === row.monthly.length - 1
              return (
                <span key={point.month} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="relative w-full flex-1">
                    <span
                      className="grow-y absolute inset-x-0 bottom-0 mx-auto max-w-5 rounded-t-[3px]"
                      style={{
                        height: `${point.total > 0 ? Math.max((point.total / max) * 100, 3) : 0}%`,
                        backgroundColor: last ? row.color : 'rgb(255 255 255 / 0.28)',
                        animationDelay: `${index * 30}ms`,
                      }}
                    />
                  </span>
                  {/* Com 12 meses de base, um rótulo por barra não cabe no
                      celular: fica um sim, um não, sempre contando do mês
                      analisado, que nunca perde o dele. */}
                  <span className={`h-3 text-[0.75rem] leading-none ${last ? 'font-semibold text-fg' : 'text-faint'}`}>
                    {row.monthly.length <= 7 || (row.monthly.length - 1 - index) % 2 === 0
                      ? formatMonthShort(point.month).replace('.', '')
                      : ''}
                  </span>
                </span>
              )
            })}
          </div>
          {peak && peak.total > 0 && (
            <p className="mt-2 text-[0.8125rem] text-faint">
              Maior mês: {formatMonthLong(peak.month).toLowerCase()}, <Money value={peak.total} />
              {isCurrent ? '. O último mês vai só até hoje.' : '.'}
            </p>
          )}
          <ol className="sr-only">
            {row.monthly.map((point) => (
              <li key={point.month}>
                {formatMonthLong(point.month)}: {formatCurrency(point.total)}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
