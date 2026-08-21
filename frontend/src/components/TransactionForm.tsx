import { useEffect, useMemo, useRef, useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { todayIso } from '@/lib/format'
import { useReferenceData } from '@/hooks/useReferenceData'
import type { Flow, Transaction } from '@/types'

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Quando presente, o formulario edita em vez de criar. */
  editing?: Transaction | null
}

/**
 * Formulario de lancamento, em dialogo modal.
 *
 * Usa o elemento nativo <dialog>: ele ja entrega foco preso dentro do modal,
 * fechamento com Esc e camada de fundo — comportamentos que uma div com
 * position:fixed exigiria reimplementar (e que quase sempre saem incompletos,
 * quebrando a navegacao por teclado).
 */
export function TransactionForm({ open, onClose, onSaved, editing }: TransactionFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { accounts, categories } = useReferenceData()

  const [flow, setFlow] = useState<Flow>('EXPENSE')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Categorias de receita nao podem ser oferecidas para uma despesa: o backend
  // rejeitaria com 422, e o usuario receberia um erro que a interface deveria
  // ter evitado.
  const availableCategories = useMemo(
    () => categories.filter((category) => category.flow === flow),
    [categories, flow],
  )

  // Abre/fecha o dialogo de forma imperativa, como a API nativa exige
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Preenche (ou limpa) os campos sempre que o dialogo abre
  useEffect(() => {
    if (!open) return

    if (editing) {
      setFlow(editing.flow)
      setAmount(String(editing.amount))
      setAccountId(String(editing.accountId))
      setCategoryId(editing.categoryId ? String(editing.categoryId) : '')
      setDescription(editing.description ?? '')
      setOccurredOn(editing.occurredOn)
    } else {
      setFlow('EXPENSE')
      setAmount('')
      setAccountId(accounts[0] ? String(accounts[0].id) : '')
      setCategoryId('')
      setDescription('')
      setOccurredOn(todayIso())
    }
    setError(null)
  }, [open, editing, accounts])

  // Trocar entre despesa e receita invalida a categoria selecionada
  useEffect(() => {
    if (categoryId && !availableCategories.some((c) => String(c.id) === categoryId)) {
      setCategoryId('')
    }
  }, [availableCategories, categoryId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      accountId: Number(accountId),
      categoryId: categoryId ? Number(categoryId) : null,
      flow,
      // Aceita virgula como separador decimal: e o que o teclado brasileiro
      // produz naturalmente.
      amount: Number(amount.replace(',', '.')),
      description: description.trim() || null,
      occurredOn,
      notes: null,
    }

    try {
      if (editing) {
        await api.put(`/api/v1/transactions/${editing.id}`, payload)
      } else {
        await api.post('/api/v1/transactions', payload)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-hairline bg-surface p-0 text-ink backdrop:bg-black/60"
    >
      <form onSubmit={handleSubmit}>
        <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-sm font-semibold">
            {editing ? 'Editar lancamento' : 'Novo lancamento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {/* Despesa/receita como botoes, nao select: sao duas opcoes, e a
              escolha muda o resto do formulario — merece estar visivel. */}
          <div className="grid grid-cols-2 gap-2">
            {(['EXPENSE', 'INCOME'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFlow(option)}
                aria-pressed={flow === option}
                className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                  flow === option
                    ? 'border-series-1 bg-series-1/12 text-ink'
                    : 'border-hairline text-ink-muted hover:text-ink-soft'
                }`}
              >
                {option === 'EXPENSE' ? 'Despesa' : 'Receita'}
              </button>
            ))}
          </div>

          <Field label="Valor" htmlFor="amount">
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </Field>

          <Field label="Conta" htmlFor="account">
            <select
              id="account"
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            >
              <option value="" disabled>
                Selecione
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Categoria" htmlFor="category" optional>
            <select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            >
              <option value="">Sem categoria</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Data" htmlFor="date">
            <input
              id="date"
              type="date"
              required
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </Field>

          <Field label="Descricao" htmlFor="description" optional>
            <input
              id="description"
              type="text"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: compra da semana"
              className="w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/10 px-3 py-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
              <p className="text-xs text-ink-soft">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-hairline px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-series-1 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string
  htmlFor: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-soft">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-muted">(opcional)</span>}
      </label>
      {children}
    </div>
  )
}
