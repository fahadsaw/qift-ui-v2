'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DEFAULT_LANG,
  LANGUAGES,
  type Lang,
  translate,
} from './translations'

type I18nValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
  dir: 'rtl' | 'ltr'
}

const I18nContext = createContext<I18nValue | null>(null)

const STORAGE_KEY = 'qift.lang'

function isLang(value: string | null): value is Lang {
  return !!value && LANGUAGES.some((l) => l.code === value)
}

function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLangState(stored)
    }
  }, [])

  useEffect(() => {
    const html = document.documentElement
    html.lang = lang
    html.dir = dirFor(lang)
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }, [])

  const t = useCallback((key: string) => translate(lang, key), [lang])

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t, dir: dirFor(lang) }),
    [lang, setLang, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

export function useT() {
  return useI18n().t
}
