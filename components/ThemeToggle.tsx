'use client'

import { useTheme, type ThemeMode } from '@/lib/theme'
import { useI18n } from '@/lib/i18n'

const ICONS: Record<ThemeMode, React.ReactNode> = {
  light: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  ),
  auto: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 010 18" fill="currentColor" opacity="0.3" />
    </svg>
  ),
}

const ORDER: ThemeMode[] = ['light', 'dark', 'auto']

export default function ThemeToggle() {
  const { mode, setMode } = useTheme()
  const { t } = useI18n()
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
  const labelKey = `theme.${mode}` as const

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`${t('theme.label')}: ${t(labelKey)}`}
      title={`${t('theme.label')}: ${t(labelKey)}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      {ICONS[mode]}
      <span className="hidden sm:inline">{t(labelKey)}</span>
    </button>
  )
}
