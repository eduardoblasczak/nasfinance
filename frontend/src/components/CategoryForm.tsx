import { useEffect, useRef, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { ColorPicker } from './ui/ColorPicker'
import { CloseIcon } from './ui/icons'
import type { Category, Flow } from '@/types'

interface CategoryFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Category | null
  /** Fluxo inicial quando criando — vem da aba em que o usuário estava. */
  defaultFlow?: Flow
}

export function CategoryForm({
  open,
  onClose,
  onSaved,
  editing,
  defaultFlow = 'EXPENSE',
}: CategoryFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [name, setName] = useState('')
  const [flow, setFlow] = useState<Flow>(defaultFlow)
  const [color, setColor] = useState('#3987E5')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return

    if (editing) {
      setName(editing.name)
      setFlow(editing.flow)
      setColor(editing.color)
      setMonthlyBudget(editing.monthlyBudget === null ? '' : String(editing.monthlyBudget))
    } else {
      setName('')
      setFlow(defaultFlow)
      setColor('#3987E5')
      setMonthlyBudget('')
    }
    setError(null)
  }, [open, editing, defaultFlow])

  const trimmed = name.trim()
  const complete = trimmed.length > 0 && trimmed.length <= 60

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!complete) return

    setSaving(true)
    setError(null)

    const budget = monthlyBudget.trim()

    const payload = {
      name: trimmed,
      flow,
      color,
      icon: editing?.icon ?? null,
      // Vazio é `null`, não zero: `null` significa "sem teto definido",
      // enquanto `0` significaria "não pode gastar nada" e faria o dashboard
      // acusar estouro de orçamento no primeiro centavo.
      monthlyBudget: budget === '' ? null : Number(budget.replace(',', '.')),
    }

    try {
      if (editing) await api.put(`/api/v1/categories/${editing.id}`, payload)
      else await api.post('/api/v1/categories', payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass =
    'w-full min-h-11 border border-border bg-transparent px-3 text-xs text-fg outline-none transition-colors duration-300 placeholder:text-ghost focus:border-accent/50'

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] border border-ghost bg-void p-0 text-fg backdrop:bg-black/85"
    >
      <form onSubmit={handleSubmit}>
        <header className="flex items-center justify-between border-b border-ghost px-7 py-5">
          <h2 className="eyebrow">{editing ? 'editar categoria' : 'nova categoria'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-faint transition-colors duration-300 hover:text-fg"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="space-y-7 px-7 py-6">
          <div>
            <span className="eyebrow mb-3 block">tipo</span>
            {/* Dois botões, não um select: a escolha é binária e define o
                significado da categoria. Além disso, nomes podem repetir entre
                os fluxos — existe uma "Outros" de despesa e uma de receita — e
                é este campo que as distingue. */}
            <div className="grid grid-cols-2 gap-2">
              {(['EXPENSE', 'INCOME'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFlow(option)}
                  aria-pressed={flow === option}
                  className={`min-h-11 border py-3 font-mono text-xs tracking-wider transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    flow === option
                      ? 'border-accent/55 bg-accent/12 text-accent'
                      : 'border-border text-dim hover:border-faint hover:text-fg'
                  }`}
                >
                  {option === 'EXPENSE' ? 'Despesa' : 'Receita'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="category-name" className="eyebrow mb-3 block">
              nome
            </label>
            <input
              id="category-name"
              type="text"
              required
              maxLength={60}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Academia"
              className={fieldClass}
            />
            <p className="mt-2 text-2xs text-faint">
              O Atalho do iPhone encontra pelo nome, ignorando acento e maiúscula.
            </p>
          </div>

          {/* Orçamento só faz sentido em despesa: um teto de quanto se pode
              receber não significa nada, e o dashboard só compara gasto contra
              orçamento. */}
          {flow === 'EXPENSE' && (
            <div>
              <label htmlFor="category-budget" className="eyebrow mb-3 block">
                orçamento mensal
              </label>
              <input
                id="category-budget"
                type="text"
                inputMode="decimal"
                value={monthlyBudget}
                onChange={(event) => setMonthlyBudget(event.target.value)}
                placeholder="opcional"
                className={`${fieldClass} font-mono tabular`}
              />
              <p className="mt-2 text-2xs text-faint">
                Em branco, nenhum alerta. Com valor, o dashboard mostra quanto já foi usado.
              </p>
            </div>
          )}

          <div>
            <span className="eyebrow mb-3 block">cor</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {error && (
            <p className="border border-negative/40 bg-negative/10 px-4 py-3 text-xs text-fg">
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
              : !trimmed
                ? 'informe o nome'
                : editing
                  ? 'salvar'
                  : 'criar categoria'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
