/**
 * Classes das peças repetidas da interface nova.
 *
 * Strings, não componentes: um botão é um <button> com um visual, e
 * embrulhá-lo num componente só para trocar a cor obrigaria a repassar
 * type, disabled, aria-* e ref a cada uso. Uma constante evita isso e mantém
 * a forma idêntica em todas as telas.
 *
 * Cápsula (rounded-full) em todo botão: o raio "infinito" do iOS 26 é
 * concêntrico com qualquer card, então nunca briga com o canto de fora.
 */

const button =
  'press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40'

export const primaryButton = `${button} bg-accent text-void enabled:hover:bg-accent/90`
export const secondaryButton = `${button} bg-surface-2 text-fg enabled:hover:bg-white/12`
export const quietButton = `${button} px-3 font-medium text-dim enabled:hover:bg-surface-2 enabled:hover:text-fg`
export const destructiveButton = `${button} bg-negative/15 text-negative enabled:hover:bg-negative/25`

/** Botão redondo só com ícone, sempre com aria-label. */
export const iconButton =
  'press flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-dim hover:text-fg'

/**
 * Campo de formulário. 16 px no texto: abaixo disso o Safari do iPhone dá
 * zoom ao focar, e a tela fica torta até a pessoa desfazer o zoom na mão.
 */
export const field =
  'w-full min-h-11 rounded-[var(--radius-inset)] bg-surface-2 px-3.5 text-base text-fg outline-none placeholder:text-faint focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** Rótulo de campo: frase curta, não MAIÚSCULA espaçada. */
export const label = 'mb-1.5 block text-[0.8125rem] font-semibold text-dim'

/** Card de conteúdo: sólido, sem borda, cantos concêntricos com o que vai dentro. */
export const card = 'rounded-[var(--radius-card)] bg-surface'

/** Título de seção dentro da tela, acima de um card. */
export const sectionTitle = 'text-[1.25rem] font-bold tracking-[-0.01em] text-fg'

/** Chip de escolha (categoria, conta) — aria-pressed diz o estado. */
export function chip(selected: boolean): string {
  return `press inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-[0.9375rem] ${
    selected
      ? 'bg-accent/15 font-semibold text-accent ring-1 ring-accent/50 ring-inset'
      : 'bg-surface-2 text-dim hover:text-fg'
  }`
}
