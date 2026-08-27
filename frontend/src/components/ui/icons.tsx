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

export function LogoMark({ className = 'size-[18px]' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2 L22 8 V16 L12 22 L2 16 V8 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M12 2 V22 M2 8 L22 16 M22 8 L2 16" stroke="currentColor" strokeWidth=".7" opacity=".45" />
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
