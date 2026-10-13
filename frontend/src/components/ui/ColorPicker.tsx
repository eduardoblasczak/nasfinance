/**
 * Seletor de cor para contas e categorias.
 *
 * A paleta não foi escolhida aqui: são exatamente as oito cores de série do
 * design system (`--color-series-1..8`), as mesmas que o seed usa e que os
 * gráficos do dashboard já desenham. Uma cor nova inventada neste formulário
 * apareceria depois numa fatia do gráfico brigando com o resto.
 *
 * O campo nativo fica ao lado para quem quiser sair da paleta — mesmo
 * raciocínio do `<input type="date">` do PeriodPicker: a versão do navegador
 * é feia perto do resto, mas entrega teclado, leitor de tela e o seletor do
 * sistema operacional de graça, e reimplementar isso quase sempre sai pior.
 */

const PALETTE = [
  '#3987E5',
  '#D95926',
  '#199E70',
  '#C98500',
  '#D55181',
  '#008300',
  '#9085E9',
  '#E66767',
  '#898781',
] as const

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  id?: string
}

export function ColorPicker({ value, onChange, id }: ColorPickerProps) {
  const normalized = value.toUpperCase()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PALETTE.map((color) => {
        const selected = normalized === color
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Cor ${color}`}
            aria-pressed={selected}
            // O alvo tem 44px; o quadrado de cor dentro dele é menor. Separar
            // os dois deixa a marca visual discreta sem encolher a área
            // clicável — exatamente o problema que a fase 2 corrigiu.
            className={`flex size-11 items-center justify-center border transition-colors duration-300 ${
              selected ? 'border-accent' : 'border-transparent hover:border-ghost'
            }`}
          >
            <span className="size-4" style={{ backgroundColor: color }} aria-hidden="true" />
          </button>
        )
      })}

      <label className="flex size-11 cursor-pointer items-center justify-center border border-border transition-colors duration-300 hover:border-faint">
        <span className="sr-only">Escolher outra cor</span>
        <input
          id={id}
          type="color"
          value={normalized}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-4 cursor-pointer appearance-none border-none bg-transparent p-0"
        />
      </label>
    </div>
  )
}
