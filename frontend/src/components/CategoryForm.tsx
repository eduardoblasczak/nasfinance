import { useEffect, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { parseDecimal } from '@/lib/format'
import { ColorPicker } from './ui/ColorPicker'
import { Sheet } from './ui/Sheet'
import { MoneyInput } from './ui/MoneyInput'
import { Segmented } from './ui/Segmented'
import { destructiveButton, field, label, primaryButton, secondaryButton } from './ui/styles'
import type { Category, Flow } from '@/types'

interface CategoryFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Category | null
  /** Fluxo inicial quando criando — vem da aba em que o usuário estava. */
  defaultFlow?: Flow
  onToggleArchive?: (category: Category) => void
  onDelete?: (category: Category) => void
}

export function CategoryForm({
  open,
  onClose,
  onSaved,
  editing,
  defaultFlow = 'EXPENSE',
  onToggleArchive,
  onDelete,
}: CategoryFormProps) {
  const [name, setName] = useState('')
  const [flow, setFlow] = useState<Flow>(defaultFlow)
  const [color, setColor] = useState('#3987E5')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    if (editing) {
      setName(editing.name)
      setFlow(editing.flow)
      setColor(editing.color)
      setMonthlyBudget(editing.monthlyBudget === null ? '' : String(editing.monthlyBudget).replace('.', ','))
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
      // enquanto `0` faria o dashboard acusar estouro no primeiro centavo.
      monthlyBudget:
        flow === 'INCOME' || budget === '' ? null : parseDecimal(budget),
    }

    try {
      if (editing) await api.put(`/api/v1/categories/${editing.id}`, payload)
      else await api.post('/api/v1/categories', payload)
      onSaved()
      onClose()
    } catch (err) {
      // O 409 tem duas causas no backend; o formulário sabe qual foi.
      const flowChanged = editing !== null && editing !== undefined && editing.flow !== flow
      setError(
        errorMessage(err, 'Não foi possível salvar a categoria. Tente de novo.', {
          409: flowChanged
            ? 'Esta categoria já tem lançamentos e não pode trocar entre despesa e receita. Crie uma categoria nova.'
            : `Já existe uma categoria de ${flow === 'EXPENSE' ? 'despesa' : 'receita'} com esse nome. Escolha outro nome.`,
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Editar categoria' : 'Nova categoria'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Binário e define o significado da categoria. Nomes podem repetir
            entre os fluxos — existe "Outros" de despesa e de receita — e é
            este campo que as distingue. */}
        <Segmented
          label="Tipo"
          value={flow}
          onChange={setFlow}
          options={[
            { value: 'EXPENSE', label: 'Despesa' },
            { value: 'INCOME', label: 'Receita' },
          ]}
          className="flex w-full"
        />

        <div>
          <label htmlFor="category-name" className={label}>
            Nome
          </label>
          <input
            id="category-name"
            type="text"
            required
            maxLength={60}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Academia"
            aria-describedby="category-name-hint"
            className={field}
          />
          <p id="category-name-hint" className="mt-1.5 text-[0.8125rem] text-faint">
            O Atalho do iPhone encontra a categoria pelo nome, sem diferenciar acentos nem maiúsculas.
          </p>
        </div>

        {/* Teto só faz sentido em despesa: o dashboard só compara gasto
            contra orçamento. */}
        {flow === 'EXPENSE' && (
          <div>
            <label htmlFor="category-budget" className={label}>
              Teto mensal
            </label>
            <MoneyInput
              id="category-budget"
              value={monthlyBudget}
              onChange={setMonthlyBudget}
              resetKey={open}
              placeholder="Opcional"
              describedBy="category-budget-hint"
            />
            <p id="category-budget-hint" className="mt-1.5 text-[0.8125rem] text-faint">
              Limite de despesas para o mês. Com um valor, a Visão geral e as Análises mostram quanto dele já foi usado.
            </p>
          </div>
        )}

        <fieldset>
          <legend className={label}>Cor</legend>
          <ColorPicker value={color} onChange={setColor} />
        </fieldset>

        {error && (
          <p role="alert" className="rounded-[var(--radius-inset)] bg-negative/12 px-3.5 py-3 text-[0.9375rem] text-fg">
            {error}
          </p>
        )}

        <button type="submit" disabled={!complete || saving} className={`${primaryButton} min-h-12 w-full`}>
          {saving ? 'Salvando…' : !trimmed ? 'Informe o nome da categoria' : editing ? 'Salvar alterações' : 'Criar categoria'}
        </button>

        {editing && (onToggleArchive || onDelete) && (
          <div className="flex flex-col gap-2 border-t border-separator pt-5">
            {onToggleArchive && (
              <button type="button" onClick={() => onToggleArchive(editing)} className={`${secondaryButton} w-full`}>
                {editing.archived ? 'Desarquivar categoria' : 'Arquivar categoria'}
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => onDelete(editing)} className={`${destructiveButton} w-full`}>
                Excluir categoria
              </button>
            )}
            <p className="text-[0.8125rem] text-faint">
              Arquivar tira a categoria dos formulários e mantém o histórico classificado. Excluir deixa os
              lançamentos dela sem categoria.
            </p>
          </div>
        )}
      </form>
    </Sheet>
  )
}
