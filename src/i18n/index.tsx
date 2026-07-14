import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { translations, type Lang, type TranslationKey } from './dict'

/** Übersetzungsfunktion: Key → Text der aktiven Sprache, mit {var}-Interpolation. */
export type TFunc = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string

interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFunc
}

const I18nContext = createContext<I18nValue | null>(null)

/**
 * Leichtgewichtige, eigene i18n-Lösung (kein react-i18next – der Umfang
 * rechtfertigt keine zusätzliche Abhängigkeit). Die Sprache lebt im Context und
 * überdauert damit die Sitzung (Navigation), ohne localStorage. Default:
 * Deutsch.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('de')

  const t = useCallback<TFunc>(
    (key, vars) => {
      // Fallback-Kette: aktive Sprache → Deutsch → der Key selbst.
      let text = translations[lang][key] ?? translations.de[key] ?? key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replace(
            new RegExp(`\\{${name}\\}`, 'g'),
            String(value),
          )
        }
      }
      return text
    },
    [lang],
  )

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Zugriff auf Sprache + Umschalter + t(). Muss innerhalb des Providers stehen. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n muss innerhalb von <I18nProvider> stehen.')
  return ctx
}

/** Bequemer Direktzugriff nur auf die Übersetzungsfunktion. */
export function useT(): TFunc {
  return useI18n().t
}
