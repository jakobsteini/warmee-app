import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Employee } from '../lib/employees'

interface CurrentUserValue {
  /** Gewählte Persona (nur "wer bin ich"-Geste, keine Rechte). Null = Overlay zeigen. */
  currentUser: Employee | null
  setCurrentUser: (employee: Employee | null) => void
}

const CurrentUserContext = createContext<CurrentUserValue | null>(null)

/**
 * Hält die pro Sitzung gewählte Persona im App-State (KEIN localStorage).
 * Solange currentUser null ist, zeigt die App das Einstiegs-Overlay.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const value = useMemo(
    () => ({ currentUser, setCurrentUser }),
    [currentUser],
  )
  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentUser(): CurrentUserValue {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) {
    throw new Error(
      'useCurrentUser muss innerhalb von CurrentUserProvider stehen.',
    )
  }
  return ctx
}
