import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { CategoryTrendsSection } from '@/components/analytics/CategoryTrendsSection'
import { RecurringSection } from '@/components/analytics/RecurringSection'
import { CashflowSection } from '@/components/analytics/CashflowSection'
import { MONTH_OPTIONS, currentMonth, shiftMonth } from '@/components/analytics/common'

const BASELINES = [3, 6, 12]
const RANGES = [6, 12, 24]

/** Lê um número da URL só se for uma das opções da tela; senão, o padrão. */
function pick(raw: string | null, allowed: number[], fallback: number): number {
  const value = Number(raw)
  return allowed.includes(value) ? value : fallback
}

/**
 * Análises: o seu dinheiro contra o seu próprio normal.
 *
 * Três perguntas, cada uma com o próprio carregamento e o próprio erro — a
 * lista de gastos fixos não pode sumir porque o fluxo de caixa falhou:
 *   1. Onde este mês foge da média? (categorias)
 *   2. Quanto já está comprometido todo mês? (gastos fixos)
 *   3. Está sobrando ou faltando, mês a mês? (entrou × saiu)
 *
 * Os filtros moram na URL (`?mes=2026-10&base=6&meses=12`): o "voltar" do
 * celular desfaz a troca de mês, e recarregar a página não perde a escolha.
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

  return (
    <div className="enter mx-auto max-w-[72rem] px-4 font-ui md:px-10 md:pb-16">
      <PageHeader title="Análises" summary="Seu dinheiro contra o seu próprio normal." />

      <div className="space-y-10">
        <CategoryTrendsSection
          month={month}
          baseline={baseline}
          onMonthChange={(value) => update('mes', value === now ? null : value)}
          onBaselineChange={(value) => update('base', value === 6 ? null : String(value))}
        />

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
      </div>
    </div>
  )
}
