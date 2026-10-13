import { useEffect, useRef, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { ColorPicker } from './ui/ColorPicker'
import { CloseIcon } from './ui/icons'
import type { Account, AccountKind } from '@/types'

interface AccountFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Account | null
}

/**
 * Os rótulos têm de bater com os do enum `AccountKind` no backend, que por sua
 * vez batem com a constraint `ck_accounts_kind` da migration V1. Três lugares,
 * uma verdade — e o banco é a última linha de defesa.
 */
const KINDS: Array<{ value: AccountKind; label: string }> = [
  { value: 'CHECKING', label: 'Conta corrente' },
  { value: 'SAVINGS', label: 'Poupança' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'MEAL_VOUCHER', label: 'Vale refeição' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'INVESTMENT', label: 'Investimento' },
  { value: 'OTHER', label: 'Outros' },
]

export function AccountForm({ open, onClose, onSaved, editing }: AccountFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('CHECKING')
  const [color, setColor] = useState('#3987E5')
  const [openingBalance, setOpeningBalance] = useState('0')
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
      setKind(editing.kind)
      setColor(editing.color)
      setOpeningBalance(String(editing.openingBalance))
    } else {
      setName('')
      setKind('CHECKING')
      setColor('#3987E5')
      setOpeningBalance('0')
    }
    setError(null)
  }, [open, editing])

  const trimmed = name.trim()
  const complete = trimmed.length > 0 && trimmed.length <= 80

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!complete) return

    setSaving(true)
    setError(null)

    const payload = {
      name: trimmed,
      kind,
      color,
      // Vírgula é o separador decimal natural em pt-BR e o usuário vai digitar
      // assim; o JSON precisa de ponto. Converter aqui evita um 400 de parse
      // que não teria explicação visível na tela.
      openingBalance: Number(openingBalance.replace(',', '.')) || 0,
    }

    try {
      if (editing) await api.put(`/api/v1/accounts/${editing.id}`, payload)
      else await api.post('/api/v1/accounts', payload)
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
          <h2 className="eyebrow">{editing ? 'editar conta' : 'nova conta'}</h2>
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
            <label htmlFor="account-name" className="eyebrow mb-3 block">
              nome
            </label>
            <input
              id="account-name"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Conta Corrente"
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="account-kind" className="eyebrow mb-3 block">
              tipo
            </label>
            <select
              id="account-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as AccountKind)}
              className={`${fieldClass} font-mono`}
            >
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="account-balance" className="eyebrow mb-3 block">
              saldo inicial
            </label>
            <input
              id="account-balance"
              type="text"
              inputMode="decimal"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
              className={`${fieldClass} font-mono tabular`}
            />
            {/* O saldo atual não é um campo: ele é o inicial somado aos
                lançamentos. Dizer isso aqui evita a tentativa de "corrigir" o
                saldo editando este número, que na prática reescreveria o
                passado. */}
            <p className="mt-2 text-2xs text-faint">
              Ponto de partida. O saldo atual é este valor mais os lançamentos.
            </p>
          </div>

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
            {saving ? 'salvando...' : !trimmed ? 'informe o nome' : editing ? 'salvar' : 'criar conta'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
