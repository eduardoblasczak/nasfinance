import { Sheet } from './Sheet'
import { destructiveButton, secondaryButton } from './styles'

interface ConfirmSheetProps {
  open: boolean
  title: string
  /** A consequência concreta, não "tem certeza?". */
  consequence: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmação para o que não tem volta.
 *
 * Substitui o window.confirm: aquele diálogo do navegador não diz de quem é,
 * não segue o tema e no iPhone aparece com o domínio no título. Aqui o botão
 * diz a ação ("Excluir conta") em vez de "OK", e o texto diz o que acontece.
 *
 * Só para o irreversível. O que dá para desfazer executa direto e oferece
 * Desfazer no aviso — perguntar antes de tudo ensina a confirmar sem ler.
 */
export function ConfirmSheet({ open, title, consequence, confirmLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <p className="text-[0.9375rem] leading-relaxed text-dim">{consequence}</p>
      <div className="mt-6 flex flex-col gap-2 md:flex-row-reverse">
        <button type="button" onClick={onConfirm} className={`${destructiveButton} w-full md:w-auto`}>
          {confirmLabel}
        </button>
        {/* O foco nasce no Cancelar: Enter por engano não pode excluir. */}
        <button type="button" data-autofocus onClick={onCancel} className={`${secondaryButton} w-full md:w-auto`}>
          Cancelar
        </button>
      </div>
    </Sheet>
  )
}
