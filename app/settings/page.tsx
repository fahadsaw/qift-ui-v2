'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { clearAuth, useAuth } from '@/lib/auth'
import { API_BASE } from '@/lib/apiBase'
import { LANGUAGES, type Lang } from '@/lib/translations'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { ADDRESSES, PROFILE } from '@/lib/sampleData'
import { schemaFor } from '@/lib/addresses'
import {
  isPushSupported,
  readPushStatus,
  subscribePush,
  unsubscribePush,
  type PushState,
} from '@/lib/push'

// Two-state visibility — matches the backend's User.profileVisibility
// schema. The earlier 'followers' option was a UI fiction; the backend
// has no followers-only mode and the public-profile route only knows
// public vs private, so the option list is constrained to those.
type Privacy = 'public' | 'private'

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const { mode, setMode } = useTheme()
  const toast = useToast()
  const router = useRouter()
  // Privacy state is hydrated from /users/me on mount and persisted
  // via PATCH /users/me/privacy. Local state covers the in-flight
  // optimistic update; rolled back on backend rejection.
  const [privacy, setPrivacy] = useState<Privacy>('public')
  const [showFollowers, setShowFollowers] = useState(true)
  const [showFollowing, setShowFollowing] = useState(true)
  const [showGiftsReceived, setShowGiftsReceived] = useState(true)
  const [showGiftsSent, setShowGiftsSent] = useState(true)
  const [notify, setNotify] = useState({
    new_gift: true,
    friend_activity: true,
    promotions: false,
  })
  const [addresses, setAddresses] = useState(ADDRESSES)

  const themeOptions: { code: ThemeMode; label: string }[] = [
    { code: 'light', label: t('theme.light') },
    { code: 'dark', label: t('theme.dark') },
    { code: 'auto', label: t('theme.auto') },
  ]

  const setDefault = (id: string) => {
    setAddresses((list) =>
      list.map((a) => ({ ...a, isDefault: a.id === id })),
    )
    toast.show(t('toast.address_default_set'))
  }
  const removeAddress = (id: string) => {
    setAddresses((list) => list.filter((a) => a.id !== id))
    toast.show(t('toast.address_removed'))
  }
  const saved = () => toast.show(t('toast.changes_saved'))

  // Hydrate privacy state from /users/me on mount.
  // accessToken is read from useAuth() further down the file (in the
  // PushSection); we re-acquire it here via a lightweight call to the
  // hook so the privacy block can persist to /users/me/privacy without
  // moving everything around. Async IIFE keeps the setState off the
  // synchronous effect path.
  const { accessToken: privacyToken } = useAuth()
  useEffect(() => {
    if (!privacyToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${privacyToken}` },
        })
        if (cancelled || !res.ok) return
        const data = (await res.json()) as {
          profileVisibility?: string
          showGiftsReceived?: boolean
          showGiftsSent?: boolean
          showFollowers?: boolean
          showFollowing?: boolean
        }
        if (cancelled) return
        if (data.profileVisibility === 'private') setPrivacy('private')
        else setPrivacy('public')
        if (typeof data.showGiftsReceived === 'boolean')
          setShowGiftsReceived(data.showGiftsReceived)
        if (typeof data.showGiftsSent === 'boolean')
          setShowGiftsSent(data.showGiftsSent)
        if (typeof data.showFollowers === 'boolean')
          setShowFollowers(data.showFollowers)
        if (typeof data.showFollowing === 'boolean')
          setShowFollowing(data.showFollowing)
      } catch {
        // Silent — settings stay at their initial defaults; the next
        // PATCH writes them through.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [privacyToken])

  // Persist a partial privacy update. Optimistic — caller has already
  // flipped local state. Rolls back via toast on failure.
  const patchPrivacy = async (
    patch: {
      profileVisibility?: string
      showGiftsReceived?: boolean
      showGiftsSent?: boolean
      showFollowers?: boolean
      showFollowing?: boolean
    },
  ) => {
    if (!privacyToken) return
    try {
      const res = await fetch(`${API_BASE}/users/me/privacy`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${privacyToken}`,
        },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        toast.show(t('register.error_toast'), { tone: 'error' })
        return
      }
      saved()
    } catch {
      toast.show(t('register.error_toast'), { tone: 'error' })
    }
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('settings.badge')}</Badge>}
          line1={t('settings.title_1')}
          gradient={t('settings.title_2')}
          subtitle={t('settings.subtitle')}
          size="sm"
        />

        <div className="mt-7 flex flex-col gap-4">
          <Card>
            <SectionTitle>{t('settings.section_general')}</SectionTitle>

            <div className="mt-4">
              <Label>{t('language.label')}</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {LANGUAGES.map((l) => {
                  const active = l.code === lang
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setLang(l.code as Lang)
                        saved()
                      }}
                      className="rounded-full border px-3.5 py-1.5 text-xs"
                      style={pillStyle(active)}
                    >
                      {l.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5">
              <Label>{t('theme.label')}</Label>
              <div className="mt-2 flex gap-2">
                {themeOptions.map((opt) => {
                  const active = mode === opt.code
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => {
                        setMode(opt.code)
                        saved()
                      }}
                      className="flex-1 rounded-xl border px-3 py-2 text-sm"
                      style={pillStyle(active)}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* Account hub. Surfaces every per-account sub-page in one
              place — without this, /preferences had no entry point in
              the UI (you could only reach it by typing the URL) and
              /wishlist was only linked from the profile-tab footer.
              Single-row links keep the section compact while still
              giving every page real billboard space. */}
          <Card>
            <SectionTitle>{t('settings.section_account')}</SectionTitle>
            <ul className="mt-3 flex flex-col gap-1.5">
              <AccountLink
                href="/preferences"
                label={t('settings.link_preferences')}
                hint={t('settings.link_preferences_hint')}
              />
              <AccountLink
                href="/wishlist"
                label={t('settings.link_wishlist')}
                hint={t('settings.link_wishlist_hint')}
              />
              <AccountLink
                href="/social-accounts"
                label={t('settings.link_social')}
                hint={t('settings.link_social_hint')}
              />
            </ul>
          </Card>

          <PushSection />

          <Card>
            <SectionTitle>{t('settings.section_privacy')}</SectionTitle>
            <div className="mt-3">
              <Label>{t('settings.privacy_label')}</Label>
              <div className="mt-2 flex flex-col gap-2">
                {(['public', 'private'] as Privacy[]).map((p) => {
                  const active = privacy === p
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        // Optimistic. patchPrivacy() handles rollback
                        // toast on failure.
                        setPrivacy(p)
                        void patchPrivacy({ profileVisibility: p })
                      }}
                      className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-all"
                      style={pillStyle(active, true)}
                    >
                      <span style={{ fontWeight: active ? 600 : 500 }}>
                        {t(`profile.privacy_${p}`)}
                      </span>
                      {active && (
                        <span
                          aria-hidden
                          className="flex h-5 w-5 items-center justify-center rounded-full text-xs"
                          style={{
                            background: 'var(--primary)',
                            color: '#fff',
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <ToggleRow
                label={t('settings.privacy_show_followers')}
                on={showFollowers}
                onChange={() => {
                  const next = !showFollowers
                  setShowFollowers(next)
                  void patchPrivacy({ showFollowers: next })
                }}
              />
              <ToggleRow
                label={t('settings.privacy_show_following')}
                on={showFollowing}
                onChange={() => {
                  const next = !showFollowing
                  setShowFollowing(next)
                  void patchPrivacy({ showFollowing: next })
                }}
              />
              <ToggleRow
                label={t('settings.privacy_show_gifts_received')}
                on={showGiftsReceived}
                onChange={() => {
                  const next = !showGiftsReceived
                  setShowGiftsReceived(next)
                  void patchPrivacy({ showGiftsReceived: next })
                }}
              />
              <ToggleRow
                label={t('settings.privacy_show_gifts_sent')}
                on={showGiftsSent}
                onChange={() => {
                  const next = !showGiftsSent
                  setShowGiftsSent(next)
                  void patchPrivacy({ showGiftsSent: next })
                }}
              />
            </div>
          </Card>

          <Card>
            <SectionTitle>{t('settings.section_notifications')}</SectionTitle>
            <div className="mt-3 flex flex-col gap-2">
              {(
                [
                  { key: 'new_gift', tKey: 'settings.notify_new_gift' },
                  { key: 'friend_activity', tKey: 'settings.notify_friend_activity' },
                  { key: 'promotions', tKey: 'settings.notify_promotions' },
                ] as const
              ).map((n) => (
                <ToggleRow
                  key={n.key}
                  label={t(n.tKey)}
                  on={notify[n.key]}
                  onChange={() => {
                    setNotify((s) => ({ ...s, [n.key]: !s[n.key] }))
                    saved()
                  }}
                />
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>{t('settings.section_addresses')}</SectionTitle>
              <button
                type="button"
                onClick={() => alert(t('settings.add_address'))}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: 'transparent',
                  color: '#fff',
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                + {t('settings.add_address')}
              </button>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {addresses.map((a) => {
                const schema = schemaFor(a.country)
                const summary = schema?.fields
                  .map((f) => a.details[f.key])
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li
                    key={a.id}
                    className="rounded-2xl border p-3.5 backdrop-blur-md"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-bold"
                            style={{ color: 'var(--ink)' }}
                          >
                            {a.label}
                          </span>
                          {a.isDefault && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
                              style={{
                                background: 'var(--ring)',
                                color: 'var(--primary)',
                              }}
                            >
                              {t('settings.address_default')}
                            </span>
                          )}
                        </div>
                        <p
                          className="mt-1 text-xs leading-relaxed"
                          style={{ color: 'var(--muted)' }}
                        >
                          {summary}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!a.isDefault && (
                          <button
                            type="button"
                            onClick={() => setDefault(a.id)}
                            className="text-[0.7rem] font-medium"
                            style={{ color: 'var(--primary)' }}
                          >
                            {t('settings.address_set_default')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAddress(a.id)}
                          className="text-[0.7rem] font-medium"
                          style={{ color: '#D55B6E' }}
                        >
                          {t('settings.address_remove')}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          <button
            type="button"
            onClick={() => {
              clearAuth()
              toast.show(t('toast.logged_out'))
              router.push('/login')
            }}
            className="mt-2 inline-flex items-center justify-center rounded-2xl border px-6 py-3 text-sm font-medium transition-colors hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              color: '#D55B6E',
            }}
          >
            {t('settings.logout')}
          </button>
        </div>
      </section>
    </PageContainer>
  )
}

// --- Push notifications card ---

function PushSection() {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()
  const [state, setState] = useState<PushState>('disabled')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const status = await readPushStatus(accessToken)
    setState(status.state)
    setEndpoint(status.endpoint)
  }

  // Initial state probe — runs once on mount and again whenever the
  // auth token changes (sign-in / sign-out from another tab).
  useEffect(() => {
    if (!isAuthenticated) {
      // Resetting state inside an effect is the right pattern here —
      // we're synchronising the card to an external store (auth +
      // browser permission). The lint rule warns about cascading
      // renders, which doesn't apply since this branch only fires on
      // auth transitions.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(isPushSupported() ? 'disabled' : 'unsupported')
      setEndpoint(null)
      return
    }
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isAuthenticated])

  const onSubscribe = async () => {
    if (!accessToken || busy) return
    setBusy(true)
    try {
      const ep = await subscribePush(accessToken)
      setState('enabled')
      setEndpoint(ep)
      toast.show(t('push.subscribed_toast'))
    } catch (err) {
      const code = (err as { code?: string }).code
      // Map every failure mode onto a translated, actionable toast.
      const key =
        code === 'denied'
          ? 'push.denied_toast'
          : code === 'unsupported'
            ? 'push.unsupported_toast'
            : code === 'no-vapid'
              ? 'push.no_vapid_toast'
              : 'push.subscribe_failed_toast'
      toast.show(t(key), { tone: 'error' })
      // Pull a fresh status so the UI matches whatever state the
      // browser ended up in (e.g. denied means we should now render
      // the denied card, not stay on "disabled").
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const onUnsubscribe = async () => {
    if (!accessToken || busy) return
    setBusy(true)
    try {
      await unsubscribePush(accessToken, endpoint)
      setState('disabled')
      setEndpoint(null)
      toast.show(t('push.unsubscribed_toast'))
    } catch {
      toast.show(t('push.unsubscribe_failed_toast'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const labelKey: Record<PushState, string> = {
    enabled: 'push.state_enabled',
    disabled: 'push.state_disabled',
    denied: 'push.state_denied',
    unsupported: 'push.state_unsupported',
    'no-vapid': 'push.state_no_vapid',
  }
  const dotColor: Record<PushState, string> = {
    enabled: '#3FA46A',
    disabled: 'var(--muted)',
    denied: '#D55B6E',
    unsupported: 'var(--muted)',
    'no-vapid': '#E89B3A',
  }

  // Per-state explainer line — gives the user a reason for the current
  // state and (when relevant) what they need to do next.
  const helpKey: Record<PushState, string | null> = {
    enabled: 'push.help_enabled',
    disabled: 'push.help_disabled',
    denied: 'push.help_denied',
    unsupported: 'push.help_unsupported',
    'no-vapid': 'push.help_no_vapid',
  }

  // The "enable" button is only actionable when the browser is in the
  // `disabled` state (i.e. supports push, isn't blocked, and we don't
  // already have a subscription). For every other state we still
  // render the button so the user has a clear locus, but it's disabled
  // and the help text above explains why.
  const subscribeEnabled = isAuthenticated && !busy && state === 'disabled'
  const showSubscribe = state !== 'enabled'
  const showUnsubscribe = state === 'enabled'

  return (
    <Card>
      <SectionTitle>{t('push.section_title')}</SectionTitle>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 text-[0.78rem] font-medium"
          style={{ color: 'var(--text-soft)' }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: dotColor[state] }}
          />
          {t(labelKey[state])}
        </span>
      </div>

      {helpKey[state] && (
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {t(helpKey[state]!)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {showSubscribe && (
          <button
            type="button"
            onClick={() => void onSubscribe()}
            disabled={!subscribeEnabled}
            className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {busy ? (
              <span className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              t('push.enable_button')
            )}
          </button>
        )}
        {showUnsubscribe && (
          <button
            type="button"
            onClick={() => void onUnsubscribe()}
            disabled={busy}
            className="rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            {busy ? (
              <span className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-[var(--border-strong)] border-t-[var(--text-soft)]" />
            ) : (
              t('push.disable_button')
            )}
          </button>
        )}
      </div>
    </Card>
  )
}

function pillStyle(active: boolean, block = false): React.CSSProperties {
  return {
    borderColor: active
      ? 'var(--input-border-focus)'
      : 'var(--border)',
    background: active ? 'var(--ring)' : 'var(--card-soft)',
    color: active ? 'var(--ink)' : 'var(--text-soft)',
    fontWeight: active ? 600 : 500,
    width: block ? '100%' : undefined,
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-sm font-bold tracking-tight"
      style={{ color: 'var(--ink)' }}
    >
      {children}
    </h2>
  )
}

// One row in the Account hub. Renders as a horizontal list item with
// label + 1-line hint + a chevron — matches the existing rhythm of
// the privacy/notifications cards on this page.
function AccountLink({
  href,
  label,
  hint,
}: {
  href: string
  label: string
  hint: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:-translate-y-0.5 active:scale-[0.99]"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
        }}
      >
        <span className="flex min-w-0 flex-col">
          <span
            className="truncate text-sm font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            {label}
          </span>
          <span
            className="mt-0.5 truncate text-[0.7rem]"
            style={{ color: 'var(--muted)' }}
          >
            {hint}
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--muted)' }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>
    </li>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block text-xs font-semibold tracking-[0.2em]"
      style={{ color: 'var(--text-soft)' }}
    >
      {children}
    </span>
  )
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface-2)',
        color: 'var(--text)',
      }}
    >
      <span className="font-medium">{label}</span>
      <span
        aria-hidden
        className="relative h-6 w-11 rounded-full transition-colors"
        style={{
          background: on ? 'var(--primary)' : 'var(--border-strong)',
        }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{
            left: on ? 'calc(100% - 22px)' : '2px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        />
      </span>
    </button>
  )
}
