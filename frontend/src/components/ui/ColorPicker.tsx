/**
 * Seletor de cor para contas e categorias.
 *
 * A paleta não foi escolhida aqui: são exatamente as oito cores de série do
 * design system (`--color-series-1..8`), as mesmas que o seed usa e que os
 * gráficos já desenham. Uma cor nova inventada neste formulário apareceria
 * depois numa barra do gráfico brigando com o resto.
 *
 * O campo nativo fica ao lado para quem quiser sair da paleta: ele entrega
 * teclado, leitor de tela e o seletor do sistema de graça.
 */

const PALETTE = [
  { hex: '#3987E5', name: 'azul' },
  { hex: '#D95926', name: 'laranja' },
  { hex: '#199E70', name: 'verde' },
  { hex: '#C98500', name: 'mostarda' },
  { hex: '#D55181', name: 'rosa' },
  { hex: '#008300', name: 'verde escuro' },
  { hex: '#9085E9', name: 'lilás' },
  { hex: '#E66767', name: 'vermelho' },
  { hex: '#898781', name: 'cinza' },
] as const

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  id?: string
}

export function ColorPicker({ value, onChange, id }: ColorPickerProps) {
  const normalized = value.toUpperCase()
  const custom = !PALETTE.some((color) => color.hex === normalized)

  return (
    <div className="flex flex-wrap items-center gap-1">
      {PALETTE.map((color) => {
        const selected = normalized === color.hex
        return (
          <button
            key={color.hex}
            type="button"
            onClick={() => onChange(color.hex)}
            // Nome da cor, não o hex: "Cor #3987E5" não diz nada a quem ouve.
            aria-label={`Cor ${color.name}`}
            aria-pressed={selected}
            // Alvo de 44 px com a bolinha menor dentro: a marca fica discreta
            // sem encolher a área de toque. Selecionada ganha anel, não só cor.
            className="press flex size-11 items-center justify-center rounded-full"
          >
            <span
              aria-hidden="true"
              className={`size-7 rounded-full ${selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
              style={{ backgroundColor: color.hex }}
            />
          </button>
        )
      })}

      <label
        className={`press relative flex size-11 cursor-pointer items-center justify-center rounded-full has-[input:focus-visible]:outline-1 has-[input:focus-visible]:outline-accent`}
      >
        <span className="sr-only">Escolher outra cor</span>
        <span
          aria-hidden="true"
          className={`size-7 rounded-full border-2 border-dashed border-border ${custom ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
          style={custom ? { backgroundColor: normalized, borderStyle: 'solid' } : undefined}
        />
        <input
          id={id}
          type="color"
          value={normalized}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}
