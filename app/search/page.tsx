'use client'

// Phase 6.6 — Search experience redesign.
//
// Search in Qift is identity discovery, relationship discovery, gifting
// discovery — not a utility filter. This page is intentionally
// search-FIRST: a soft hero input dominates the viewport, with a compact
// 4-category type picker beneath. Social platforms collapse into an
// inline drawer so the page stays calm even as the supported-platforms
// list grows.
//
// Smart detection (passive, not coercive): as the user types, the page
// notices when the query strongly resembles a phone number or email
// shape and offers a one-tap "switch to Phone / Email search" affordance
// below the input. We never auto-switch — the user always understands
// what's being searched.
//
// Privacy invariants (enforced server-side; UI must not undermine):
//   - Phone search is exact-match + opt-in via allowPhoneDiscovery
//   - Email search is exact-match + opt-in via allowEmailDiscovery
//   - Substring queries never reach the DB (shape gate fails closed)
//   - Block list is bidirectional; results are pre-filtered
//   - Profile visibility=private accounts are hidden from contact lookups
//
// Future-readiness slots (structural, not built yet — commented in
// place so the next pass has obvious insertion points):
//   - Recent searches (per-viewer, capped)
//   - Suggested contacts (people you've gifted recently)
//   - Mutual-relationship context on each result row
//   - Smart-suggestions based on follow-graph proximity
// None of those are wired today.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// ── Types (mirror backend UsersService.searchUsers projection) ──────

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

// 4 primary categories the picker exposes by default. Social expands
// inline to the 8 platform handles below — keeping the picker line
// uncluttered as the supported list grows.
type PrimaryCategory = 'qift' | 'phone' | 'email' | 'social'

// Architectural separation enforced across the whole search surface
// (frontend autocomplete behaviour + backend exact-match gate):
//
//   Discoverable Qift-native identity (DISCOVERABLE_CATEGORIES):
//     - The user CHOSE this handle publicly for Qift. The whole
//       point of the qiftUsername is to be findable.
//     - Autocomplete-style live results are appropriate.
//
//   Privacy-sensitive external channels (everything else):
//     - The user identifier comes from a system OUTSIDE Qift; the
//       LINKAGE to a Qift account is private context even when the
//       handle itself is public on the source platform.
//     - Behaviour: explicit submit, exact-match, no autocomplete,
//       no enumeration surface. Matches the backend's tightened
//       exact-match path for phone / email / social.
//
// Adding a future channel? Decide deliberately which side it sits
// on. Default to privacy-sensitive — the burden of proof for
// discoverability is "did the user opt to publish this on Qift?".
const DISCOVERABLE_CATEGORIES: ReadonlySet<PrimaryCategory> = new Set(['qift'])

function isDiscoverableCategory(category: PrimaryCategory): boolean {
  return DISCOVERABLE_CATEGORIES.has(category)
}

type SocialPlatform =
  | 'snapchat'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'youtube'
  | 'threads'
  | 'telegram'

// What we actually send to the backend `type=` query param.
type SearchType = Exclude<PrimaryCategory, 'social'> | SocialPlatform

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'snapchat',
  'tiktok',
  'instagram',
  'x',
  'facebook',
  'youtube',
  'threads',
  'telegram',
]

// Translation key for each searchable type's display label. Reused by
// the result-row "matched via X" hint AND the picker labels.
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

// Map the picker's category onto the backend type. Social platforms
// pass through unchanged.
function backendTypeFor(category: PrimaryCategory, social: SocialPlatform): SearchType {
  if (category === 'social') return social
  return category
}

// ── Smart-detection ─────────────────────────────────────────────────
//
// Passive observer — never mutates state on its own. Returns a
// suggestion the UI shows as a single-tap chip beneath the input.
// Two rules:
//
//   1. Phone-like: starts with +, 00, or contains primarily digits
//      (with optional spaces / dashes / parentheses). Min 4 digits so
//      "10" or "555" don't trigger.
//   2. Email-like: has exactly one '@' surrounded by non-empty local
//      part + a domain containing at least one '.'.
//
// The detection is INTENTIONALLY conservative. We never suggest a
// social platform because there's no way to know which one a bare
// "@handle" belongs to. We don't suggest 'qift' switches because qift
// is the default fallback for plain text.

type Suggestion =
  | { kind: 'phone' }
  | { kind: 'email' }
  | null

function detectSuggestion(raw: string, currentCategory: PrimaryCategory): Suggestion {
  const trimmed = raw.trim()
  if (trimmed.length < 3) return null

  // Email shape: middle-@ with non-empty local part + domain with
  // a dot. Mirrors the backend's shape validator so the suggestion
  // only appears when the backend would actually accept the query.
  const at = trimmed.indexOf('@')
  if (
    at > 0 &&
    at === trimmed.lastIndexOf('@') &&
    at < trimmed.length - 1 &&
    trimmed.slice(at + 1).includes('.') &&
    currentCategory !== 'email'
  ) {
    return { kind: 'email' }
  }

  // Phone shape: starts with + or 00, OR is mostly digits with allowed
  // separators. The 4-digit floor keeps suggestion noise low — a user
  // typing their full name doesn't get nagged because they happened
  // to include a numeric token.
  const digitCount = (trimmed.match(/\d/g) ?? []).length
  const looksPhone =
    digitCount >= 4 &&
    /^[\d+\s\-()]+$/.test(trimmed) &&
    currentCategory !== 'phone'
  if (looksPhone) return { kind: 'phone' }

  return null
}

// ── Page ────────────────────────────────────────────────────────────

export default function SearchPage() {
  const { t } = useI18n()
  const toast = useToast()
  const ready = useSimulatedReady(450)
  const { accessToken, userId } = useAuth()
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Primary category drives the picker's active chip. Social uses a
  // sub-platform underneath; the active backend type is `social
  // ? socialPlatform : category`.
  const [category, setCategory] = useState<PrimaryCategory>('qift')
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform>('snapchat')
  const [socialOpen, setSocialOpen] = useState(false)

  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Phone sub-form state. The dial picker + local digits compose into
  // a single E.164 candidate that's only sent on explicit Search —
  // typing alone never hits the network for phone.
  const [phoneDial, setPhoneDial] = useState<string>('SA')
  const [phoneLocal, setPhoneLocal] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)

  // Follow-graph state for the per-row Follow button. Loaded once on
  // mount; mutated optimistically on click.
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [followBusy, setFollowBusy] = useState<string | null>(null)

  const activeBackendType = backendTypeFor(category, socialPlatform)
  const suggestion = useMemo(() => detectSuggestion(q, category), [q, category])

  // Switching category resets the result list + clears any phone-form
  // validation. Handled here (not in an effect) to keep the React 19
  // set-state-in-effect rule clean.
  const switchCategory = useCallback((next: PrimaryCategory) => {
    setCategory(next)
    setResults([])
    setSearching(false)
    setHasSearched(false)
    setPhoneTouched(false)
    // Close the social drawer when switching away from social.
    if (next !== 'social') setSocialOpen(false)
    // Keep focus on the search box so the user can keep typing.
    inputRef.current?.focus()
  }, [])

  const switchSocialPlatform = useCallback((next: SocialPlatform) => {
    setSocialPlatform(next)
    setResults([])
    setSearching(false)
    setHasSearched(false)
    setSocialOpen(false)
    inputRef.current?.focus()
  }, [])

  const phoneShapeError = validatePhoneShape(phoneDial, phoneLocal)
  const phoneCountry = dialCountryFor(phoneDial)
  const phoneE164 = composeE164(phoneCountry.dial, phoneLocal)

  // Imperative search — only fires when explicitly called.
  const runSearch = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!accessToken) {
        setResults([])
        return
      }
      setSearching(true)
      try {
        const url = new URL(`${API_BASE}/users/search`)
        url.searchParams.set('type', activeBackendType)
        if (category === 'phone') {
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
          toast.show(t('search.rate_limited'), { tone: 'error' })
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
        setHasSearched(true)
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        console.error('[search] /users/search failed', err)
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [
      accessToken,
      activeBackendType,
      category,
      q,
      phoneLocal,
      phoneCountry.dial,
      t,
      toast,
    ],
  )

  // Debounced auto-search ONLY for DISCOVERABLE_CATEGORIES (qift =
  // username + fullName). Privacy-sensitive channels — phone, email,
  // every social platform — use explicit-submit only. Auto-search-
  // as-typing on those channels turned the search surface into a
  // social-media-style autocomplete / fishing UX that doesn't match
  // Qift's privacy-first philosophy. Phase 6.7 refinement.
  useEffect(() => {
    if (!isDiscoverableCategory(category)) return
    if (!accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      return
    }
    const term = q.trim()
    // qift is the only autocomplete category; min-length stays at 2
    // to match the backend's qift-branch gate.
    if (term.length < 2) {
      setResults([])
      setSearching(false)
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
  }, [q, category, accessToken, runSearch])

  const onSubmitPhone = (e: React.FormEvent) => {
    e.preventDefault()
    setPhoneTouched(true)
    if (phoneShapeError) return
    void runSearch()
  }

  // Explicit-submit handler for email + social. Called from the hero
  // input's submit button + Enter key. qift bypasses this entirely
  // (the debounced effect above handles it). Phone has its own
  // dedicated form (PhoneHero).
  const onSubmitExplicit = useCallback(() => {
    if (isDiscoverableCategory(category)) return
    if (category === 'phone') return
    const term = q.trim()
    if (term.length < 2) return
    void runSearch()
  }, [category, q, runSearch])

  // Following set hydration — one-shot fetch so per-row Follow
  // buttons show the right initial state.
  useEffect(() => {
    if (!accessToken || !userId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/users/${userId}/following`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled || !res.ok) return
        const data = (await res.json()) as { items?: Array<{ id: string }> }
        if (cancelled) return
        const ids = new Set<string>()
        for (const u of data.items ?? []) ids.add(u.id)
        setFollowingIds(ids)
      } catch {
        // Buttons default to "Follow"; first click is idempotent.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, userId])

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
        setFollowingIds((s) => {
          const next = new Set(s)
          if (wasFollowing) next.add(targetId)
          else next.delete(targetId)
          return next
        })
      }
    } catch {
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

  // Empty-state copy gating. We show:
  //   - the warm guidance state when nothing's been searched yet AND
  //     no query is typed
  //   - the invite-CTA state when a real query returned no results
  //     (user actually searched, got nothing back)
  //   - the inline phone "enter full number" state when type=phone and
  //     the form isn't complete yet
  const isEmptyResultsView = !searching && results.length === 0
  const showInviteEmptyState =
    isEmptyResultsView &&
    hasSearched &&
    (category === 'phone' ? !phoneShapeError && phoneTouched : q.trim().length > 0)
  const showWarmGuidance = isEmptyResultsView && !showInviteEmptyState

  return (
    <PageContainer size="md">
      <section className="qift-fade-in pt-5">
        <PageHeading
          badge={<Badge>{t('search.badge')}</Badge>}
          line1={t('search.title_1')}
          gradient={t('search.title_2')}
          subtitle={t('search.subtitle')}
          size="sm"
        />

        {/* HERO INPUT — dominates the viewport. The type picker sits
            below as a secondary control. For the phone category, the
            hero is replaced by the country-aware sub-form. */}
        {category === 'phone' ? (
          <PhoneHero
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
          <HeroInput
            inputRef={inputRef}
            value={q}
            onChange={setQ}
            placeholder={t(placeholderKeyFor(activeBackendType))}
            focused={focused}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            searching={searching}
            type={activeBackendType}
            // Explicit-submit mode for every category EXCEPT qift.
            // Privacy-sensitive channels (email + every social
            // platform) need a deliberate tap; typing alone never
            // hits the network. qift keeps the existing debounced
            // autocomplete behaviour.
            requiresSubmit={!isDiscoverableCategory(category)}
            onSubmit={onSubmitExplicit}
          />
        )}

        {/* Intent hint for privacy-sensitive channels. Calmly tells
            the user "type a full handle, then tap Search" so the
            absence of live results doesn't read as broken UI. The
            existing search.phone_tip serves the phone case; this
            covers email + social. */}
        {!isDiscoverableCategory(category) && category !== 'phone' && (
          <p
            className="mt-2 text-[0.7rem]"
            style={{ color: 'var(--muted-2)' }}
          >
            {category === 'email'
              ? t('search.hint_email_explicit')
              : t('search.hint_social_explicit')}
          </p>
        )}

        {/* Smart-detect suggestion. Single-tap chip that switches the
            picker to the suggested category. Never auto-switches. */}
        {suggestion && (
          <button
            type="button"
            onClick={() => switchCategory(suggestion.kind)}
            className="qift-fade-in mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-medium transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <span aria-hidden>✨</span>
            <span>
              {suggestion.kind === 'phone'
                ? t('search.suggest_phone')
                : t('search.suggest_email')}
            </span>
          </button>
        )}

        {/* COMPACT TYPE PICKER. Four primary categories + a Social
            drawer. The "Social" chip itself shows the active sub-
            platform when one's selected, otherwise the label "Social". */}
        <TypePicker
          category={category}
          onCategoryChange={switchCategory}
          socialPlatform={socialPlatform}
          socialOpen={socialOpen}
          onToggleSocialDrawer={() => setSocialOpen((v) => !v)}
        />

        {/* Social platform drawer — inline (not modal). Renders only
            when Social is active OR the drawer was explicitly opened. */}
        {socialOpen && (
          <SocialDrawer
            platform={socialPlatform}
            onSelect={(p) => {
              switchSocialPlatform(p)
              // If they were on a different primary category, also
              // promote them into Social.
              if (category !== 'social') setCategory('social')
            }}
          />
        )}

        {/* RESULTS / EMPTY STATE */}
        {searching ? (
          <ul className="mt-6 flex flex-col gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-16 w-full" rounded="3xl" />
              </li>
            ))}
          </ul>
        ) : results.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-2.5">
            {results.map((r) => (
              <ResultRow
                key={r.id + r.matchedField}
                result={r}
                isFollowing={followingIds.has(r.id)}
                busy={followBusy === r.id}
                onToggleFollow={() => void onToggleFollow(r.id)}
                t={t}
              />
            ))}
          </ul>
        ) : showInviteEmptyState ? (
          <InviteEmptyState
            query={
              category === 'phone' && !phoneShapeError && phoneTouched
                ? phoneE164
                : q.trim()
            }
            category={category}
            onInvite={(value) => {
              const link = `${SITE_ORIGIN}/invite?ref=${encodeURIComponent(value)}`
              try {
                navigator.clipboard?.writeText(link)
              } catch {
                /* clipboard may be unavailable */
              }
              toast.show(t('toast.invite_ready'))
            }}
          />
        ) : showWarmGuidance ? (
          <WarmGuidance
            onPick={(c) => {
              switchCategory(c)
            }}
          />
        ) : null}
      </section>
    </PageContainer>
  )
}

// ── Hero input (qift / email / social) ──────────────────────────────

function HeroInput({
  inputRef,
  value,
  onChange,
  placeholder,
  focused,
  onFocus,
  onBlur,
  searching,
  type,
  requiresSubmit,
  onSubmit,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (v: string) => void
  placeholder: string
  focused: boolean
  onFocus: () => void
  onBlur: () => void
  searching: boolean
  type: SearchType
  // When true, the input renders an inline Search button at the
  // trailing edge and Enter triggers `onSubmit` instead of waiting
  // for the debounced auto-search. Used for email + every social
  // platform — the privacy-sensitive channels where the user must
  // submit intentionally. qift remains debounced (no button).
  requiresSubmit?: boolean
  onSubmit?: () => void
}) {
  const { t } = useI18n()
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!requiresSubmit) return
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.()
    }
  }
  return (
    <div
      className="mt-6 flex items-center overflow-hidden rounded-3xl border transition-all"
      style={{
        borderColor: focused ? 'var(--input-border-focus)' : 'var(--border)',
        background: 'var(--card)',
        boxShadow: focused
          ? 'var(--input-shadow-focus)'
          : 'var(--shadow-card)',
        transform: focused ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <span className="ps-5" aria-hidden>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[1.35rem] w-[1.35rem]"
          style={{ color: focused ? 'var(--primary)' : 'var(--muted-2)' }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </span>
      <input
        ref={inputRef}
        type={type === 'email' ? 'email' : 'search'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        dir={type === 'email' ? 'ltr' : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full bg-transparent px-4 py-[1.15rem] text-[1.05rem] font-medium focus:outline-none"
        style={{ color: 'var(--text)' }}
      />
      {/* Trailing slot: spinner for in-flight searches OR a Search
          button for explicit-submit channels. The two are mutually
          exclusive — when a submit is in flight the button takes
          its disabled state and shows the spinner inline. */}
      {requiresSubmit ? (
        <button
          type="button"
          onClick={() => onSubmit?.()}
          disabled={searching || value.trim().length < 2}
          aria-label={t('search.search_button')}
          className="me-1.5 my-1.5 inline-flex items-center justify-center rounded-2xl px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
            alignSelf: 'stretch',
          }}
        >
          {searching ? (
            <span className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            t('search.search_button')
          )}
        </button>
      ) : (
        searching && (
          <span
            aria-hidden
            className="pe-5"
            style={{ color: 'var(--primary)' }}
          >
            <span className="qift-spin inline-block h-4 w-4 rounded-full border-2 border-current/30 border-t-current" />
          </span>
        )
      )}
    </div>
  )
}

// ── Phone-specific hero (country picker + local digits + submit) ────

function PhoneHero({
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
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-2">
      <div
        className="flex items-stretch overflow-hidden rounded-3xl border transition-all"
        style={{
          borderColor: showError
            ? 'rgba(213, 91, 110, 0.55)'
            : 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
        dir="ltr"
      >
        <select
          value={dial}
          onChange={(e) => onDialChange(e.target.value)}
          aria-label={t('register.country_label')}
          className="appearance-none border-0 bg-transparent px-3.5 py-[1.05rem] text-sm font-medium focus:outline-none"
          style={{
            color: 'var(--text)',
            borderInlineEnd: '1px solid var(--border)',
            minWidth: '6.5rem',
          }}
        >
          {DIAL_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.dial}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={local}
          onChange={(e) => onLocalChange(sanitizeLocalDigits(dial, e.target.value))}
          placeholder={t('search.ph_phone')}
          dir="ltr"
          className="w-full bg-transparent px-3 py-[1.05rem] text-[1.05rem] font-medium focus:outline-none"
          style={{ color: 'var(--text)' }}
        />
        <button
          type="submit"
          disabled={searching}
          className="px-5 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
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

// ── Compact type picker (4 categories) ──────────────────────────────

function TypePicker({
  category,
  onCategoryChange,
  socialPlatform,
  socialOpen,
  onToggleSocialDrawer,
}: {
  category: PrimaryCategory
  onCategoryChange: (next: PrimaryCategory) => void
  socialPlatform: SocialPlatform
  socialOpen: boolean
  onToggleSocialDrawer: () => void
}) {
  const { t } = useI18n()
  const items: Array<{
    id: PrimaryCategory
    label: string
    icon: React.ReactNode
  }> = [
    {
      id: 'qift',
      label: t('search.cat_people'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0116 0" />
        </svg>
      ),
    },
    {
      id: 'phone',
      label: t('search.cat_phone'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.86 19.86 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.86 19.86 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
        </svg>
      ),
    },
    {
      id: 'email',
      label: t('search.cat_email'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M4 4h16v16H4z" />
          <path d="M4 4l8 7 8-7" />
        </svg>
      ),
    },
  ]
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {items.map((it) => {
        const active = category === it.id
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onCategoryChange(it.id)}
            aria-pressed={active}
            className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.78rem] font-medium transition-colors"
            style={{
              borderColor: active ? 'transparent' : 'var(--border)',
              background: active
                ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                : 'var(--card-soft)',
              color: active ? '#fff' : 'var(--text-soft)',
              fontWeight: active ? 600 : 500,
              boxShadow: active ? 'var(--shadow-soft)' : undefined,
            }}
          >
            <span aria-hidden>{it.icon}</span>
            {it.label}
          </button>
        )
      })}
      {/* Social — special chip. Shows current platform when Social is
          active. Tapping it toggles the inline drawer. */}
      <button
        type="button"
        onClick={onToggleSocialDrawer}
        aria-pressed={category === 'social'}
        aria-expanded={socialOpen}
        className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.78rem] font-medium transition-colors"
        style={{
          borderColor: category === 'social' ? 'transparent' : 'var(--border)',
          background:
            category === 'social'
              ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
              : 'var(--card-soft)',
          color: category === 'social' ? '#fff' : 'var(--text-soft)',
          fontWeight: category === 'social' ? 600 : 500,
          boxShadow: category === 'social' ? 'var(--shadow-soft)' : undefined,
        }}
      >
        <span aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="4" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M12 4v2M4 12H2M20 12h2M12 18v2" />
          </svg>
        </span>
        {category === 'social' ? t(`search.field_${socialPlatform}`) : t('search.cat_social')}
        <span
          aria-hidden
          className="ms-0.5 inline-flex transition-transform"
          style={{
            transform: socialOpen ? 'rotate(180deg)' : 'rotate(0)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
    </div>
  )
}

// ── Social platform drawer ──────────────────────────────────────────

function SocialDrawer({
  platform,
  onSelect,
}: {
  platform: SocialPlatform
  onSelect: (next: SocialPlatform) => void
}) {
  const { t } = useI18n()
  return (
    <div
      className="qift-fade-in mt-3 flex flex-wrap gap-1.5 rounded-2xl border p-2.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      {SOCIAL_PLATFORMS.map((p) => {
        const active = platform === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            aria-pressed={active}
            className="rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-colors"
            style={{
              borderColor: active ? 'var(--primary)' : 'var(--border)',
              background: active ? 'rgba(123, 92, 245, 0.08)' : 'var(--card)',
              color: active ? 'var(--ink)' : 'var(--text-soft)',
            }}
          >
            {t(`search.field_${p}`)}
          </button>
        )
      })}
    </div>
  )
}

// ── Result row ──────────────────────────────────────────────────────

function ResultRow({
  result,
  isFollowing,
  busy,
  onToggleFollow,
  t,
}: {
  result: SearchResult
  isFollowing: boolean
  busy: boolean
  onToggleFollow: () => void
  t: (key: string) => string
}) {
  const display = result.fullName?.trim() || result.qiftUsername
  const initials = display
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <li
      className="flex items-center gap-3 rounded-3xl border p-4 transition-all hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <Link
        href={`/u/${encodeURIComponent(result.qiftUsername)}`}
        aria-label={`@${result.qiftUsername}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-bold text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
        }}
      >
        {result.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden>{initials || '?'}</span>
        )}
      </Link>
      <Link
        href={`/u/${encodeURIComponent(result.qiftUsername)}`}
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
          <span dir="ltr">@{result.qiftUsername}</span>
          <span className="mx-1.5 opacity-50">·</span>
          {t(FIELD_LABELS[result.matchedField])}
        </p>
      </Link>
      {/* Future slot — mutual-friends / "you both follow Sarah" chip.
          Render-site placeholder so the next pass has an obvious
          insertion point without restructuring this row. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          onToggleFollow()
        }}
        disabled={busy}
        className="shrink-0 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        style={
          isFollowing
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
        {isFollowing ? t('search.following') : t('search.follow')}
      </button>
      <Link
        href={`/stores?to=${encodeURIComponent(result.qiftUsername)}`}
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
}

// ── Warm guidance (shown when no query yet) ─────────────────────────
//
// Replaces the previous generic empty state. Reads as a calm
// invitation — "here are the ways to find someone" — with
// tap-to-switch chips that move the user into the right category.
// Future home for `RecentSearches` + `SuggestedContacts` (commented
// placeholder below).

function WarmGuidance({
  onPick,
}: {
  onPick: (c: PrimaryCategory) => void
}) {
  const { t } = useI18n()
  const items: Array<{
    id: PrimaryCategory
    title: string
    hint: string
  }> = [
    {
      id: 'qift',
      title: t('search.guide_people_title'),
      hint: t('search.guide_people_hint'),
    },
    {
      id: 'phone',
      title: t('search.guide_phone_title'),
      hint: t('search.guide_phone_hint'),
    },
    {
      id: 'email',
      title: t('search.guide_email_title'),
      hint: t('search.guide_email_hint'),
    },
    {
      id: 'social',
      title: t('search.guide_social_title'),
      hint: t('search.guide_social_hint'),
    },
  ]
  return (
    <div className="mt-6 space-y-3">
      <p
        className="text-[0.7rem] font-semibold tracking-[0.18em] uppercase"
        style={{ color: 'var(--muted)' }}
      >
        {t('search.guide_heading')}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onPick(it.id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-start transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[0.88rem] font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {it.title}
                </span>
                <span
                  className="mt-0.5 block truncate text-[0.72rem]"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {it.hint}
                </span>
              </span>
              <span
                aria-hidden
                className="shrink-0"
                style={{ color: 'var(--muted-2)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/*
          FUTURE — recent searches + suggested-contacts rails.
          Wireframe sketch:

            <p className="…">{t('search.recent_heading')}</p>
            <RecentSearchChips items={recents} onPick={onRecentPick} />

            <p className="…">{t('search.suggested_heading')}</p>
            <SuggestedContactRow items={suggested} />

          Deferred — see project_external_integrations_architecture
          and the Phase 7 telemetry observation window. Adding them
          requires:
            - a server-side per-viewer recent-search store with TTL +
              size cap (no global cache; never anonymized fingerprint)
            - a suggestion query (BlocksService-aware) that returns
              follow-graph adjacency without revealing private rows
          Both are explicit privacy decisions, not just UX.
      */}
    </div>
  )
}

// ── Invite empty state (shown only after an actual search) ──────────

function InviteEmptyState({
  query,
  category,
  onInvite,
}: {
  query: string
  category: PrimaryCategory
  onInvite: (value: string) => void
}) {
  const { t } = useI18n()
  const inviteLabel =
    category === 'phone'
      ? t('search.invite_via_sms')
      : category === 'email'
        ? t('search.invite_via_email')
        : t('search.invite_share_link')

  return (
    <div
      className="qift-fade-in mt-6 flex flex-col items-center rounded-3xl border px-6 py-8 text-center sm:px-8 sm:py-9"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
          <path d="M11 8v3M11 14h.01" />
        </svg>
      </span>

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

      <p
        className="mt-3 text-base font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('search.invite_title')}
      </p>
      <p
        className="mt-1.5 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('search.invite_body')}
      </p>

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
      <p className="mt-3 text-[0.7rem]" style={{ color: 'var(--muted-2)' }}>
        {inviteLabel}
      </p>
    </div>
  )
}

// ── Skeleton (preserves the previous shell shape) ───────────────────

function SearchSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-20" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        <Skeleton className="mt-6 h-16 w-full" rounded="3xl" />
        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20" rounded="full" />
          ))}
        </div>
        <ul className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-16 w-full" rounded="3xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────

function placeholderKeyFor(type: SearchType): string {
  switch (type) {
    case 'qift':
      return 'search.ph_qift'
    case 'email':
      return 'search.ph_email'
    case 'phone':
      return 'search.ph_phone'
    case 'snapchat':
      return 'search.ph_snapchat'
    case 'tiktok':
      return 'search.ph_tiktok'
    case 'instagram':
      return 'search.ph_instagram'
    case 'x':
      return 'search.ph_x'
    case 'facebook':
      return 'search.ph_facebook'
    case 'youtube':
      return 'search.ph_youtube'
    case 'threads':
      return 'search.ph_threads'
    case 'telegram':
      return 'search.ph_telegram'
    default:
      return 'search.ph_qift'
  }
}
