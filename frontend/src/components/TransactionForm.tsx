import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { formatCurrency, todayIso } from '@/lib/format'
import { useReferenceData } from '@/hooks/useReferenceData'
import { CloseIcon } from './ui/icons'
import type { Flow, Transaction } from '@/types'

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Transaction | null
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '←']

/**
 * Formulário de lançamento.
 *
 * Usa o elemento nativo `<dialog>`: ele já entrega foco preso dentro do modal,
 * fechamento com Esc e camada de fundo — comportamentos que uma div com
 * position:fixed exigiria reimplementar, e que quase sempre saem incompletos,
 * quebrando a navegação por teclado.
 *
 * O valor é montado em CENTAVOS, como num caixa eletrônico: digitar 1, 5, 0
 * resulta em R$ 1,50. Ninguém precisa posicionar a vírgula, e o valor nunca
 * fica num estado intermediário inválido como "12," — o que aconteceria com
 * um campo de texto livre.
 */
export function TransactionForm({ open, onClose, onSaved, editing }: TransactionFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { accounts, categories } = useReferenceData()

  const [flow, setFlow] = useState<Flow>('EXPENSE')
  const [cents, setCents] = useState(0)
  const [accountId, setAccountId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Categorias de receita não podem ser oferecidas para uma despesa: o backend
  // rejeitaria com 422, e o usuário receberia um erro que a interface deveria
  // ter evitado.
  const available = useMemo(
    () => categories.filter((category) => category.flow === flow),
    [categories, flow],
  )

  const press = useCallback((key: string) => {
    setCents((current) => {
      if (key === '←') return Math.floor(current / 10)
      if (key === '00') return Math.min(current * 100, 99_999_999)
      const next = current * 10 + Number(key)
      return next > 99_999_999 ? current : next
    })
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // Preenche (ou limpa) os campos sempre que o diálogo abre
  useEffect(() => {
    if (!open) return

    if (editing) {
      setFlow(editing.flow)
      setCents(Math.round(editing.amount * 100))
      setAccountId(editing.accountId)
      setCategoryId(editing.categoryId)
      setDescription(editing.description ?? '')
      setOccurredOn(editing.occurredOn)
    } else {
      setFlow('EXPENSE')
      setCents(0)
      setAccountId(accounts[0]?.id ?? null)
      setCategoryId(null)
      setDescription('')
      setOccurredOn(todayIso())
    }
    setError(null)
  }, [open, editing, accounts])

  // Digitar no teclado físico alimenta o mesmo caminho dos botões: no desktop
  // ninguém quer clicar num teclado numérico com o mouse.
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      // Se o foco está num campo de texto, os dígitos pertencem a ELE.
      // Sem esta guarda, digitar "Compra 2x" na descrição mandaria o "2"
      // para o valor e ainda o bloquearia no campo — o preventDefault
      // abaixo engoliria a tecla.
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }

      if (event.key >= '0' && event.key <= '9') press(event.key)
      else if (event.key === 'Backspace') press('←')
      else return

      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, press])

  // Trocar entre despesa e receita invalida a categoria selecionada
  useEffect(() => {
    if (categoryId && !available.some((category) => category.id === categoryId)) {
      setCategoryId(null)
    }
  }, [available, categoryId])

  const complete = cents > 0 && accountId !== null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!complete) return

    setSaving(true)
    setError(null)

    const payload = {
      accountId,
      categoryId,
      flow,
      amount: cents / 100,
      description: description.trim() || null,
      occurredOn,
      notes: null,
    }

    try {
      if (editing) await api.put(`/api/v1/transactions/${editing.id}`, payload)
      else await api.post('/api/v1/transactions', payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const reais = Math.floor(cents / 100).toLocaleString('pt-BR')
  const centavos = String(cents % 100).padStart(2, '0')

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] border border-ghost bg-void p-0 text-fg backdrop:bg-black/85"
    >
      <form onSubmit={handleSubmit}>
        <header className="flex items-center justify-between border-b border-ghost px-7 py-5">
          <h2 className="eyebrow">{editing ? 'editar lançamento' : 'novo lançamento'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-faint transition-colors duration-300 hover:text-fg"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="px-7 py-6">
          {/* Despesa/receita como botões, não select: são duas opções, e a
              escolha muda o resto do formulário — merece estar visível. */}
          <div className="mb-8 grid grid-cols-2 gap-2">
            {(['EXPENSE', 'INCOME'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFlow(option)}
                aria-pressed={flow === option}
                className={`border py-3 font-mono text-xs tracking-wider transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  flow === option
                    ? 'border-accent/55 bg-accent/12 text-accent'
                    : 'border-border text-dim hover:border-faint hover:text-fg'
                }`}
              >
                {option === 'EXPENSE' ? 'Despesa' : 'Receita'}
              </button>
            ))}
          </div>

          <div className="eyebrow mb-3">valor</div>
          <div
            className="mb-8 flex items-baseline gap-2 border-b pb-4 transition-colors duration-400"
            style={{ borderColor: cents > 0 ? 'rgba(37,217,138,.5)' : 'var(--color-border)' }}
          >
            <span className="font-mono text-xl text-faint">R$</span>
            {/* O zero de placeholder usa a borda funcional, nao a hairline:
                mesmo a 48px, #2e2e2e (1,55:1) reprova ate o limiar de texto
                grande. Continua obviamente apagado, mas legivel. */}
            <span
              className={`font-mono text-5xl font-light tracking-tight tabular ${cents > 0 ? 'text-fg' : 'text-border'}`}
            >
              {reais},{centavos}
            </span>
          </div>

          <div className="eyebrow mb-3">categoria</div>
          <div className="mb-7 flex flex-wrap gap-2">
            {available.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
                aria-pressed={categoryId === category.id}
                className={`flex min-h-11 items-center gap-2 border px-3.5 text-xs transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  categoryId === category.id
                    ? 'border-accent/50 bg-accent/10 text-fg'
                    : 'border-border text-dim hover:border-faint hover:text-fg'
                }`}
              >
                <span
                  className="size-1.5 shrink-0"
                  style={{ backgroundColor: category.color }}
                  aria-hidden="true"
                />
                {category.name}
              </button>
            ))}
          </div>

          <div className="eyebrow mb-3">de onde saiu</div>
          <div className="mb-8 flex flex-wrap gap-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => setAccountId(account.id)}
                aria-pressed={accountId === account.id}
                className={`min-h-11 border px-3.5 text-xs transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  accountId === account.id
                    ? 'border-accent/50 bg-accent/10 text-fg'
                    : 'border-border text-dim hover:border-faint hover:text-fg'
                }`}
              >
                {account.name}
              </button>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-3 gap-1.5">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className="border border-border py-4 font-mono text-lg text-fg transition-all duration-200 hover:border-faint hover:bg-white/3 active:scale-95 active:border-accent active:bg-accent/12"
              >
                {key}
              </button>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tx-date" className="eyebrow mb-2 block">
                data
              </label>
              <input
                id="tx-date"
                type="date"
                required
                value={occurredOn}
                onChange={(event) => setOccurredOn(event.target.value)}
                className="w-full min-h-11 border border-border bg-transparent px-3 font-mono text-xs text-dim outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label htmlFor="tx-desc" className="eyebrow mb-2 block">
                descrição
              </label>
              <input
                id="tx-desc"
                type="text"
                maxLength={200}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="opcional"
                className="w-full min-h-11 border border-border bg-transparent px-3 text-xs text-fg outline-none placeholder:text-ghost focus:border-accent/50"
              />
            </div>
          </div>

          {error && (
            <p className="mb-5 border border-negative/40 bg-negative/10 px-4 py-3 text-xs text-fg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!complete || saving}
            className="w-full border-none py-4 font-mono text-xs tracking-[0.12em] uppercase transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:bg-accent enabled:text-void enabled:hover:bg-accent-2 disabled:cursor-not-allowed disabled:bg-ghost disabled:text-faint"
          >
            {saving
              ? 'salvando...'
              : cents === 0
                ? 'informe o valor'
                : accountId === null
                  ? 'escolha a conta'
                  : `registrar ${formatCurrency(cents / 100)}`}
          </button>
        </div>
      </form>
    </dialog>
  )
}
