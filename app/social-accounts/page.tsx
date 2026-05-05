'use client'

import { useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

type Platform = {
  id: string
  name: string
  iconPath: string
}

const PLATFORMS: Platform[] = [
  {
    id: 'snapchat',
    name: 'Snapchat',
    iconPath:
      'M12 3c3 0 5 2 5 5v3c1 1 3 1 3 2 0 1-2 1-3 2-1 2-2 4-5 4s-4-2-5-4c-1-1-3-1-3-2 0-1 2-1 3-2V8c0-3 2-5 5-5z',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    iconPath: 'M14 4v9.5a3.5 3.5 0 11-3.5-3.5M14 4c.5 2 2 3.5 4.5 3.5',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    iconPath:
      'M16 11.4a4 4 0 11-8 0 4 4 0 018 0zM17.5 6.5h.01M3 8a5 5 0 015-5h8a5 5 0 015 5v8a5 5 0 01-5 5H8a5 5 0 01-5-5V8z',
  },
  {
    id: 'x',
    name: 'X',
    iconPath: 'M4 4l16 16M20 4L4 20',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    iconPath:
      'M14 4h3v4h-3a1 1 0 00-1 1v3h4l-1 4h-3v8h-4v-8H6v-4h3V8a4 4 0 014-4h1z',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    iconPath:
      'M3 8a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3V8zM10 9l5 3-5 3V9z',
  },
  {
    id: 'threads',
    name: 'Threads',
    iconPath:
      'M12 3a9 9 0 109 9M9 13c0-3 2-4 4-4s4 1 4 3-2 3-4 3-4-1-4-2',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    iconPath: 'M3 11l18-7-3 17-7-4-3 4-1-6 13-9-15 5z',
  },
]

type Account = {
  connected: boolean
  handle: string
  verified: boolean
  discoverable: boolean
}

const DEFAULT_ACCOUNTS: Record<string, Account> = {
  snapchat: { connected: true, handle: 'noura.snap', verified: true, discoverable: true },
  instagram: { connected: true, handle: 'noura', verified: true, discoverable: true },
  tiktok: { connected: false, handle: '', verified: false, discoverable: true },
  x: { connected: false, handle: '', verified: false, discoverable: true },
  facebook: { connected: false, handle: '', verified: false, discoverable: false },
  youtube: { connected: false, handle: '', verified: false, discoverable: true },
  threads: { connected: false, handle: '', verified: false, discoverable: true },
  telegram: { connected: false, handle: '', verified: false, discoverable: true },
}

export default function SocialAccountsPage() {
  const { t } = useI18n()
  const toast = useToast()
  const [accounts, setAccounts] =
    useState<Record<string, Account>>(DEFAULT_ACCOUNTS)
  const [pending, setPending] = useState<string | null>(null)

  const toggleConnect = (id: string) => {
    if (pending) return
    const wasConnected = accounts[id].connected
    setPending(id)
    setTimeout(() => {
      setAccounts((s) => ({
        ...s,
        [id]: wasConnected
          ? { ...s[id], connected: false, verified: false, handle: '' }
          : { ...s[id], connected: true, verified: true, handle: 'username' },
      }))
      setPending(null)
      toast.show(
        wasConnected
          ? t('toast.account_unlinked')
          : t('toast.account_linked'),
      )
    }, 700)
  }

  const toggleDiscoverable = (id: string) => {
    setAccounts((s) => ({
      ...s,
      [id]: { ...s[id], discoverable: !s[id].discoverable },
    }))
    toast.show(t('toast.changes_saved'))
  }

  return (
    <PageContainer>
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('social.badge')}</Badge>}
          line1={t('social.title_1')}
          gradient={t('social.title_2')}
          subtitle={t('social.subtitle')}
          size="sm"
        />

        <div
          className="mt-4 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs leading-relaxed"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }}>
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 118 0v3" />
          </svg>
          <span>{t('social.ownership_notice')}</span>
        </div>

        <div
          className="mt-2 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs leading-relaxed"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{t('social.search_visibility_note')}</span>
        </div>

        <ul className="mt-4 flex flex-col gap-2.5">
          {PLATFORMS.map((p) => {
            const acc = accounts[p.id]
            return (
              <li
                key={p.id}
                className="rounded-2xl border p-4 backdrop-blur-md"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                      style={{
                        borderColor: 'var(--border)',
                        background: 'var(--surface-2)',
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        style={{ color: 'var(--primary)' }}
                      >
                        <path d={p.iconPath} />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3
                          className="truncate text-sm font-bold tracking-tight"
                          style={{ color: 'var(--ink)' }}
                        >
                          {p.name}
                        </h3>
                        {acc.verified && (
                          <span
                            aria-label={t('social.verified')}
                            className="flex h-4 w-4 items-center justify-center rounded-full text-[0.55rem] font-bold text-white"
                            style={{
                              background:
                                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      {acc.connected ? (
                        <p
                          className="truncate text-xs"
                          style={{ color: 'var(--muted)' }}
                          dir="ltr"
                        >
                          @{acc.handle}
                        </p>
                      ) : (
                        <p
                          className="text-xs"
                          style={{ color: 'var(--muted-2)' }}
                        >
                          {t('social.handle_label')}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleConnect(p.id)}
                    disabled={pending !== null}
                    aria-busy={pending === p.id || undefined}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-5 py-2.5 text-xs font-semibold transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                    style={
                      acc.connected
                        ? {
                            borderColor: 'var(--border)',
                            background: 'var(--card-soft)',
                            color: '#D55B6E',
                            minWidth: '6.5rem',
                          }
                        : {
                            borderColor: 'transparent',
                            background:
                              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                            color: '#fff',
                            boxShadow: 'var(--shadow-soft)',
                            minWidth: '6.5rem',
                          }
                    }
                  >
                    {pending === p.id ? (
                      <span
                        className="qift-spin h-3.5 w-3.5 rounded-full border-2"
                        style={{
                          borderColor: acc.connected
                            ? 'rgba(213,91,110,0.3)'
                            : 'rgba(255,255,255,0.4)',
                          borderTopColor: acc.connected ? '#D55B6E' : '#fff',
                        }}
                      />
                    ) : acc.connected ? (
                      t('social.disconnect')
                    ) : (
                      t('social.connect')
                    )}
                  </button>
                </div>

                {acc.connected && (
                  <button
                    type="button"
                    onClick={() => toggleDiscoverable(p.id)}
                    className="mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition-colors"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--surface-2)',
                      color: 'var(--text)',
                    }}
                  >
                    <span style={{ color: 'var(--text-soft)' }}>
                      {t('social.discoverability')}
                    </span>
                    <span
                      aria-hidden
                      className="relative h-5 w-9 rounded-full transition-colors"
                      style={{
                        background: acc.discoverable
                          ? 'var(--primary)'
                          : 'var(--border-strong)',
                      }}
                    >
                      <span
                        className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                        style={{
                          left: acc.discoverable
                            ? 'calc(100% - 18px)'
                            : '2px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        }}
                      />
                    </span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </PageContainer>
  )
}
