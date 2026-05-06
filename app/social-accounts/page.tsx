'use client'

import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
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

// One backend row from /social-accounts/me. Mirrors PUBLIC_SELECT in
// the API service. The "Verified" chip now reads from the tri-state
// `verificationLevel` column ('unverified' | 'verified' | 'oauth_verified').
// `verified` is the legacy boolean, kept on the type so older API
// builds still parse cleanly during the deploy window.
type VerificationLevel = 'unverified' | 'verified' | 'oauth_verified'
type ApiSocialAccount = {
  id: string
  platform: string
  handle: string
  url: string | null
  verified: boolean
  verificationLevel?: VerificationLevel
  isPrimary: boolean
  createdAt: string
}

export default function SocialAccountsPage() {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()

  // accounts indexed by platform id for O(1) lookup in the row render.
  // null until first fetch resolves so the UI can show a loading state
  // instead of "every platform is unlinked" flash.
  const [accounts, setAccounts] = useState<Record<
    string,
    ApiSocialAccount
  > | null>(null)
  // Per-platform busy flag for any in-flight POST / PATCH / DELETE so
  // we can disable the buttons + show a spinner without blocking other
  // platforms.
  const [pending, setPending] = useState<string | null>(null)
  // Draft handle for the "Add" form (unlinked platforms) and the
  // "Edit" form (linked platforms). Keyed by platform id.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})

  // Email contact (separate from social platforms — lives on User.email).
  // Surfaced at the top of this page so users have a single hub for
  // every contact / discovery method. The verification chip reads
  // from `emailVerifiedAt` on /users/me — null ⇒ unverified, populated
  // ⇒ verified (set when an email-OTP flow ships; null today).
  const [email, setEmail] = useState<string | null>(null)
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailEditing, setEmailEditing] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)

  // Fetch /social-accounts/me on mount. Async IIFE so the setState
  // lands after a microtask (keeps react-hooks/set-state-in-effect
  // quiet without losing the eager-fetch behaviour).
  useEffect(() => {
    if (!accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccounts({})
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [socialRes, meRes] = await Promise.all([
          fetch(`${API_BASE}/social-accounts/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ])
        if (cancelled) return
        if (!socialRes.ok) {
          setAccounts({})
        } else {
          const list = (await socialRes.json()) as ApiSocialAccount[]
          if (cancelled) return
          const indexed: Record<string, ApiSocialAccount> = {}
          for (const a of list) indexed[a.platform] = a
          setAccounts(indexed)
        }
        if (meRes.ok) {
          const me = (await meRes.json()) as {
            email?: string | null
            phone?: string | null
            emailVerifiedAt?: string | null
            phoneVerifiedAt?: string | null
          }
          if (!cancelled) {
            setEmail(me.email ?? null)
            setEmailVerifiedAt(me.emailVerifiedAt ?? null)
            setPhone(me.phone ?? null)
            setPhoneVerifiedAt(me.phoneVerifiedAt ?? null)
          }
        }
      } catch (err) {
        console.error('[social-accounts] fetch failed', err)
        if (!cancelled) setAccounts({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // PATCH /users/me/email — sets or clears the viewer's email. Empty
  // string clears it. Backend lowercases, validates shape + uniqueness.
  const onSaveEmail = async () => {
    if (!accessToken || emailBusy) return
    const trimmed = emailDraft.trim()
    setEmailBusy(true)
    try {
      const res = await fetch(`${API_BASE}/users/me/email`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: trimmed || null }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        const code = (data?.message ?? '').trim()
        if (code === 'email_taken') {
          toast.show(t('social.email_taken'), { tone: 'error' })
        } else {
          toast.show(t('social.email_invalid'), { tone: 'error' })
        }
        return
      }
      const me = (await res.json()) as {
        email?: string | null
        emailVerifiedAt?: string | null
      }
      setEmail(me.email ?? null)
      setEmailVerifiedAt(me.emailVerifiedAt ?? null)
      setEmailEditing(false)
      setEmailDraft('')
      toast.show(t('toast.changes_saved'))
    } catch (err) {
      console.error('[social-accounts] email save failed', err)
      toast.show(t('social.email_invalid'), { tone: 'error' })
    } finally {
      setEmailBusy(false)
    }
  }

  const onRemoveEmail = async () => {
    if (!accessToken || emailBusy) return
    setEmailBusy(true)
    try {
      const res = await fetch(`${API_BASE}/users/me/email`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: null }),
      })
      if (!res.ok) {
        toast.show(t('social.link_failed'), { tone: 'error' })
        return
      }
      setEmail(null)
      setEmailVerifiedAt(null)
      setEmailEditing(false)
      setEmailDraft('')
      toast.show(t('toast.account_unlinked'))
    } catch (err) {
      console.error('[social-accounts] email remove failed', err)
      toast.show(t('social.link_failed'), { tone: 'error' })
    } finally {
      setEmailBusy(false)
    }
  }

  // Helper: normalize the user's typed handle the same way the
  // backend does, so the toast says exactly what the DB stored.
  const cleanHandle = (raw: string) =>
    raw.trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase()

  // POST /social-accounts — manual link a previously empty platform.
  const onLink = async (platformId: string) => {
    if (!accessToken || pending) return
    const handle = cleanHandle(drafts[platformId] ?? '')
    if (!handle) {
      toast.show(t('social.handle_required'), { tone: 'error' })
      return
    }
    setPending(platformId)
    try {
      const res = await fetch(`${API_BASE}/social-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ platform: platformId, handle }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        const code = (data?.message ?? '').trim()
        if (code === 'handle_already_taken') {
          toast.show(t('social.handle_taken'), { tone: 'error' })
        } else if (code === 'account_for_platform_already_linked') {
          toast.show(t('social.already_linked'), { tone: 'error' })
        } else {
          toast.show(t('social.link_failed'), { tone: 'error' })
        }
        return
      }
      const created = (await res.json()) as ApiSocialAccount
      setAccounts((s) => ({ ...(s ?? {}), [platformId]: created }))
      setDrafts((d) => ({ ...d, [platformId]: '' }))
      toast.show(t('toast.account_linked'))
    } catch (err) {
      console.error('[social-accounts] link failed', err)
      toast.show(t('social.link_failed'), { tone: 'error' })
    } finally {
      setPending(null)
    }
  }

  // PATCH /social-accounts/:id — update handle in place.
  const onUpdate = async (platformId: string) => {
    if (!accessToken || pending) return
    const acc = accounts?.[platformId]
    if (!acc) return
    const handle = cleanHandle(drafts[platformId] ?? '')
    if (!handle) {
      toast.show(t('social.handle_required'), { tone: 'error' })
      return
    }
    setPending(platformId)
    try {
      const res = await fetch(`${API_BASE}/social-accounts/${acc.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ handle }),
      })
      if (!res.ok) {
        toast.show(t('social.link_failed'), { tone: 'error' })
        return
      }
      const updated = (await res.json()) as ApiSocialAccount
      setAccounts((s) => ({ ...(s ?? {}), [platformId]: updated }))
      setEditing((e) => ({ ...e, [platformId]: false }))
      toast.show(t('toast.changes_saved'))
    } catch (err) {
      console.error('[social-accounts] update failed', err)
      toast.show(t('social.link_failed'), { tone: 'error' })
    } finally {
      setPending(null)
    }
  }

  // DELETE /social-accounts/:id — unlink.
  const onUnlink = async (platformId: string) => {
    if (!accessToken || pending) return
    const acc = accounts?.[platformId]
    if (!acc) return
    setPending(platformId)
    try {
      const res = await fetch(`${API_BASE}/social-accounts/${acc.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        toast.show(t('social.link_failed'), { tone: 'error' })
        return
      }
      setAccounts((s) => {
        if (!s) return s
        const next = { ...s }
        delete next[platformId]
        return next
      })
      setEditing((e) => ({ ...e, [platformId]: false }))
      setDrafts((d) => ({ ...d, [platformId]: '' }))
      toast.show(t('toast.account_unlinked'))
    } catch (err) {
      console.error('[social-accounts] unlink failed', err)
      toast.show(t('social.link_failed'), { tone: 'error' })
    } finally {
      setPending(null)
    }
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

        {/* Phone contact card (read-only). The primary phone is bound
            to login + OTP-verified at /auth/register, so it ALWAYS
            renders the green Verified chip when present. We don't
            offer in-place editing here; rotating the primary phone is
            an auth-level operation (separate flow with re-OTP), so
            the row links out to /settings if the user needs to change
            anything. */}
        {phone && (
          <div
            className="mt-4 rounded-2xl border p-4 backdrop-blur-md"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
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
                    <path d="M22 16.92V20a2 2 0 01-2.18 2 19.86 19.86 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.86 19.86 0 012.12 4.18 2 2 0 014.11 2h3.08a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className="truncate text-sm font-bold tracking-tight"
                      style={{ color: 'var(--ink)' }}
                    >
                      {t('social.phone_label')}
                    </h3>
                    <VerificationChip
                      level={phoneVerifiedAt ? 'verified' : 'unverified'}
                    />
                  </div>
                  <p
                    className="truncate text-xs"
                    style={{ color: 'var(--muted)' }}
                    dir="ltr"
                  >
                    {phone}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email contact card. Sits above the social-platform list as
            its own discovery / contact method. Email is not in the
            SocialAccount table — it's stored on User.email — so the
            link / unlink flow goes through PATCH /users/me/email. We
            mark it Unverified for now; an email-OTP flow will swap
            this for a real "verified" chip in a future PR. */}
        <div
          className="mt-4 rounded-2xl border p-4 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
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
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    className="truncate text-sm font-bold tracking-tight"
                    style={{ color: 'var(--ink)' }}
                  >
                    {t('social.email_label')}
                  </h3>
                  {/* Verification chip. Reads emailVerifiedAt — null
                      means "not yet OTP-verified" (the only state today;
                      the email-OTP flow lands in a follow-up). The chip
                      shape is already production-ready for the verified
                      state. */}
                  {email && (
                    <VerificationChip
                      level={emailVerifiedAt ? 'verified' : 'unverified'}
                    />
                  )}
                </div>
                {email && !emailEditing ? (
                  <p
                    className="truncate text-xs"
                    style={{ color: 'var(--muted)' }}
                    dir="ltr"
                  >
                    {email}
                  </p>
                ) : (
                  <p
                    className="text-xs"
                    style={{ color: 'var(--muted-2)' }}
                  >
                    {email
                      ? t('social.email_label')
                      : t('social.email_add_prompt')}
                  </p>
                )}
              </div>
            </div>

            {email && !emailEditing && (
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEmailDraft(email)
                    setEmailEditing(true)
                  }}
                  disabled={emailBusy}
                  className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card-soft)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {t('social.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => void onRemoveEmail()}
                  disabled={emailBusy}
                  aria-busy={emailBusy || undefined}
                  className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card-soft)',
                    color: '#D55B6E',
                  }}
                >
                  {emailBusy ? '…' : t('social.remove')}
                </button>
              </div>
            )}
          </div>

          {(!email || emailEditing) && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void onSaveEmail()
              }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder={t('social.email_placeholder')}
                dir="ltr"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="email"
                disabled={emailBusy}
                className="flex-1 min-w-[10rem] rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                }}
              />
              <button
                type="submit"
                disabled={emailBusy || !emailDraft.trim()}
                aria-busy={emailBusy || undefined}
                className="rounded-full px-4 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  boxShadow: 'var(--shadow-soft)',
                  minWidth: '5rem',
                }}
              >
                {emailBusy ? (
                  <span className="qift-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white" />
                ) : email ? (
                  t('social.save')
                ) : (
                  t('social.add')
                )}
              </button>
              {email && emailEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setEmailEditing(false)
                    setEmailDraft('')
                  }}
                  disabled={emailBusy}
                  className="rounded-full border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card-soft)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {t('social.cancel')}
                </button>
              )}
            </form>
          )}
        </div>

        <ul className="mt-4 flex flex-col gap-2.5">
          {PLATFORMS.map((p) => {
            const acc = accounts?.[p.id]
            const isLinked = !!acc
            const isEditing = !!editing[p.id]
            const isBusy = pending === p.id
            // The input is shared between Add (unlinked) and Edit (linked
            // → editing). Backend normalizes; we just forward the raw
            // value, but show a leading "@" for the user's reading
            // comfort when not editing.
            const draft = drafts[p.id] ?? ''

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
                        {/* Tri-state verification chip. Reads
                            verificationLevel from the row; falls back
                            to the legacy `verified` boolean for older
                            API builds. Manual links land at
                            'unverified'; OAuth integrations will set
                            'oauth_verified' once wired in. */}
                        {isLinked && (
                          <VerificationChip
                            level={
                              acc.verificationLevel ??
                              (acc.verified ? 'verified' : 'unverified')
                            }
                          />
                        )}
                      </div>
                      {isLinked && !isEditing ? (
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
                          {isLinked
                            ? t('social.handle_label')
                            : t('social.add_prompt')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right-side action buttons. Compact vs expanded
                      based on linked / editing state. */}
                  {isLinked && !isEditing ? (
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setDrafts((d) => ({ ...d, [p.id]: acc.handle }))
                          setEditing((e) => ({ ...e, [p.id]: true }))
                        }}
                        disabled={pending !== null}
                        className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: 'var(--border)',
                          background: 'var(--card-soft)',
                          color: 'var(--text-soft)',
                        }}
                      >
                        {t('social.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onUnlink(p.id)}
                        disabled={pending !== null}
                        aria-busy={isBusy || undefined}
                        className="rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: 'var(--border)',
                          background: 'var(--card-soft)',
                          color: '#D55B6E',
                        }}
                      >
                        {isBusy ? '…' : t('social.remove')}
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Form row: shown when editing OR when not yet linked. */}
                {(!isLinked || isEditing) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void (isLinked ? onUpdate(p.id) : onLink(p.id))
                    }}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <div
                      className="flex flex-1 items-center overflow-hidden rounded-xl border min-w-[10rem]"
                      style={{
                        borderColor: 'var(--border)',
                        background: 'var(--surface-2)',
                      }}
                    >
                      <span
                        aria-hidden
                        className="ps-3 pe-1 text-sm"
                        style={{ color: 'var(--muted)' }}
                      >
                        @
                      </span>
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [p.id]: e.target.value,
                          }))
                        }
                        placeholder={t('social.add_placeholder')}
                        dir="ltr"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                        disabled={isBusy}
                        className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none disabled:opacity-60"
                        style={{ color: 'var(--text)' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isBusy || !draft.trim()}
                      aria-busy={isBusy || undefined}
                      className="rounded-full px-4 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                        boxShadow: 'var(--shadow-soft)',
                        minWidth: '5rem',
                      }}
                    >
                      {isBusy ? (
                        <span
                          className="qift-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white"
                        />
                      ) : isLinked ? (
                        t('social.save')
                      ) : (
                        t('social.add')
                      )}
                    </button>
                    {isLinked && isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing((e) => ({ ...e, [p.id]: false }))
                          setDrafts((d) => ({ ...d, [p.id]: '' }))
                        }}
                        disabled={isBusy}
                        className="rounded-full border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: 'var(--border)',
                          background: 'var(--card-soft)',
                          color: 'var(--text-soft)',
                        }}
                      >
                        {t('social.cancel')}
                      </button>
                    )}
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </PageContainer>
  )
}

// Tri-state verification chip used on every contact / linked-account
// row. The "verified" and "oauth_verified" states share a green tint
// — both mean the platform has a real proof of ownership; the OAuth
// label is just more specific. "unverified" is muted so the eye reads
// it as missing-something, not as an alarm.
function VerificationChip({ level }: { level: VerificationLevel }) {
  const { t } = useI18n()
  if (level === 'verified' || level === 'oauth_verified') {
    return (
      <span
        aria-label={t('social.verified')}
        className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold"
        style={{
          borderColor: 'color-mix(in srgb, #2F7F50 50%, transparent)',
          background: 'color-mix(in srgb, #2F7F50 10%, var(--surface-2))',
          color: '#2F7F50',
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-2.5 w-2.5"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
        {level === 'oauth_verified'
          ? t('social.oauth_verified')
          : t('social.verified')}
      </span>
    )
  }
  return (
    <span
      aria-label={t('social.unverified')}
      className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-medium"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface-2)',
        color: 'var(--muted)',
      }}
    >
      {t('social.unverified')}
    </span>
  )
}
