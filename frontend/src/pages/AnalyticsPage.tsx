import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { BudgetPaceSection } from '@/components/analytics/BudgetPaceSection'
import { CalendarSection, CALENDAR_WINDOWS } from '@/components/analytics/CalendarSection'
import { CategoryTrendsSection } from '@/components/analytics/CategoryTrendsSection'
import { MerchantsSection, MERCHANT_WINDOWS } from '@/components/analytics/MerchantsSection'
import { RecurringSection } from '@/components/analytics/RecurringSection'
import { CashflowSection } from '@/components/analytics/CashflowSection'
import { SourcesSection, SOURCE_WINDOWS } from '@/components/analytics/SourcesSection'
import { MONTH_OPTIONS, currentMonth, shiftMonth } from '@/components/analytics/common'
import { reducedMotion } from '@/lib/motion'

const BASELINES = [3, 6, 12]
const RANGES = [6, 12, 24]

/** Lê um número da URL só se for uma das opções da tela; senão, o padrão. */
function pick(raw: string | null, allowed: readonly number[], fallback: number): number {
  const value = Number(raw)
  return allowed.includes(value) ? value : fallback
}

/**
 * Os grupos da página, na ordem em que a pessoa pergunta: primeiro o mês que
 * está correndo (ainda dá para mudar), depois os hábitos, depois a história
 * longa, e por último a parte técnica — de onde os dados vêm.
 */
const GROUPS = [
  { id: 'este-mes', nav: 'Este mês' },
  { id: 'habitos', nav: 'Hábitos' },
  { id: 'no-tempo', nav: 'No tempo' },
  { id: 'origem', nav: 'Origem' },
] as const

/**
 * Análises: o seu dinheiro contra o seu próprio normal.
 *
 * Sete seções, cada uma com o próprio carregamento e o próprio erro — a
 * lista de gastos fixos não pode sumir porque o fluxo de caixa falhou. Para
 * não virar um muro de gráficos no celular, elas moram em quatro grupos, com
 * uma barra de atalhos presa no topo (ver `GroupNav`).
 *
 * Os filtros moram na URL (`?mes=2026-10&base=6&meses=12&calendario=6...`):
 * o "voltar" do celular desfaz a troca, e recarregar não perde a escolha.
 * `replace`, para cada toque no seletor não virar um passo do histórico.
 */
export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const now = currentMonth()

  // Mês malformado, futuro ou anterior às opções do seletor (link velho,
  // digitado à mão) cai no mês corrente em vez de virar um 400 da API na cara
  // de quem abriu, ou um seletor sem opção marcada.
  const rawMonth = params.get('mes')
  const oldest = shiftMonth(now, -(MONTH_OPTIONS - 1))
  const month =
    rawMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) && rawMonth <= now && rawMonth >= oldest ? rawMonth : now
  const baseline = pick(params.get('base'), BASELINES, 6)
  const range = pick(params.get('meses'), RANGES, 12)
  const calendarMonths = pick(params.get('calendario'), CALENDAR_WINDOWS, 6)
  const merchantMonths = pick(params.get('lugares'), MERCHANT_WINDOWS, 3)
  const sourceMonths = pick(params.get('portas'), SOURCE_WINDOWS, 3)

  const update = (key: string, value: string | null) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  // O padrão de cada seletor não vai para a URL: o link limpo é o normal.
  const setWindow = (key: string, fallback: number) => (value: number) => update(key, value === fallback ? null : String(value))

  return (
    <div className="enter mx-auto max-w-[72rem] px-4 font-ui md:px-10 md:pb-16">
      <PageHeader title="Análises" summary="Seu dinheiro contra o seu próprio normal." />
      <GroupNav />

      <div className="mt-6 space-y-14">
        <Group id="este-mes" title="Este mês">
          <BudgetPaceSection />
          <CategoryTrendsSection
            month={month}
            baseline={baseline}
            onMonthChange={(value) => update('mes', value === now ? null : value)}
            onBaselineChange={(value) => update('base', value === 6 ? null : String(value))}
          />
        </Group>

        <Group id="habitos" title="Hábitos">
          <CalendarSection months={calendarMonths} onMonthsChange={setWindow('calendario', 6)} />
          <MerchantsSection months={merchantMonths} onMonthsChange={setWindow('lugares', 3)} />
        </Group>

        <Group id="no-tempo" title="Seu dinheiro no tempo">
          {/* min-w-0: item de grid cresce até o conteúdo por padrão, e o
              gráfico mede a largura do próprio contêiner — sem isso, vazaria
              da tela de 375 (o mesmo cuidado da Visão geral). */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
            <div className="min-w-0">
              <RecurringSection />
            </div>
            <div className="min-w-0">
              <CashflowSection months={range} onMonthsChange={(value) => update('meses', value === 12 ? null : String(value))} />
            </div>
          </div>
        </Group>

        <Group id="origem" title="Como os dados chegam">
          <SourcesSection months={sourceMonths} onMonthsChange={setWindow('portas', 3)} />
        </Group>
      </div>
    </div>
  )
}

/**
 * Um grupo: rótulo no acento (o capítulo) e as seções embaixo. O
 * `scroll-margin` deixa o rótulo aparecer abaixo da barra presa ao pular.
 */
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} role="region" aria-labelledby={`${id}-titulo`} className="scroll-mt-20">
      {/* tabIndex -1: o atalho leva o foco para cá, e o teclado segue dali. */}
      <h2
        id={`${id}-titulo`}
        tabIndex={-1}
        className="mb-4 border-t border-separator px-1 pt-5 text-[0.875rem] font-semibold text-accent outline-none"
      >
        {title}
      </h2>
      <div className="space-y-10">{children}</div>
    </div>
  )
}

/**
 * Atalhos para os grupos, presos no topo enquanto a página rola: com sete
 * seções, o celular vira um muro, e o polegar precisa chegar ao calendário
 * sem rolar por cima de dois gráficos. Quatro rótulos curtos cabem nos 343 px
 * úteis de uma tela de 375 sem rolar de lado. É a segunda (e última) camada
 * de vidro da tela, junto com a tab bar.
 *
 * Não muda a URL (o `#` empilharia passos no "voltar" e brigaria com os
 * filtros); o grupo à vista fica marcado conforme a página rola.
 */
function GroupNav() {
  const [active, setActive] = useState<string>(GROUPS[0].id)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting)
        // O primeiro grupo, na ordem da página, que cruza a faixa de leitura.
        const first = GROUPS.find((group) => visible.get(group.id))
        if (first) setActive(first.id)
      },
      // Faixa estreita logo abaixo da barra: o grupo "atual" é o que está
      // sendo lido, não o que mal apareceu no rodapé.
      { rootMargin: '-15% 0px -70% 0px' },
    )
    for (const group of GROUPS) {
      const element = document.getElementById(group.id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    const target = document.getElementById(id)
    if (!target) return
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    setActive(id)
    target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }

  return (
    <div className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-20">
      <nav aria-label="Grupos de análises" className="chrome flex w-full gap-0.5 rounded-full p-1 md:inline-flex md:w-auto">
        {GROUPS.map((group) => {
          const current = active === group.id
          return (
            <a
              key={group.id}
              href={`#${group.id}`}
              onClick={(event) => jump(event, group.id)}
              aria-current={current ? 'location' : undefined}
              className={`press flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-[0.9375rem] whitespace-nowrap md:flex-none md:px-4 ${
                current ? 'bg-white/14 font-semibold text-fg' : 'font-medium text-dim hover:text-fg'
              }`}
            >
              {group.nav}
            </a>
          )
        })}
      </nav>
    </div>
  )
}
