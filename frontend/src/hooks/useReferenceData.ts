import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Account, Category } from '@/types'

interface ReferenceData {
  accounts: Account[]
  categories: Category[]
  loading: boolean
  reload: () => void
}

/**
 * Contas e categorias — os dados que preenchem os formularios.
 *
 * Mudam raramente, entao sao carregados uma vez e reaproveitados, em vez de
 * refeitos a cada abertura de formulario.
 */
export function useReferenceData(): ReferenceData {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // As duas chamadas sao independentes: Promise.all as faz em paralelo,
      // pela metade do tempo de espera.
      const [accountList, categoryList] = await Promise.all([
        api.get<Account[]>('/api/v1/accounts'),
        api.get<Category[]>('/api/v1/categories'),
      ])
      setAccounts(accountList)
      setCategories(categoryList)
    } catch {
      // Formularios lidam com listas vazias; o erro real aparece ao salvar.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { accounts, categories, loading, reload: () => void load() }
}
