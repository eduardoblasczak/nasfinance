import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { formatCurrency, todayIso } from '@/lib/format'
import { useReferenceData } from '@/hooks/useReferenceData'
import { useMoneyVisibility } from '@/hooks/useMoneyVisibility'
import { Sheet } from './ui/Sheet'
import { Segmented } from './ui/Segmented'
import { chip, destructiveButton, field, label, primaryButton } from './ui/styles'
import type { Flow, Transaction } from '@/types'

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Transaction | null
  /**
   * Excluir o lançamento em edição. Quem passa decide como (a lista de
   * lançamentos usa Desfazer); sem ele, o botão não aparece.
   */
  onDelete?: (transaction: Transaction) => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '←']

/**
 * Formulário de lançamento, numa sheet.
 *
 * O valor é montado em CENTAVOS, como num caixa eletrônico: digitar 1, 5, 0
 * resulta em R$ 1,50. Ninguém precisa posicionar a vírgula, e o valor nunca
 * fica num estado intermediário inválido como "12,". O teclado é desenhado
 * aqui, e não o do sistema, porque o `inputmode="decimal"` do iOS ainda
 * deixa digitar duas vírgulas.
 */
export function TransactionForm({ open, onClose, onSaved, editing, onDelete }: TransactionFormProps) {
  const { accounts, categories } = useReferenceData()
  const { hidden } = useMoneyVisibility()
  // Com valores ocultos, o valor de um lançamento aberto para editar também
  // fica oculto até um gesto explícito: tocar no valor ou digitar. Quem está
  // digitando um valor já está olhando para ele.
  const [revealed, setRevealed] = useState(false)
  const masked = hidden && !revealed

  const [flow, setFlow] = useState<Flow>('EXPENSE')
  const [cents, setCents] = useState(0)
  const [accountId, setAccountId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Categorias de receita não podem ser oferecidas para uma despesa: o backend
  // rejeitaria com 422, e o erro seria um que a interface deveria ter evitado.
  const available = useMemo(
    () => categories.filter((category) => category.flow === flow && (!category.archived || category.id === categoryId)),
    [categories, flow, categoryId],
  )
  const activeAccounts = accounts.filter((account) => !account.archived || account.id === accountId)

  const press = useCallback((key: string) => {
    setRevealed(true)
    setCents((current) => {
      if (key === '←') return Math.floor(current / 10)
      if (key === '00') return Math.min(current * 100, 99_999_999)
      const next = current * 10 + Number(key)
      return next > 99_999_999 ? current : next
    })
  }, [])

  // Preenche (ou limpa) os campos sempre que a sheet abre
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
      setAccountId(accounts.find((account) => !account.archived)?.id ?? null)
      setCategoryId(null)
      setDescription('')
      setOccurredOn(todayIso())
    }
    setError(null)
    setRevealed(false)
  }, [open, editing, accounts])

  // Digitar no teclado físico alimenta o mesmo caminho dos botões: no desktop
  // ninguém quer clicar num teclado numérico com o mouse.
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      // Se o foco está num campo de texto, os dígitos pertencem a ELE.
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
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
    if (categoryId && !available.some((category) => category.id === categoryId)) setCategoryId(null)
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
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Não deu para salvar. Confira a conexão e tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  const reais = Math.floor(cents / 100).toLocaleString('pt-BR')
  const centavos = String(cents % 100).padStart(2, '0')

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Editar lançamento' : 'Novo lançamento'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Despesa/receita à vista: são duas opções, e a escolha muda o resto
            do formulário. */}
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

        {masked ? (
          // Oculto: nada de aria-live — o leitor de tela anunciaria o valor
          // assim que ele mudasse. O toque revela; o rótulo diz isso.
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              aria-label="Valor oculto. Toque para mostrar"
              className="press flex min-h-14 items-center gap-1 rounded-[var(--radius-inset)] px-4 text-[2.75rem] leading-none font-bold tracking-[-0.02em] text-fg"
            >
              <span className="mr-1 text-[1.25rem] font-semibold text-faint">R$</span>
              <span aria-hidden="true">••••</span>
            </button>
          </div>
        ) : (
          <div aria-live="polite" className="text-center">
            <span className="sr-only">Valor: </span>
            <span className={`text-[2.75rem] leading-none font-bold tracking-[-0.02em] tabular ${cents > 0 ? 'text-fg' : 'text-faint'}`}>
              <span className="mr-1 text-[1.25rem] font-semibold text-faint">R$</span>
              {reais}
              <span className="text-[0.7em]">,{centavos}</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              aria-label={key === '←' ? 'Apagar último dígito' : key}
              className="press min-h-12 rounded-[var(--radius-inset)] bg-surface-2 text-[1.25rem] font-medium text-fg tabular hover:bg-white/12 active:bg-white/16"
            >
              {key}
            </button>
          ))}
        </div>

        <fieldset>
          <legend className={label}>Categoria</legend>
          <div className="flex flex-wrap gap-2">
            {available.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
                aria-pressed={categoryId === category.id}
                className={chip(categoryId === category.id)}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} aria-hidden="true" />
                {category.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={label}>Conta</legend>
          <div className="flex flex-wrap gap-2">
            {activeAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => setAccountId(account.id)}
                aria-pressed={accountId === account.id}
                className={chip(accountId === account.id)}
              >
                {account.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3">
          <div>
            <label htmlFor="tx-date" className={label}>
              Data
            </label>
            <input
              id="tx-date"
              type="date"
              required
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
              className={`${field} [color-scheme:dark]`}
            />
          </div>
          <div>
            <label htmlFor="tx-desc" className={label}>
              Descrição
            </label>
            <input
              id="tx-desc"
              type="text"
              maxLength={200}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Opcional"
              className={field}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-[var(--radius-inset)] bg-negative/12 px-3.5 py-3 text-[0.9375rem] text-fg">
            {error}
          </p>
        )}

        {/* O botão diz o que falta em vez de ficar só cinza: "informe o
            valor" ensina mais do que um botão desabilitado mudo. */}
        <button type="submit" disabled={!complete || saving} className={`${primaryButton} min-h-12 w-full`}>
          {saving
            ? 'Salvando…'
            : cents === 0
              ? 'Informe o valor'
              : accountId === null
                ? 'Escolha a conta'
                : masked
                  ? editing
                    ? 'Salvar'
                    : 'Registrar'
                  : `${editing ? 'Salvar' : 'Registrar'} ${formatCurrency(cents / 100)}`}
        </button>

        {editing && onDelete && (
          <button type="button" onClick={() => onDelete(editing)} className={`${destructiveButton} w-full`}>
            Excluir lançamento
          </button>
        )}
      </form>
    </Sheet>
  )
}
