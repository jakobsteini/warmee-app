/**
 * Fester Mitarbeiter-Roster für die Persona-Auswahl im Einstiegs-Overlay.
 *
 * Bewusst eine Frontend-Konstante: das Overlay ist eine reine "Wer bin ich"-
 * Geste (kein Login, keine Rechte). Sie spiegelt exakt das Seed der Migration
 * 20260714160000_employees.sql — sobald diese Tabelle live ist, kann hier auf
 * ein SELECT umgestellt werden.
 */
export interface Employee {
  id: string
  name: string
  is_admin: boolean
}

/** Reihenfolge = Anzeigereihenfolge (Admins zuerst). */
export const EMPLOYEES: Employee[] = [
  { id: 'theresa', name: 'Theresa', is_admin: true },
  { id: 'christian', name: 'Christian', is_admin: true },
  { id: 'verena', name: 'Verena', is_admin: false },
  { id: 'christopher', name: 'Christopher', is_admin: false },
  { id: 'alina', name: 'Alina', is_admin: false },
  { id: 'lena', name: 'Lena', is_admin: false },
  { id: 'jakob', name: 'Jakob', is_admin: false },
  { id: 'daniela', name: 'Daniela', is_admin: false },
]

/** Initiale(n) für den Avatar (erste zwei Buchstaben des Vornamens). */
export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}
