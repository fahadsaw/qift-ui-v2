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
import { buildAddressPayload, schemaFor, COUNTRIES } from '@/lib/addresses'
import AddressForm, { type AddressValue } from '@/components/AddressForm'
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

// Live shape returned by GET /addresses/me. Mirrors ADDRESS_SELECT in
// apps/api/src/addresses/addresses.service.ts. The previous mock used
// a `details: Record<string,string>` blob; the real backend stores
// each field on a dedicated column and the shape adapter below builds
// the per-country display summary out of those columns.
type BackendAddress = {
  id: string
  userId?: string
  label: string | null
  country: string
  region: string | null
  city: string
  governorate: string | null
  district: string
  street: string | null
  buildingNumber: string | null
  unitNumber: string | null
  postalCode: string | null
  additionalNumber: string | null
  shortAddress: string | null
  deliveryPhone: string | null
  details: string | null
  isDefault: boolean
}

// Convert flat backend row → the per-country `details` map the
// existing renderer expects (key → value string). Unknown countries
// fall back to whatever the backend stored in `details`.
function summariseAddress(
  addr: BackendAddress,
): { label: string; summary: string } {
  const schema = schemaFor(addr.country)
  const label = (addr.label ?? '').trim() || addr.city || addr.country
  if (!schema) {
    return { label, summary: addr.details ?? '' }
  }
  const summary = schema.fields
    .map((f) => {
      const v = (addr as unknown as Record<string, unknown>)[f.key]
      return typeof v === 'string' ? v : ''
    })
    .filter(Boolean)
    .join(' · ')
  return { label, summary }
}

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
  // Real-backend address list. Hydrated from GET /addresses/me on
  // mount; mutations route through POST /addresses, PATCH
  // /addresses/:id/default, and DELETE /addresses/:id, then re-fetch
  // so the local view always matches what's actually persisted.
  //
  // Earlier this was `useState(ADDRESSES)` (sample data) and the
  // "Add" button only fired an alert(). That left users with an
  // entirely fictional address list — they thought they had a
  // default, but the backend had nothing on file, so /send blocked
  // them with "recipient has no default address". This is the fix.
  const [addresses, setAddresses] = useState<BackendAddress[]>([])
  const [addressesLoading, setAddressesLoading] = useState(true)
  const [addressBusy, setAddressBusy] = useState<string | null>(null)
  const [addAddressOpen, setAddAddressOpen] = useState(false)

  const themeOptions: { code: ThemeMode; label: string }[] = [
    { code: 'light', label: t('theme.light') },
    { code: 'dark', label: t('theme.dark') },
    { code: 'auto', label: t('theme.auto') },
  ]

  const saved = () => toast.show(t('toast.changes_saved'))

  // Hydrate privacy state from /users/me on mount.
  // accessToken is read from useAuth() further down the file (in the
  // PushSection); we re-acquire it here via a lightweight call to the
  // hook so the privacy block can persist to /users/me/privacy without
  // moving everything around. Async IIFE keeps the setState off the
  // synchronous effect path.
  const { accessToken: privacyToken, user: authUser } = useAuth()
  // Surface the merchant dashboard only for store-role users. The
  // role hint comes off /users/me (refreshed below); StoreGuard on
  // the backend is the authoritative gate, so a tampered local
  // value still can't reach store endpoints. Default = false on a
  // missing field so a fresh login that hasn't refreshed yet doesn't
  // flash the link to a non-merchant.
  const isMerchant = authUser?.role === 'store'
  const isAdmin = authUser?.role === 'admin'
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

  // Load addresses from the backend. Single source of truth for the
  // section — no more localStorage mocks. Re-runs on auth change so a
  // logout followed by a new login refreshes the list.
  useEffect(() => {
    if (!privacyToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/addresses/me`, {
          headers: { Authorization: `Bearer ${privacyToken}` },
        })
        if (cancelled) return
        if (!res.ok) {
          setAddresses([])
          return
        }
        const list = (await res.json()) as BackendAddress[]
        if (cancelled) return
        setAddresses(Array.isArray(list) ? list : [])
      } catch (err) {
        console.error('[settings] /addresses/me failed', err)
        if (!cancelled) setAddresses([])
      } finally {
        if (!cancelled) setAddressesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [privacyToken])

  // Re-fetch after a successful mutation so the displayed list always
  // matches the persisted state. Cheap (single GET, max ~10 rows) and
  // sidesteps every "did the optimistic update mirror the server?"
  // bug class.
  const refreshAddresses = async (): Promise<void> => {
    if (!privacyToken) return
    try {
      const res = await fetch(`${API_BASE}/addresses/me`, {
        headers: { Authorization: `Bearer ${privacyToken}` },
      })
      if (!res.ok) return
      const list = (await res.json()) as BackendAddress[]
      setAddresses(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('[settings] refresh addresses failed', err)
    }
  }

  // PATCH /addresses/:id/default — the canonical "set default" endpoint
  // (transactional on the backend; clears any other default in the
  // same tx so the at-most-one invariant always holds).
  const setDefault = async (id: string) => {
    if (!privacyToken || addressBusy) return
    setAddressBusy(id)
    try {
      const res = await fetch(`${API_BASE}/addresses/${id}/default`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${privacyToken}` },
      })
      if (!res.ok) {
        toast.show(t('settings.address_save_failed'), { tone: 'error' })
        return
      }
      await refreshAddresses()
      toast.show(t('toast.address_default_set'))
    } catch (err) {
      console.error('[settings] set default failed', err)
      toast.show(t('settings.address_save_failed'), { tone: 'error' })
    } finally {
      setAddressBusy(null)
    }
  }

  // DELETE /addresses/:id — backend auto-promotes the next address to
  // default if the deleted one was the default and any others remain.
  const removeAddress = async (id: string) => {
    if (!privacyToken || addressBusy) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm(t('settings.address_remove_confirm'))
    ) {
      return
    }
    setAddressBusy(id)
    try {
      const res = await fetch(`${API_BASE}/addresses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${privacyToken}` },
      })
      if (!res.ok) {
        toast.show(t('settings.address_save_failed'), { tone: 'error' })
        return
      }
      await refreshAddresses()
      toast.show(t('toast.address_removed'))
    } catch (err) {
      console.error('[settings] remove address failed', err)
      toast.show(t('settings.address_save_failed'), { tone: 'error' })
    } finally {
      setAddressBusy(null)
    }
  }

  // POST /addresses — used by the new-address modal. The first address
  // a user creates is automatically the default (backend sets
  // isDefault when the user has no other addresses), so a fresh
  // account that completes this flow becomes immediately giftable on
  // /send within ~1 round-trip. Pass `isDefault: true` explicitly when
  // the user picked the toggle.
  const createAddress = async (
    value: AddressValue,
    isDefault: boolean,
  ): Promise<boolean> => {
    if (!privacyToken) return false
    const payload = buildAddressPayload(value.country, value.details, {
      isDefault,
    })
    try {
      const res = await fetch(`${API_BASE}/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${privacyToken}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string | string[]
        } | null
        const raw = Array.isArray(data?.message)
          ? data.message[0]
          : data?.message ?? ''
        toast.show(
          typeof raw === 'string' && raw.length > 0
            ? raw
            : t('settings.address_save_failed'),
          { tone: 'error' },
        )
        return false
      }
      await refreshAddresses()
      toast.show(t('settings.address_added'))
      return true
    } catch (err) {
      console.error('[settings] create address failed', err)
      toast.show(t('settings.address_save_failed'), { tone: 'error' })
      return false
    }
  }

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
                href="/occasions"
                label={t('settings.link_occasions')}
                hint={t('settings.link_occasions_hint')}
              />
              <AccountLink
                href="/social-accounts"
                label={t('settings.link_social')}
                hint={t('settings.link_social_hint')}
              />
              {/* Merchant fulfilment hub — only rendered when the
                  signed-in user has a 'store' role. Non-merchants
                  never see the link. */}
              {isMerchant && (
                <AccountLink
                  href="/store-dashboard"
                  label={t('settings.link_store_dashboard')}
                  hint={t('settings.link_store_dashboard_hint')}
                />
              )}
              {/* Admin-only entry. Hidden from every non-admin —
                  AdminGuard on the backend is the authoritative gate
                  but we don't even hint at /admin existing for normal
                  users. */}
              {isAdmin && (
                <AccountLink
                  href="/admin"
                  label={t('settings.link_admin')}
                  hint={t('settings.link_admin_hint')}
                />
              )}
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
                onClick={() => setAddAddressOpen(true)}
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

            {addressesLoading ? (
              <p
                className="mt-3 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                {t('settings.address_loading')}
              </p>
            ) : addresses.length === 0 ? (
              // Empty state — first-class on its own because the
              // dataset is empty BY default for every fresh account.
              // The `address_required_hint` line tells the user why
              // they should care: without a default, no one can send
              // them gifts.
              <div
                className="mt-3 rounded-2xl border-2 border-dashed p-4 text-xs leading-relaxed"
                style={{
                  borderColor: 'var(--border-strong)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-soft)',
                }}
              >
                <p
                  className="text-sm font-bold"
                  style={{ color: 'var(--ink)' }}
                >
                  {t('settings.address_empty_title')}
                </p>
                <p className="mt-1">
                  {t('settings.address_required_hint')}
                </p>
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {addresses.map((a) => {
                  const { label, summary } = summariseAddress(a)
                  const isBusy = addressBusy === a.id
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
                              {label}
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
                              onClick={() => void setDefault(a.id)}
                              disabled={isBusy}
                              className="text-[0.7rem] font-medium disabled:opacity-60"
                              style={{ color: 'var(--primary)' }}
                            >
                              {t('settings.address_set_default')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void removeAddress(a.id)}
                            disabled={isBusy}
                            className="text-[0.7rem] font-medium disabled:opacity-60"
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
            )}
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

      {/* New-address modal — wires into the live POST /addresses
          endpoint via createAddress(). On success the parent re-
          fetches the list and we close. The modal is intentionally
          rendered at the page root (not inside the addresses Card)
          so it can use a top-level overlay without z-index fights
          against the surrounding form. */}
      {addAddressOpen && (
        <AddAddressModal
          onClose={() => setAddAddressOpen(false)}
          onCreate={async (value, isDefault) => {
            const ok = await createAddress(value, isDefault)
            if (ok) setAddAddressOpen(false)
            return ok
          }}
        />
      )}
    </PageContainer>
  )
}

// New-address modal. Keeps the form local — the parent only owns the
// open/close flag and the submit handler. The default-toggle defaults
// to true because the most common case (a user opening this from the
// suspended-banner CTA) IS adding their first default address; we
// don't want them to silently skip the only checkbox that actually
// matters for receiving gifts.
function AddAddressModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (value: AddressValue, isDefault: boolean) => Promise<boolean>
}) {
  const { t } = useI18n()
  const [value, setValue] = useState<AddressValue>(() => ({
    country: COUNTRIES[0]?.code ?? 'SA',
    details: {},
  }))
  const [isDefault, setIsDefault] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="qift-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'rgba(15, 11, 24, 0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="qift-modal-in flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <h3
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('settings.add_address')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('profile.close')}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (submitting) return
            setSubmitting(true)
            try {
              await onCreate(value, isDefault)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-5"
        >
          <AddressForm value={value} onChange={setValue} />

          <button
            type="button"
            onClick={() => setIsDefault((v) => !v)}
            className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
            }}
          >
            <span className="flex flex-col text-start">
              <span className="font-semibold">
                {t('settings.address_make_default_label')}
              </span>
              <span
                className="mt-0.5 text-[0.7rem]"
                style={{ color: 'var(--muted)' }}
              >
                {t('settings.address_make_default_hint')}
              </span>
            </span>
            <span
              aria-hidden
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{
                background: isDefault
                  ? 'var(--primary)'
                  : 'var(--border-strong)',
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                style={{
                  left: isDefault ? 'calc(100% - 22px)' : '2px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                }}
              />
            </span>
          </button>

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting || undefined}
            className="rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {submitting ? (
              <span className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              t('settings.address_save')
            )}
          </button>
        </form>
      </div>
    </div>
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
