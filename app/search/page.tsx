'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { SITE_ORIGIN } from '@/lib/siteOrigin'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  DIAL_COUNTRIES,
  composeE164,
  dialCountryFor,
  sanitizeLocalDigits,
  validatePhoneShape,
} from '@/lib/dialCodes'

// Real backend search row. Mirrors UsersService.searchUsers's projection.
// `matchedField` keeps the same string keys the i18n table already has
// labels for (qift / snapchat / tiktok / instagram / phone / email),
// so the existing FIELD_LABELS lookup keeps working unchanged.
type SearchResult = {
  id: string
  qiftUsername: string
  fullName: string | null
  avatarUrl: string | null
  matchedField:
    | 'qift'
    | 'snapchat'
    | 'tiktok'
    | 'instagram'
    | 'x'
    | 'facebook'
    | 'youtube'
    | 'threads'
    | 'telegram'
    | 'phone'
    | 'email'
  matchedValue: string
}

type SearchType =
  | 'qift'
  | 'snapchat'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'youtube'
  | 'threads'
  | 'telegram'
  | 'phone'
  | 'email'

const TYPES: { id: SearchType; labelKey: string; phKey: string }[] = [
  { id: 'qift', labelKey: 'search.field_qift', phKey: 'search.ph_qift' },
  { id: 'snapchat', labelKey: 'search.field_snapchat', phKey: 'search.ph_snapchat' },
  { id: 'tiktok', labelKey: 'search.field_tiktok', phKey: 'search.ph_tiktok' },
  { id: 'instagram', labelKey: 'search.field_instagram', phKey: 'search.ph_instagram' },
  { id: 'x', labelKey: 'search.field_x', phKey: 'search.ph_x' },
  { id: 'facebook', labelKey: 'search.field_facebook', phKey: 'search.ph_facebook' },
  { id: 'youtube', labelKey: 'search.field_youtube', phKey: 'search.ph_youtube' },
  { id: 'threads', labelKey: 'search.field_threads', phKey: 'search.ph_threads' },
  { id: 'telegram', labelKey: 'search.field_telegram', phKey: 'search.ph_telegram' },
  { id: 'phone', labelKey: 'search.field_phone', phKey: 'search.ph_phone' },
  { id: 'email', labelKey: 'search.field_email', phKey: 'search.ph_email' },
]

const FIELD_LABELS: Record<SearchResult['matchedField'], string> = {
  qift: 'search.field_qift',
  snapchat: 'search.field_snapchat',
  tiktok: 'search.field_tiktok',
  instagram: 'search.field_instagram',
  x: 'search.field_x',
  facebook: 'search.field_facebook',
  youtube: 'search.field_youtube',
  threads: 'search.field_threads',
  telegram: 'search.field_telegram',
  phone: 'search.field_phone',
  email: 'search.field_email',
}

export default function SearchPage() {
  const { t } = useI18n()
  const toast = useToast()
  const ready = useSimulatedReady(450)
  const { accessToken, userId } = useAuth()
  const [type, setType] = useState<SearchType>('qift')
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  // Phone-search-specific state. The dial picker lives next to a
  // local-digit input; we only POST after the user explicitly clicks
  // Search (or presses Enter) AND the local digits pass the per-
  // country shape validator. Auto-search-while-typing is the privacy
  // hole this whole batch is fixing — it let an attacker enumerate
  // accounts by watching matches show up character-by-character.
  const [phoneDial, setPhoneDial] = useState<string>('SA')
  const [phoneLocal, setPhoneLocal] = useState('')
  // `phoneTouched` flips after the first failed Search; that's the
  // signal to start showing inline validation copy. Without it, an
  // empty form on first paint would shout "enter a phone number" at
  // a user who hasn't even tried yet.
  const [phoneTouched, setPhoneTouched] = useState(false)
  // Set of user-ids the viewer is currently following. Loaded once on
  // mount via /users/:viewerId/following so the per-row Follow button
  // can render the right initial state. Mutated optimistically on
  // click (then rolled back on backend rejection).
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [followBusy, setFollowBusy] = useState<string | null>(null)

  const activeType = TYPES.find((x) => x.id === type)!

  // Reset state when the user switches search type — otherwise stale
  // results from a previous tab can flash for a frame on the new tab.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResults([])
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhoneTouched(false)
  }, [type])

  // Phone-input shape validator (per-country). Wraps the registration
  // helper so we share one source of truth. Returns null when the
  // local part is a complete mobile number for the chosen country.
  const phoneShapeError = validatePhoneShape(phoneDial, phoneLocal)
  const phoneCountry = dialCountryFor(phoneDial)
  // E.164 candidate built from dial + local — sent to the backend as
  // `q` once the user clicks Search. composeE164 already strips
  // leading zeros + non-digits, so a user who types `0501234567`
  // submits `+966501234567`.
  const phoneE164 = composeE164(phoneCountry.dial, phoneLocal)

  // Imperative search — only fires when called. The phone branch is
  // never wired to the input's onChange, so typing alone never hits
  // the network. Username + social branches keep the debounced
  // useEffect below.
  const runSearch = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!accessToken) {
        setResults([])
        return
      }
      setSearching(true)
      try {
        const url = new URL(`${API_BASE}/users/search`)
        url.searchParams.set('type', type)
        if (type === 'phone') {
          // Send dial code as a separate param so the backend can
          // compose the E.164 itself + run its country-aware
          // completeness check. We pass `q` as the local digits
          // (already typed by the user) for compatibility — the
          // backend's resolvePhoneE164 handles either form.
          url.searchParams.set('q', phoneLocal)
          url.searchParams.set('dial', phoneCountry.dial)
        } else {
          url.searchParams.set('q', q.trim())
        }
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        })
        if (signal?.aborted) return
        if (res.status === 429) {
          // The backend's contact-search limiter said no. Surface a
          // toast and clear the in-flight searching indicator; we
          // don't keep stale results on screen because the user
          // expects the new query to have replaced them.
          const data = (await res.json().catch(() => null)) as {
            code?: string
          } | null
          if (data?.code === 'search_rate_limited') {
            toast.show(t('search.rate_limited'), { tone: 'error' })
          } else {
            toast.show(t('search.rate_limited'), { tone: 'error' })
          }
          setResults([])
          return
        }
        if (!res.ok) {
          setResults([])
          return
        }
        const data = (await res.json()) as SearchResult[]
        if (signal?.aborted) return
        setResults(Array.isArray(data) ? data : [])
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        console.error('[search] /users/search failed', err)
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [accessToken, type, q, phoneLocal, phoneCountry.dial, t, toast],
  )

  // Debounced auto-search for username + social handle types only.
  // Phone is excluded by design — see the dedicated phone form below.
  // Email keeps the longer 5-char gate to discourage casual harvesting.
  useEffect(() => {
    if (type === 'phone') return
    const term = q.trim()
    const minLen = type === 'email' ? 5 : 2
    if (term.length < minLen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearching(false)
      return
    }
    if (!accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      void runSearch(ctrl.signal)
    }, 280)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [q, type, accessToken, runSearch])

  const onSubmitPhone = (e: React.FormEvent) => {
    e.preventDefault()
    setPhoneTouched(true)
    if (phoneShapeError) {
      // No network call — surface the inline error and leave previous
      // results untouched. (The validation copy renders below the
      // form whenever phoneTouched && phoneShapeError.)
      return
    }
    void runSearch()
  }

  // One-shot fetch of the viewer's following set so per-row Follow
  // buttons render correctly on first paint. Async IIFE keeps the
  // setState off the synchronous effect path.
  useEffect(() => {
    if (!accessToken || !userId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/users/${userId}/following`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (cancelled || !res.ok) return
        const data = (await res.json()) as {
          items?: Array<{ id: string }>
        }
        if (cancelled) return
        const ids = new Set<string>()
        for (const u of data.items ?? []) ids.add(u.id)
        setFollowingIds(ids)
      } catch {
        // Silent — buttons will render as "Follow" by default; first
        // click on an already-followed user is idempotent server-side.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, userId])

  // Follow / unfollow toggle for a search row. Optimistic — flip the
  // local set, fire the request, roll back on failure. Rate-limit
  // responses (429) surface as a toast and roll back too.
  const onToggleFollow = async (targetId: string) => {
    if (!accessToken || followBusy === targetId) return
    const wasFollowing = followingIds.has(targetId)
    setFollowingIds((s) => {
      const next = new Set(s)
      if (wasFollowing) next.delete(targetId)
      else next.add(targetId)
      return next
    })
    setFollowBusy(targetId)
    try {
      const res = await fetch(
        `${API_BASE}/follow/${encodeURIComponent(targetId)}`,
        {
          method: wasFollowing ? 'DELETE' : 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          code?: string
        } | null
        if (data?.code === 'follow_rate_limited') {
          toast.show(t('toast.follow_rate_limited'), { tone: 'error' })
        } else {
          toast.show(t('toast.changes_saved'), { tone: 'error' })
        }
        // Roll back.
        setFollowingIds((s) => {
          const next = new Set(s)
          if (wasFollowing) next.add(targetId)
          else next.delete(targetId)
          return next
        })
      }
    } catch {
      // Roll back.
      setFollowingIds((s) => {
        const next = new Set(s)
        if (wasFollowing) next.add(targetId)
        else next.delete(targetId)
        return next
      })
    } finally {
      setFollowBusy(null)
    }
  }

  if (!ready) return <SearchSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('search.badge')}</Badge>}
          line1={t('search.title_1')}
          gradient={t('search.title_2')}
          subtitle={t('search.subtitle')}
          size="sm"
        />

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span
              className="block text-[0.65rem] font-semibold tracking-[0.3em]"
              style={{ color: 'var(--muted)' }}
            >
              {t('search.type_label')}
            </span>
            <span
              className="text-[0.7rem] font-medium"
              style={{ color: 'var(--primary)' }}
            >
              {t('search.searching_by')}: {t(activeType.labelKey)}
            </span>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
            {TYPES.map((tp) => {
              const active = tp.id === type
              return (
                <button
                  key={tp.id}
                  type="button"
                  onClick={() => setType(tp.id)}
                  aria-pressed={active}
                  className="shrink-0 rounded-full border px-4 py-2 text-xs transition-all duration-300 active:scale-95"
                  style={{
                    borderColor: active ? 'transparent' : 'var(--border)',
                    background: active
                      ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                      : 'var(--card-soft)',
                    color: active ? '#fff' : 'var(--text-soft)',
                    fontWeight: active ? 700 : 500,
                    boxShadow: active ? 'var(--shadow-soft)' : undefined,
                    transform: active ? 'scale(1.04)' : 'none',
                  }}
                >
                  {t(tp.labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        {type === 'phone' ? (
          <PhoneSearchForm
            dial={phoneDial}
            onDialChange={setPhoneDial}
            local={phoneLocal}
            onLocalChange={setPhoneLocal}
            shapeError={phoneShapeError}
            touched={phoneTouched}
            searching={searching}
            onSubmit={onSubmitPhone}
          />
        ) : (
          <div
            className="mt-4 flex items-center overflow-hidden rounded-2xl border backdrop-blur-md transition-all"
            style={{
              borderColor: focused ? 'var(--input-border-focus)' : 'var(--border)',
              background: 'var(--card)',
              boxShadow: focused ? 'var(--input-shadow-focus)' : 'var(--input-shadow)',
            }}
          >
            <span className="ps-5" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" style={{ color: 'var(--muted-2)' }}>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </span>
            <input
              type={type === 'email' ? 'email' : 'search'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t(activeType.phKey)}
              dir={type === 'email' ? 'ltr' : undefined}
              className="w-full bg-transparent px-4 py-[1rem] text-base font-medium focus:outline-none"
              style={{ color: 'var(--text)' }}
            />
          </div>
        )}

        <p
          className="mt-2 text-[0.7rem]"
          style={{ color: 'var(--muted-2)' }}
        >
          {type === 'phone' ? t('search.phone_tip') : t('search.tip')}
        </p>

        {searching ? (
          <ul className="mt-5 flex flex-col gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-16 w-full" rounded="3xl" />
              </li>
            ))}
          </ul>
        ) : results.length === 0 ? (
          <SearchEmptyState
            // Phone uses the dedicated dial+local form, so the "query"
            // we pass to the empty-state is the user-typed local part
            // (or its E.164 form for the invite-link affordance once
            // the user has actually clicked Search).
            query={
              type === 'phone'
                ? phoneTouched && !phoneShapeError
                  ? phoneE164
                  : ''
                : q.trim()
            }
            type={type}
            // Phone-specific: when the user hasn't pressed Search yet
            // (or the local digits are still incomplete), the empty
            // state is "fill in a complete phone" — NOT "no results
            // for that query". The invite affordance shouldn't appear
            // until we know there's a real, complete number to invite.
            phoneIncomplete={
              type === 'phone' && (!phoneTouched || !!phoneShapeError)
            }
            onInvite={(value) => {
              const link = `${SITE_ORIGIN}/invite?ref=${encodeURIComponent(value)}`
              try {
                navigator.clipboard?.writeText(link)
              } catch {
                // clipboard may be unavailable; toast still indicates intent
              }
              toast.show(t('toast.invite_ready'))
            }}
          />
        ) : (
          <ul className="mt-5 flex flex-col gap-2.5">
            {results.map((r) => {
              const display = r.fullName?.trim() || r.qiftUsername
              const initials = display
                .split(' ')
                .filter(Boolean)
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
              return (
                <li
                  key={r.id + r.matchedField}
                  className="flex items-center gap-3 rounded-3xl border p-4 backdrop-blur-md transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <Link
                    href={`/u/${encodeURIComponent(r.qiftUsername)}`}
                    aria-label={`@${r.qiftUsername}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-bold text-white"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                    }}
                  >
                    {r.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span aria-hidden>{initials || '?'}</span>
                    )}
                  </Link>
                  <Link
                    href={`/u/${encodeURIComponent(r.qiftUsername)}`}
                    className="min-w-0 flex-1"
                  >
                    <h3
                      className="truncate text-sm font-bold"
                      style={{ color: 'var(--ink)' }}
                    >
                      {display}
                    </h3>
                    <p
                      className="truncate text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      <span dir="ltr">@{r.qiftUsername}</span>
                      <span className="mx-1.5 opacity-50">·</span>
                      {t(FIELD_LABELS[r.matchedField])}
                    </p>
                  </Link>
                  {/* Follow / Following toggle. Disabled (and shown
                      with a soft style) while the request is in flight
                      to avoid double-tapping into a 429. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      void onToggleFollow(r.id)
                    }}
                    disabled={followBusy === r.id}
                    className="shrink-0 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    style={
                      followingIds.has(r.id)
                        ? {
                            borderColor: 'var(--border)',
                            background: 'var(--card-soft)',
                            color: 'var(--text-soft)',
                          }
                        : {
                            borderColor: 'transparent',
                            background:
                              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                            color: '#fff',
                          }
                    }
                  >
                    {followingIds.has(r.id)
                      ? t('search.following')
                      : t('search.follow')}
                  </button>
                  <Link
                    href={`/stores?to=${encodeURIComponent(r.qiftUsername)}`}
                    className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:-translate-y-0.5"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                      boxShadow: 'var(--shadow-soft)',
                    }}
                  >
                    {t('search.send')}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

// Dial-picker + local-number form used exclusively for phone search.
// Mirrors the registration page's dial picker so the visual contract
// is consistent. Critically, the input has NO debounced search
// callback — typing never triggers a network request. The Search
// button (and Enter on the local input) are the only two ways to
// submit, and we apply the same per-country shape validator the
// registration flow uses (validatePhoneShape) before sending.
//
// Saudi auto-strip: composeE164 already drops the leading 0, so a
// user pasting `0501234567` ends up sending `+966501234567` to the
// backend without us writing any country-specific code here.
function PhoneSearchForm({
  dial,
  onDialChange,
  local,
  onLocalChange,
  shapeError,
  touched,
  searching,
  onSubmit,
}: {
  dial: string
  onDialChange: (code: string) => void
  local: string
  onLocalChange: (digits: string) => void
  shapeError: string | null
  touched: boolean
  searching: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  const { t } = useI18n()
  const showError = touched && !!shapeError
  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2">
      <div
        className="flex items-stretch overflow-hidden rounded-2xl border backdrop-blur-md transition-all"
        style={{
          borderColor: showError
            ? 'rgba(213, 91, 110, 0.55)'
            : 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--input-shadow)',
        }}
        dir="ltr"
      >
        <select
          value={dial}
          onChange={(e) => onDialChange(e.target.value)}
          aria-label={t('register.country_label')}
          className="appearance-none border-0 bg-transparent px-3 py-3 text-sm font-medium focus:outline-none"
          style={{
            color: 'var(--text)',
            borderInlineEnd: '1px solid var(--border)',
            minWidth: '7.5rem',
          }}
        >
          {DIAL_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.dial} ({c.code})
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={local}
          onChange={(e) => {
            // Single source of truth for "what the input should
            // display". sanitizeLocalDigits handles every paste shape
            // (+966…, 00966…, 966…), strips the leading 0, and drops
            // anything non-digit — the visible value always matches
            // what composeE164 will submit. The previous inline
            // version only stripped non-digits + leading zeros,
            // which left `+966...` / `966...` paste cases mangled.
            onLocalChange(sanitizeLocalDigits(dial, e.target.value))
          }}
          placeholder={t('search.ph_phone')}
          dir="ltr"
          className="w-full bg-transparent px-3 py-3 text-base font-medium focus:outline-none"
          style={{ color: 'var(--text)' }}
        />
        <button
          type="submit"
          disabled={searching}
          className="px-5 py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            borderInlineStart: '1px solid var(--border)',
          }}
        >
          {searching ? (
            <span className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            t('search.search_button')
          )}
        </button>
      </div>
      {showError && (
        <p
          role="alert"
          className="text-[0.72rem] font-medium"
          style={{ color: '#B83A50' }}
        >
          {t('search.phone_enter_full_body')}
        </p>
      )}
    </form>
  )
}

function SearchSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-20" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />

        <Skeleton className="mt-5 h-3 w-20" />
        <div className="mt-2 -mx-1 flex gap-2 overflow-hidden pb-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 shrink-0" rounded="full" />
          ))}
        </div>

        <Skeleton className="mt-4 h-14 w-full" rounded="2xl" />
        <Skeleton className="mt-2 h-3 w-44" />

        <ul className="mt-5 flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-16 w-full" rounded="3xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

function SearchEmptyState({
  query,
  type,
  phoneIncomplete,
  onInvite,
}: {
  query: string
  type: SearchType
  // True only when the search type is `phone` AND the user either
  // hasn't pressed Search yet OR the local digits don't pass the
  // shape validator. Suppresses the invite CTA + matched-query chip
  // because we have no real query to invite/echo back.
  phoneIncomplete?: boolean
  onInvite: (value: string) => void
}) {
  const { t } = useI18n()
  // Pick the best invite affordance label based on the search type.
  const inviteLabel =
    type === 'phone'
      ? t('search.invite_via_sms')
      : type === 'email'
        ? t('search.invite_via_email')
        : t('search.invite_share_link')

  const hasQuery = query.length > 0 && !phoneIncomplete
  return (
    <div
      className="mt-5 flex flex-col items-center rounded-3xl border px-6 py-8 text-center backdrop-blur-md qift-fade-in sm:px-8 sm:py-9"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
          <path d="M11 8v3M11 14h.01" />
        </svg>
      </span>

      {hasQuery && (
        <span
          dir="ltr"
          className="mt-4 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-soft)',
          }}
        >
          {query}
        </span>
      )}

      <p
        className="mt-3 text-base font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {hasQuery
          ? t('search.invite_title')
          : phoneIncomplete
            ? t('search.phone_enter_full_title')
            : t('search.no_results')}
      </p>
      <p
        className="mt-1.5 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {hasQuery
          ? t('search.invite_body')
          : phoneIncomplete
            ? t('search.phone_enter_full_body')
            : t('search.tip')}
      </p>

      {hasQuery && (
        <>
          <button
            type="button"
            onClick={() => onInvite(query)}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {t('search.invite_cta')}
          </button>
          <p
            className="mt-3 text-[0.7rem]"
            style={{ color: 'var(--muted-2)' }}
          >
            {inviteLabel}
          </p>
        </>
      )}
    </div>
  )
}
