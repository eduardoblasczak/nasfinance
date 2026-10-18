import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * Ocultar valores: o olho que todo app de banco tem.
 *
 * Quem abre o app no ônibus ou numa reunião não quer o saldo na tela. A
 * escolha fica no dispositivo (localStorage) e não no servidor: é sobre
 * quem está olhando para ESTA tela, não sobre a conta.
 *
 * O acesso ao storage fica em try/catch porque ele lança em aba anônima do
 * Safari e com dados do site bloqueados — e um botão de privacidade não pode
 * derrubar a tela.
 */

const STORAGE_KEY = 'nasfinance:hide-values'

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface MoneyVisibility {
  hidden: boolean
  toggle: () => void
}

const MoneyVisibilityContext = createContext<MoneyVisibility>({ hidden: false, toggle: () => {} })

export function MoneyVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readStored)

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Sem storage a escolha vale só até recarregar — melhor que nada.
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])
  return <MoneyVisibilityContext.Provider value={value}>{children}</MoneyVisibilityContext.Provider>
}

export function useMoneyVisibility(): MoneyVisibility {
  return useContext(MoneyVisibilityContext)
}
