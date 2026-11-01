/**
 * "O sinal que inverte", antes e depois: a mesma linha do teste
 * (PluggyTranslatorTest, creditCardDebit) lida pelo tipo e pelo sinal.
 *
 * Lida pelo sinal, a despesa vira receita: a seta gira para "entrou", o
 * valor fica verde e o erro no saldo do mês sobe até o dobro do valor
 * (some a despesa e aparece a receita). Sem JavaScript, fica a leitura
 * certa, que já vem no HTML.
 */
import { formatCurrency } from '../../../frontend/src/lib/format'
import { MOTION, reduced, tween } from './motion'

const AMOUNT_CENTS = 48_483

export function startStories() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button.read')]
  const arrow = document.getElementById('sign-arrow')
  const label = document.getElementById('sign-label')
  const amount = document.getElementById('sign-amount')
  const gap = document.getElementById('sign-gap')
  if (!arrow || !label || !amount || !gap) return

  let gapShown = 0
  let stop = () => {}

  const show = (bySign: boolean) => {
    const formatted = formatCurrency(AMOUNT_CENTS / 100)
    const comma = formatted.lastIndexOf(',')
    const cents = document.createElement('span')
    cents.className = 'text-[0.82em]'
    cents.textContent = formatted.slice(comma)
    amount.replaceChildren(`${bySign ? '+' : '−'} ${formatted.slice(0, comma)}`, cents)
    amount.className = `shrink-0 text-[1.25rem] font-semibold whitespace-nowrap tabular ${bySign ? 'text-accent' : 'text-fg'}`
    label.textContent = bySign ? 'Receita (errado)' : 'Despesa'
    arrow.classList.toggle('is-income', bySign)
    if (!reduced()) {
      amount.classList.remove('swap')
      void amount.offsetWidth
      amount.classList.add('swap')
    }
    // O erro no saldo: de zero até 2 × o valor, e de volta.
    stop()
    const target = bySign ? AMOUNT_CENTS * 2 : 0
    stop = tween(gapShown, target, MOTION.flight, (value) => {
      gapShown = Math.round(value)
      gap.textContent = formatCurrency(gapShown / 100)
      gap.classList.toggle('text-negative', gapShown > 0)
    })
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button))
      show(button.dataset.read === 'sign')
    })
  }
}
