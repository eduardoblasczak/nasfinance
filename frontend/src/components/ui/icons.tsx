/**
 * Ícones desenhados à mão, traço de 1.6px numa grade de 24.
 *
 * Substituem o lucide-react: a biblioteca inteira entrava no bundle para
 * usarmos meia dúzia de símbolos, e o traço padrão dela é mais grosso do que
 * o resto da interface — os ícones apareciam mais pesados que o texto ao lado.
 */

interface IconProps {
  className?: string
  label?: string
}

function base(label?: string) {
  return label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const)
}

/**
 * A marca: um cubo em três faces chapadas, a mesma geometria do favicon e
 * dos ícones do app. As faces são o mesmo verde em três opacidades, então a
 * marca segue `currentColor` como os outros ícones.
 */
export function LogoMark({ className = 'size-[18px]' }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 29 9.5 16 17 3 9.5Z" fill="currentColor" />
      <path d="M3 9.5 16 17V31L3 23.5Z" fill="currentColor" opacity=".7" />
      <path d="M29 9.5 16 17V31L29 23.5Z" fill="currentColor" opacity=".42" />
    </svg>
  )
}

export function PhoneIcon({ className = 'size-2.5 shrink-0 text-accent' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...base('Registrado pelo atalho do iPhone')}
    >
      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 18h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function EditIcon({ className = 'size-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function TrashIcon({ className = 'size-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArchiveIcon({ className = 'size-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 6h18v4H3zM5 10v9h14v-9M10 14h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function RefreshIcon({ className = 'size-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArrowIcon({ className = 'size-3.5', direction = 'left' as 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={direction === 'right' ? { transform: 'rotate(180deg)' } : undefined}
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---- Navegação e controles do redesign ----
   Mesma grade de 24 e mesmo traço; a aba ativa troca o traço por
   preenchimento leve (`active`), como o iOS faz, para que a diferença não
   dependa só da cor. */

interface NavIconProps extends IconProps {
  active?: boolean
}

export function OverviewIcon({ className = 'size-6', active = false }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}

export function ListIcon({ className = 'size-6', active = false }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9 6.5h11M9 12h11M9 17.5h11" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" />
      <circle cx="4.75" cy="6.5" r="1.25" fill="currentColor" />
      <circle cx="4.75" cy="12" r="1.25" fill="currentColor" />
      <circle cx="4.75" cy="17.5" r="1.25" fill="currentColor" />
    </svg>
  )
}

/**
 * Análises: três barras subindo, na família de retângulos da Visão geral.
 * Ativa, a primeira e a última se preenchem (como os quadros da Visão geral),
 * para a aba não depender só do verde.
 */
export function AnalyticsIcon({ className = 'size-6', active = false }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="12.5" width="4.5" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} />
      <rect x="9.75" y="8" width="4.5" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="16" y="3.5" width="4.5" height="17" rx="1.5" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}

/** Bandeja de entrada: o que chegou e espera uma decisão. */
export function InboxIcon({ className = 'size-6', active = false }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 13.5 6 5.5h12l2.5 8v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.18 : 0}
      />
      <path d="M3.5 13.5h4.5l1.5 2h5l1.5-2h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function SettingsIcon({ className = 'size-6', active = false }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="15" cy="7" r="2.25" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} />
      <circle cx="9" cy="17" r="2.25" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}

export function EyeIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function EyeOffIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.5 7.6A15.7 15.7 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronDownIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CheckIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlusIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronRightIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9.5 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
