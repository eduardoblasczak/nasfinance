import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { api, ApiRequestError } from '@/lib/api'
import { formatDayLabel, sourceLabel } from '@/lib/format'
import { DEMO } from '@/lib/demo'
import { useReferenceData } from '@/hooks/useReferenceData'
import { REVIEW_CHANGED } from '@/hooks/usePendingReview'
import { PluggyFreshness } from '@/components/PluggyFreshness'
import { PageHeader } from '@/components/ui/PageHeader'
import { Money } from '@/components/ui/Money'
import { Toast, type ToastMessage } from '@/components/ui/Toast'
import { CheckIcon, ChevronDownIcon } from '@/components/ui/icons'
import type { Category, PluggyStatus, Transaction } from '@/types'

/**
 * Fila de revisão: o que a sincronização trouxe e não pôde decidir sozinha.
 *
 * Três situações caem aqui, e a tela diz qual é em cada linha. Duas delas a
 * máquina poderia ter "resolvido" sozinha e deliberadamente não resolve:
 * fundir duplicatas automaticamente apagaria compras legítimas (dois cafés de
 * R$ 12 no mesmo dia são duas compras), e classificar com a categoria da
 * Pluggy produziria um dashboard que parece certo e não é.
 *
 * Toda decisão tira o card da tela na hora (otimista) e confirma num aviso.
 * As duas que não têm volta pela API — consolidar e não contar — esperam 5 s
 * antes de ir ao servidor, com Desfazer; é a rede de segurança no lugar do
 * antigo window.confirm, que interrompia toda decisão para proteger poucas.
 */

const UNDO_WINDOW_MS = 5000
const TOAST_MS = 3000

/** Uma decisão esperando a janela do Desfazer fechar. */
interface Pending {
  id: number
  path: string
  done: string
  timer: number
}

/**
 * Anima a saída do card e o deslizar dos vizinhos com View Transitions
 * (instantâneos movidos só por transform/opacity). Sem suporte, ou com
 * movimento reduzido, a mudança simplesmente acontece.
 */
function withTransition(update: () => void) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}

/** A categoria que a Pluggy sugeriu, guardada nas notas pela importação. */
function suggestedCategoryName(notes: string | null): string | null {
  const part = notes?.split('|').find((piece) => piece.includes('categoria sugerida'))
  return part ? part.split(':').slice(1).join(':').trim() || null : null
}

/** "hoje", "ontem", "seg., 13 out." — para usar no meio de uma frase. */
function inlineDay(iso: string): string {
  const label = formatDayLabel(iso)
  return label.charAt(0).toLowerCase() + label.slice(1)
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.fullMessage : fallback
}

export function ReviewPage() {
  const [items, setItems] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<number>>(() => new Set())
  const [pluggy, setPluggy] = useState<PluggyStatus | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const pending = useRef<Pending | null>(null)

  const { categories } = useReferenceData()

  // `silent`: depois de uma decisão a lista já está certa na tela; recarregar
  // mostrando o esqueleto faria tudo piscar para confirmar o que já se vê.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setItems(await api.get<Transaction[]>('/api/v1/review'))
      setLoadError(null)
    } catch (err) {
      if (!silent) setLoadError(errorText(err, 'Não foi possível carregar a fila.'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // A idade do dado mora aqui, e não só em Configurações, porque foi aqui que
  // a falha passou despercebida: "Nada para revisar" com o Meu Pluggy parado
  // há 5 dias era indistinguível de "não houve movimento". Uma fila vazia só
  // significa algo se o dado que a alimenta for recente.
  //
  // Silencioso de propósito, como o badge: se o status falhar, a faixa some e
  // a fila continua funcionando.
  const loadPluggy = useCallback(async () => {
    try {
      setPluggy(await api.get<PluggyStatus>('/api/v1/pluggy/status'))
    } catch {
      setPluggy(null)
    }
  }, [])

  useEffect(() => {
    void loadPluggy()
  }, [loadPluggy])

  const onSynced = useCallback(() => {
    void load(true)
    void loadPluggy()
    // O contador da navegação também precisa saber: a sincronização acabou
    // de colocar lançamentos na fila.
    window.dispatchEvent(new Event(REVIEW_CHANGED))
  }, [load, loadPluggy])

  const showToast = useCallback((message: Omit<ToastMessage, 'key'>, duration = TOAST_MS) => {
    window.clearTimeout(toastTimer.current)
    setToast({ ...message, key: Date.now() })
    toastTimer.current = window.setTimeout(() => setToast(null), duration)
  }, [])

  const hide = (id: number) => withTransition(() => setHidden((set) => new Set(set).add(id)))
  const unhide = (id: number) =>
    withTransition(() =>
      setHidden((set) => {
        const next = new Set(set)
        next.delete(id)
        return next
      }),
    )

  /** Envia ao servidor; em falha, o card volta e o aviso diz o que houve. */
  const commit = useCallback(
    async (id: number, path: string, done: string | null, keepalive = false) => {
      try {
        await api.post(path, undefined, { keepalive })
        if (done) showToast({ text: done })
        void load(true)
        // Avisa o contador da navegação: estas ações não passam pelo SSE.
        window.dispatchEvent(new Event(REVIEW_CHANGED))
      } catch (err) {
        unhide(id)
        showToast({ text: errorText(err, 'Não deu para concluir. O lançamento voltou para a fila.'), tone: 'error' }, 5000)
      }
    },
    // unhide fica fora das dependências: só chama setState, nunca envelhece.
    [load, showToast],
  )

  /** Confirma agora a decisão que estava na janela do Desfazer. */
  const flushPending = useCallback(
    (keepalive = false) => {
      const current = pending.current
      if (!current) return
      window.clearTimeout(current.timer)
      pending.current = null
      // Enviou, não dá mais para desfazer: o toast com o botão sai antes do
      // `await` do próximo commit, e não depois — num 4G lento, um Desfazer
      // que ficasse na tela nesse intervalo não faria nada.
      setToast(null)
      void commit(current.id, current.path, null, keepalive)
    },
    [commit],
  )

  // Sair da tela (ou fechar a aba) com um Desfazer aberto confirma a decisão:
  // quem tocou em "Não contar" e trocou de aba não desistiu.
  // `visibilitychange` além de `pagehide`: instalado na tela inicial do
  // iPhone, o app vai para segundo plano sem `pagehide`.
  useEffect(() => {
    const onPageHide = () => flushPending(true)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPending(true)
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      flushPending()
      window.clearTimeout(toastTimer.current)
    }
  }, [flushPending])

  function decideNow(item: Transaction, path: string, done: string) {
    flushPending()
    hide(item.id)
    void commit(item.id, path, done)
  }

  function decideWithUndo(item: Transaction, path: string, done: string) {
    flushPending()
    hide(item.id)
    const timer = window.setTimeout(() => {
      pending.current = null
      void commit(item.id, path, null)
    }, UNDO_WINDOW_MS)
    pending.current = { id: item.id, path, done, timer }
    showToast(
      {
        text: done,
        onUndo: () => {
          if (pending.current?.id !== item.id) return
          window.clearTimeout(pending.current.timer)
          pending.current = null
          unhide(item.id)
          setToast(null)
        },
      },
      UNDO_WINDOW_MS,
    )
  }

  const visible = useMemo(() => items.filter((item) => !hidden.has(item.id)), [items, hidden])

  // Agrupado por dia, na ordem que a API manda (mais recente primeiro).
  const days = useMemo(() => {
    const groups: { date: string; items: Transaction[]; net: number }[] = []
    for (const item of visible) {
      let group = groups.find((candidate) => candidate.date === item.occurredOn)
      if (!group) {
        group = { date: item.occurredOn, items: [], net: 0 }
        groups.push(group)
      }
      group.items.push(item)
      // Direção pelo flow, nunca pelo sinal do amount (ver CLAUDE.md).
      group.net += item.flow === 'EXPENSE' ? -Math.abs(item.amount) : Math.abs(item.amount)
    }
    return groups
  }, [visible])

  const count = visible.length

  const summary = loading ? (
    <span className="inline-block h-[1.375rem] w-56 animate-pulse rounded-md bg-surface-2 align-middle" />
  ) : loadError ? (
    'Não deu para carregar a fila agora.'
  ) : count === 0 ? (
    'Nenhuma decisão pendente.'
  ) : (
    <>
      <span className="font-semibold text-fg tabular">{count}</span>{' '}
      {count === 1 ? 'lançamento espera sua decisão' : 'lançamentos esperam sua decisão'}
    </>
  )

  return (
    <>
      <div className="enter mx-auto max-w-[45rem] px-4 font-ui md:px-10 md:pb-16">
        <PageHeader title="Revisão" summary={summary} />

        {pluggy && (
          <div className="mb-8">
            <PluggyFreshness status={pluggy} onSynced={onSynced} />
          </div>
        )}

        {loading ? (
          <ReviewSkeleton />
        ) : loadError ? (
          <div className="rounded-[var(--radius-card)] bg-surface px-6 py-10 text-center">
            <p className="text-[1.0625rem] font-semibold text-fg">A fila não carregou</p>
            <p className="mx-auto mt-2 max-w-[22rem] text-[0.9375rem] text-dim">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="press mt-6 min-h-11 rounded-full bg-surface-2 px-5 text-[0.9375rem] font-semibold text-fg hover:bg-white/12"
            >
              Tentar de novo
            </button>
          </div>
        ) : count === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-surface px-6 py-12 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/12 text-accent">
              <CheckIcon className="size-6" />
            </span>
            <p className="mt-4 text-[1.0625rem] font-semibold text-fg">Nada para revisar</p>
            <p className="mx-auto mt-1.5 max-w-[22rem] text-[0.9375rem] text-dim">
              Tudo que o banco trouxe já está classificado e conferido.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {days.map((day) => (
              <section key={day.date} aria-labelledby={`day-${day.date}`}>
                <div
                  className="mb-2 flex items-baseline justify-between px-1"
                  style={{ viewTransitionName: `day-${day.date}` }}
                >
                  <h2 id={`day-${day.date}`} className="text-[0.9375rem] font-semibold text-fg">
                    {formatDayLabel(day.date)}
                  </h2>
                  <Money
                    value={day.net}
                    sign={day.net < 0 ? '-' : day.net > 0 ? '+' : 'none'}
                    className="text-[0.875rem] text-faint"
                  />
                </div>

                <ul className="space-y-2.5">
                  {day.items.map((item) => (
                    <ReviewCard
                      key={item.id}
                      item={item}
                      categories={categories}
                      onCategorize={(category) =>
                        decideNow(
                          item,
                          `/api/v1/review/${item.id}/categorize/${category.id}`,
                          `Classificado como ${category.name}`,
                        )
                      }
                      onDismiss={() =>
                        decideNow(
                          item,
                          `/api/v1/review/${item.id}/dismiss`,
                          item.reviewReason === 'POSSIBLE_DUPLICATE' ? 'Mantidos os dois' : 'Mantido nos totais',
                        )
                      }
                      onMerge={() =>
                        decideWithUndo(item, `/api/v1/review/${item.id}/merge`, 'Duplicata consolidada')
                      }
                      onIgnore={() =>
                        decideWithUndo(item, `/api/v1/review/${item.id}/ignore`, 'Fora dos totais')
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Fora do container animado: fixed dentro de um ancestral com
          transform deixa de ser fixo na tela. */}
      <Toast toast={toast} />
    </>
  )
}

/* ------------------------------------------------------------------ */

interface ReviewCardProps {
  item: Transaction
  categories: Category[]
  onCategorize: (category: Category) => void
  onDismiss: () => void
  onMerge: () => void
  onIgnore: () => void
}

const primaryButton =
  'press min-h-11 rounded-full bg-accent px-4 text-[0.9375rem] font-semibold text-void hover:bg-accent/90'
const secondaryButton =
  'press min-h-11 rounded-full bg-surface-2 px-4 text-[0.9375rem] font-semibold text-fg hover:bg-white/12'
const quietButton =
  'press min-h-11 rounded-full px-3 text-[0.9375rem] font-medium text-dim hover:bg-surface-2 hover:text-fg'

function ReviewCard({ item, categories, onCategorize, onDismiss, onMerge, onIgnore }: ReviewCardProps) {
  const expense = item.flow === 'EXPENSE'
  const reason = item.reviewReason
  const options = categories.filter((category) => category.flow === item.flow && !category.archived)

  // A sugestão da Pluggy vira um botão de um toque — mas só quando bate com
  // uma categoria sua, e só se você tocar. Nunca é aplicada sozinha.
  const suggestedName = !item.categoryId ? suggestedCategoryName(item.notes) : null
  const suggested = suggestedName
    ? options.find((category) => category.name.localeCompare(suggestedName, 'pt-BR', { sensitivity: 'base' }) === 0)
    : undefined

  const needsCategory = !item.categoryId
  // Duplicata e transferência já têm sua ação principal; a categoria vira
  // secundária nelas.
  const categoryIsPrimary = needsCategory && !reason && !suggested

  return (
    <li
      className="rounded-[var(--radius-card)] bg-surface p-4"
      style={{ viewTransitionName: `review-${item.id}` }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[1.0625rem] leading-snug font-semibold break-words text-fg">
            {item.description || 'Sem descrição'}
          </p>
          <p className="mt-1 truncate text-[0.875rem] text-faint">
            {item.accountName} · {sourceLabel(item.source)}
          </p>
        </div>
        <Money value={item.amount} sign={expense ? '-' : '+'} className="pt-px text-[1.0625rem] font-semibold" />
      </div>

      {/* ---- por que está aqui ---- */}
      {reason === 'POSSIBLE_DUPLICATE' && item.duplicateOfId && (
        <Reason title="Possível duplicata">
          Parece o mesmo gasto de{' '}
          <span className="text-fg">{item.duplicateOfDescription || 'um lançamento sem descrição'}</span> (
          {sourceLabel(item.duplicateOfSource)}
          {item.duplicateOfDate && <>, {inlineDay(item.duplicateOfDate)}</>}). Consolidar mantém este e apaga o
          outro.
        </Reason>
      )}

      {reason === 'POSSIBLE_TRANSFER' && (
        <Reason title="Possível pagamento de fatura">
          Bate com um pagamento visto no cartão. Se for, não é despesa nova: as compras já entraram uma a
          uma.
        </Reason>
      )}

      {!reason && needsCategory && (
        <Reason title="Sem categoria">
          {suggestedName ? (
            <>
              O banco sugere <span className="text-fg">{suggestedName}</span>.
            </>
          ) : (
            'Escolha onde este lançamento entra nos seus totais.'
          )}
        </Reason>
      )}

      {/* ---- ações ---- */}
      {/* Na demonstração a fila é só para ver: decidir um item o tiraria da
          fila para todos os visitantes. */}
      {!DEMO && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {reason === 'POSSIBLE_DUPLICATE' && item.duplicateOfId && (
            <button type="button" onClick={onMerge} className={primaryButton}>
              Consolidar
            </button>
          )}

          {reason === 'POSSIBLE_TRANSFER' && (
            <button type="button" onClick={onIgnore} className={primaryButton}>
              Não contar
            </button>
          )}

          {suggested && (
            <button type="button" onClick={() => onCategorize(suggested)} className={primaryButton}>
              {suggested.name}
            </button>
          )}

          {needsCategory && (
            <CategoryPicker
              options={options}
              label={suggested ? 'Outra' : 'Classificar'}
              primary={categoryIsPrimary}
              description={item.description}
              onPick={onCategorize}
            />
          )}

          {item.reviewStatus === 'PENDING' && (
            <button type="button" onClick={onDismiss} className={secondaryButton}>
              {reason === 'POSSIBLE_DUPLICATE' ? 'Manter os dois' : 'Está certo'}
            </button>
          )}

          {reason !== 'POSSIBLE_TRANSFER' && (
            <button type="button" onClick={onIgnore} className={`${quietButton} ml-auto`}>
              Não contar
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Reason({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-[var(--radius-inset)] bg-surface-2 px-3.5 py-2.5">
      <p className="text-[0.8125rem] font-semibold text-dim">{title}</p>
      <p className="mt-0.5 text-[0.875rem] leading-normal text-dim">{children}</p>
    </div>
  )
}

interface CategoryPickerProps {
  options: Category[]
  label: string
  primary: boolean
  description: string | null
  onPick: (category: Category) => void
}

/**
 * Seletor nativo vestido de botão. Nativo de propósito: no iPhone ele abre a
 * roda do sistema, que é mais rápida de usar com o polegar do que qualquer
 * lista desenhada aqui — e vem acessível de graça. 16 px no texto do select
 * para o Safari não dar zoom ao tocar.
 */
function CategoryPicker({ options, label, primary, description, onPick }: CategoryPickerProps) {
  return (
    <label
      // O select é invisível por cima do rótulo, então o foco do teclado
      // precisa aparecer no rótulo — senão some.
      className={`press relative flex min-h-11 items-center gap-1.5 rounded-full pr-3 pl-4 has-[select:focus-visible]:outline-1 has-[select:focus-visible]:outline-offset-3 has-[select:focus-visible]:outline-accent ${
        primary ? 'bg-accent text-void hover:bg-accent/90' : 'bg-surface-2 text-fg hover:bg-white/12'
      }`}
    >
      <span className="text-[0.9375rem] font-semibold">{label}</span>
      <ChevronDownIcon className="size-4" />
      <select
        value=""
        onChange={(event) => {
          const picked = options.find((category) => String(category.id) === event.target.value)
          if (picked) onPick(picked)
        }}
        aria-label={`Categoria para ${description || 'o lançamento'}`}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full text-base opacity-0"
      >
        <option value="" disabled>
          Escolha a categoria
        </option>
        {options.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Esqueleto com a forma da fila: um dia e três cards da altura real. */
function ReviewSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-2 h-5 w-16 animate-pulse rounded-md bg-surface-2" />
      <div className="space-y-2.5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[11.5rem] animate-pulse rounded-[var(--radius-card)] bg-surface" />
        ))}
      </div>
    </div>
  )
}
