import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Money } from '@/components/ui/Money'
import { ArrowIcon } from '@/components/ui/icons'
import { card, secondaryButton } from '@/components/ui/styles'
import { useReveal } from '@/hooks/useMotion'
import { useResource } from '@/hooks/useResource'
import { getEntrySources } from '@/lib/api'
import type { EntrySources, SourceShare, TransactionSource } from '@/types'
import { EmptyCard, SectionError, SectionHeader, Skeleton, StaleNotice, WindowPicker, formatShare, monthsLabel } from './common'

export const SOURCE_WINDOWS = [1, 3, 6, 12] as const

/**
 * Cada porta de entrada com a cor que ela tem na landing (`--color-atalho`,
 * `--color-extrato`, `--color-tela` em `demo/landing/src/landing.css`, que
 * apontam para estas mesmas séries): quem conheceu o app pela página pública
 * reconhece o azul do Atalho aqui dentro. A importação de planilha não tem
 * porta na landing; fica no cinza neutro, que não briga com as três.
 *
 * As classes vão escritas por inteiro (e não montadas) porque o Tailwind só
 * gera a classe que encontra literal no código.
 */
const PORTS: Record<TransactionSource, { label: string; hint: string; tone: string }> = {
  SHORTCUT: { label: 'Atalho do iPhone', hint: 'na hora da compra', tone: 'bg-series-1' },
  AGGREGATOR: { label: 'Open Finance', hint: 'o extrato do banco', tone: 'bg-series-4' },
  MANUAL: { label: 'Na tela', hint: 'digitado no app', tone: 'bg-series-5' },
  IMPORT: { label: 'Importação', hint: 'planilha antiga', tone: 'bg-faint' },
}
/** A ordem da barra: o que você lança, depois o que o banco traz. */
const ORDER: TransactionSource[] = ['SHORTCUT', 'MANUAL', 'AGGREGATOR', 'IMPORT']

interface Props {
  months: number
  onMonthsChange: (months: number) => void
}

/**
 * Por onde entra: de que porta veio cada despesa e quanto do que você lançou
 * à mão o banco depois confirmou.
 *
 * É a pergunta de confiança do app: o Atalho é rápido mas é você digitando;
 * o extrato é a verdade, mas chega depois. "O banco confirmou 92%" diz que
 * o lançamento rápido está batendo — e os que esperam decisão levam direto à
 * fila, que é onde se resolve.
 */
export function SourcesSection({ months, onMonthsChange }: Props) {
  const titleId = useId()
  const { data, loading, refreshing, error, reload } = useResource(String(months), () => getEntrySources({ months }))

  return (
    <section aria-labelledby={titleId}>
      <SectionHeader
        id={titleId}
        title="Por onde entra"
        support={`De que porta veio cada despesa ${monthsLabel(months)}, e o que o banco confirmou.`}
      >
        <WindowPicker label="Meses nas portas de entrada" value={months} options={SOURCE_WINDOWS} onChange={onMonthsChange} />
      </SectionHeader>
      {loading ? (
        <div
          aria-busy="true"
          aria-label="Carregando as portas de entrada"
          className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <Skeleton className="h-[13rem]" rows={1} />
          <Skeleton className="h-[19rem]" rows={4} />
        </div>
      ) : !data ? (
        <SectionError what="A divisão por porta de entrada" error={error} onRetry={reload} />
      ) : (
        <div aria-busy={refreshing} className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
          <StaleNotice error={error} />
          <SourcesBody data={data} months={months} />
        </div>
      )}
    </section>
  )
}

function SourcesBody({ data, months }: { data: EntrySources; months: number }) {
  const [ref, revealed] = useReveal<HTMLDivElement>()
  const total = data.sources.reduce((sum, source) => sum + source.count, 0)

  if (total === 0) {
    return (
      <EmptyCard title={`Nenhuma despesa ${monthsLabel(months)}`}>
        Quando as despesas chegarem — pelo Atalho, pela sincronização com o banco ou pela tela —, a divisão aparece aqui.
      </EmptyCard>
    )
  }

  // Fontes ausentes do retorno contam como zero: o contrato promete as
  // quatro, mas a tela não quebra se uma faltar.
  const bySource = new Map(data.sources.map((source) => [source.source, source]))
  const ordered: SourceShare[] = ORDER.map((source) => bySource.get(source) ?? { source, count: 0, total: 0 })

  return (
    <div ref={ref} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <Confirmation data={data} months={months} revealed={revealed} />
      <div className={`${card} px-5 pt-5 pb-2`}>
        <p className="text-[0.9375rem] text-dim">
          {total} {total === 1 ? 'despesa' : 'despesas'} {monthsLabel(months)}, por porta
        </p>
        <StackedBar sources={ordered} total={total} revealed={revealed} />
        <ul className="mt-3 divide-y divide-separator">
          {ordered.map((source) => {
            const port = PORTS[source.source]
            const pct = (source.count / total) * 100
            return (
              <li key={source.source} className={`flex items-center gap-3 py-3 ${source.count === 0 ? 'opacity-60' : ''}`}>
                <span className={`size-2.5 shrink-0 rounded-full ${port.tone}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] text-fg">{port.label}</p>
                  <p className="truncate text-[0.8125rem] text-faint">
                    {source.count === 0
                      ? `nada ${monthsLabel(months)}`
                      : `${source.count} ${source.count === 1 ? 'despesa' : 'despesas'} · ${port.hint}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.9375rem] font-semibold text-fg tabular">{source.count === 0 ? '—' : formatShare(pct)}</p>
                  {source.count > 0 && <Money value={source.total} className="text-[0.8125rem] text-faint" />}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/**
 * A barra empilhada em camadas que deslizam (translateX), e não em fatias
 * de largura animada: só transform, como o resto das Análises. Cada camada
 * vai de 0 até o fim acumulado da sua fatia; desenhadas da última para a
 * primeira, a de cima cobre o começo da de baixo e sobra à vista só o trecho
 * de cada uma. Trocar a janela faz as fronteiras andarem até o lugar novo.
 */
function StackedBar({ sources, total, revealed }: { sources: SourceShare[]; total: number; revealed: boolean }) {
  let running = 0
  const layers = sources.map((source) => {
    running += source.count
    return { source: source.source, end: running / total }
  })
  return (
    <div aria-hidden="true" className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/[0.06]">
      {[...layers].reverse().map((layer, i) => (
        <span
          key={layer.source}
          // A borda da cor da superfície faz o vão entre as fatias.
          className={`slide-x absolute inset-0 ${layer.end < 1 ? 'border-r-2 border-surface' : ''} ${PORTS[layer.source].tone}`}
          style={{
            transform: `translateX(${((revealed ? layer.end : 0) - 1) * 100}%)`,
            transitionDelay: `${(layers.length - 1 - i) * 60}ms`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * "O banco confirmou X% do que você lançou", e o caminho para a fila.
 *
 * `pendingReview` é um SUBCONJUNTO de `confirmedByBank` (ver ANALYTICS.md):
 * o extrato já trouxe a compra, só falta você decidir na fila. Por isso as
 * três partes da barra são confirmados − pendentes, pendentes e o que o
 * banco não trouxe — somar pendentes aos confirmados contaria duas vezes.
 */
function Confirmation({ data, months, revealed }: { data: EntrySources; months: number; revealed: boolean }) {
  // Defensivo: se o servidor um dia mandar pendentes acima dos confirmados,
  // a barra não passa do trecho confirmado.
  const pending = Math.min(data.pendingReview, data.confirmedByBank)
  const settled = data.confirmedByBank - pending
  const missing = Math.max(data.manualEntries - data.confirmedByBank, 0)
  const ratio = (count: number) => (revealed && data.manualEntries > 0 ? Math.min(count / data.manualEntries, 1) : 0)
  const parts = [
    { key: 'settled', count: settled, label: settled === 1 ? 'confirmada' : 'confirmadas', tone: 'bg-accent' },
    { key: 'pending', count: pending, label: 'aguardando você', tone: 'bg-accent/40' },
    { key: 'missing', count: missing, label: 'sem confirmação', tone: 'bg-white/[0.12]' },
  ]

  return (
    <div className={`${card} px-5 py-5`}>
      <p className="text-[0.9375rem] text-dim">Lançado à mão que o extrato trouxe</p>
      {data.confirmedPct === null ? (
        <>
          <p className="mt-1 text-[1.25rem] leading-tight font-bold text-fg">Nada lançado à mão {monthsLabel(months)}</p>
          <p className="mt-1 text-[0.875rem] text-faint">
            Tudo veio do banco. Lançando pelo Atalho na hora da compra, o gasto aparece antes do extrato — e aqui se vê quanto ele
            confirmou depois.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-fg tabular">
            {Math.round(data.confirmedPct)}%
          </p>
          <p className="mt-1 text-[0.875rem] text-faint">
            De {data.manualEntries} {data.manualEntries === 1 ? 'despesa lançada' : 'despesas lançadas'} pelo Atalho ou pela tela,
            o extrato trouxe {data.confirmedByBank}: {settled} {settled === 1 ? 'confirmada' : 'confirmadas'}
            {pending > 0 ? ` e ${pending} aguardando você` : ''}.
          </p>
          {/* Camadas que deslizam, como a barra das portas: a de baixo vai até
              o fim dos confirmados (inclui os pendentes, em tom claro) e a de
              cima até o fim dos já resolvidos. */}
          <div aria-hidden="true" className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <span
              className="slide-x absolute inset-0 rounded-full bg-accent/40"
              style={{ transform: `translateX(${(ratio(data.confirmedByBank) - 1) * 100}%)`, transitionDelay: '80ms' }}
            />
            <span
              className="slide-x absolute inset-0 rounded-full bg-accent"
              style={{ transform: `translateX(${(ratio(settled) - 1) * 100}%)` }}
            />
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-faint">
            {parts
              .filter((part) => part.count > 0)
              .map((part) => (
                <li key={part.key} className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${part.tone}`} aria-hidden="true" />
                  <span className="text-dim tabular">{part.count}</span> {part.label}
                </li>
              ))}
          </ul>
          {/* Sem isto, quem consolida na fila vê a taxa "cair" e acha que
              perdeu algo: a compra só mudou de porta. */}
          <p className="mt-3 text-[0.8125rem] text-faint">
            Compra consolidada na fila passa a contar como Open Finance e sai desta conta.
          </p>
        </>
      )}
      {pending > 0 && (
        <div className="mt-5 border-t border-separator pt-4">
          <p className="text-[0.9375rem] text-fg">
            {pending} {pending === 1 ? 'chegou' : 'chegaram'} pelo banco e {pending === 1 ? 'espera' : 'esperam'} você decidir na
            fila.
          </p>
          <Link to="/revisao" className={`${secondaryButton} mt-3`}>
            Revisar na fila
            <ArrowIcon className="size-4" direction="right" />
          </Link>
        </div>
      )}
    </div>
  )
}
