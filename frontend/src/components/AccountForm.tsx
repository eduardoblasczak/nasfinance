import { useEffect, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { parseDecimal } from '@/lib/format'
import { ColorPicker } from './ui/ColorPicker'
import { Sheet } from './ui/Sheet'
import { destructiveButton, field, label, primaryButton, secondaryButton } from './ui/styles'
import type { Account, AccountKind } from '@/types'

interface AccountFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Account | null
  /** Arquivar ou desarquivar a conta em edição. */
  onToggleArchive?: (account: Account) => void
  /** Pedir a exclusão (quem chama confirma antes). */
  onDelete?: (account: Account) => void
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

export function AccountForm({ open, onClose, onSaved, editing, onToggleArchive, onDelete }: AccountFormProps) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('CHECKING')
  const [color, setColor] = useState('#3987E5')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    if (editing) {
      setName(editing.name)
      setKind(editing.kind)
      setColor(editing.color)
      setOpeningBalance(String(editing.openingBalance).replace('.', ','))
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
      openingBalance: parseDecimal(openingBalance) || 0,
    }

    try {
      if (editing) await api.put(`/api/v1/accounts/${editing.id}`, payload)
      else await api.post('/api/v1/accounts', payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.fullMessage : 'Não deu para salvar. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Editar conta' : 'Nova conta'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="account-name" className={label}>
            Nome
          </label>
          <input
            id="account-name"
            type="text"
            required
            maxLength={80}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Conta corrente"
            className={field}
          />
        </div>

        <div>
          <label htmlFor="account-kind" className={label}>
            Tipo
          </label>
          <select
            id="account-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as AccountKind)}
            className={`${field} appearance-none`}
          >
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="account-balance" className={label}>
            Saldo inicial
          </label>
          <input
            id="account-balance"
            type="text"
            inputMode="decimal"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            aria-describedby="account-balance-hint"
            className={`${field} tabular`}
          />
          {/* O saldo atual não é um campo: ele é o inicial somado aos
              lançamentos. Dizer isso evita a tentativa de "corrigir" o saldo
              editando este número, que reescreveria o passado. */}
          <p id="account-balance-hint" className="mt-1.5 text-[0.8125rem] text-faint">
            Ponto de partida. O saldo atual é este valor mais os lançamentos.
          </p>
        </div>

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
          {saving ? 'Salvando…' : !trimmed ? 'Informe o nome' : editing ? 'Salvar' : 'Criar conta'}
        </button>

        {editing && (onToggleArchive || onDelete) && (
          <div className="flex flex-col gap-2 border-t border-separator pt-5">
            {onToggleArchive && (
              <button type="button" onClick={() => onToggleArchive(editing)} className={`${secondaryButton} w-full`}>
                {editing.archived ? 'Desarquivar conta' : 'Arquivar conta'}
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => onDelete(editing)} className={`${destructiveButton} w-full`}>
                Excluir conta
              </button>
            )}
            {/* Arquivar e excluir fazem coisas diferentes, e a diferença tem de
                estar escrita aqui, antes do toque. */}
            <p className="text-[0.8125rem] text-faint">
              Arquivar tira a conta dos formulários e mantém o histórico. Excluir só funciona se ela não
              tiver lançamentos.
            </p>
          </div>
        )}
      </form>
    </Sheet>
  )
}
