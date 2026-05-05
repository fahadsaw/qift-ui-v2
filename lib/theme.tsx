'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'
type ResolvedTheme = 'light' | 'dark'

type ThemeValue = {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

const STORAGE_KEY = 'qift.theme'

function readSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('auto')
  const [resolved, setResolved] = useState<ResolvedTheme>('light')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModeState(stored)
    }
  }, [])

  useEffect(() => {
    const next: ResolvedTheme = mode === 'auto' ? readSystem() : mode
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolved(next)
    applyTheme(next)

    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const r: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolved(r)
      applyTheme(r)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }, [])

  const value = useMemo<ThemeValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var s = localStorage.getItem('${STORAGE_KEY}');
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var r = (s === 'light' || s === 'dark') ? s : sys;
    document.documentElement.dataset.theme = r;
    document.documentElement.style.colorScheme = r;
  } catch(e) {}
  try {
    var l = localStorage.getItem('qift.lang');
    var langs = ['ar','en','tr','ur','hi','id','fr'];
    var rtl = ['ar','ur'];
    if (l && langs.indexOf(l) !== -1) {
      document.documentElement.lang = l;
      document.documentElement.dir = rtl.indexOf(l) !== -1 ? 'rtl' : 'ltr';
    }
  } catch(e) {}
})();
`
