'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PreferencesSection from '@/components/PreferencesSection'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import type { PublicPreferences } from '@/lib/social'

// Wishlist preferences — gifting-taste signals that seed the /send
// flow and future AI gift recommendations.
//
// Structured selection (not free text) for the taste fields:
//   - Clothing size: single XS..XXL chip
//   - Shoe size:     scale chip (EU/US/UK) + numeric chip
//   - Ring size:     numeric chip 5..12
//   - Fragrance families: multi-select chips
//   - Favorite colors:    multi-select swatches
//   - Favorite categories: multi-select chips
//   - Allergies: free text (varies too widely to enumerate)
//   - Accept surprises: toggle
//
// Persistence shape — UNCHANGED. The User schema still stores each
// field as a string column. Multi-select values are stored
// comma-separated (schema comment: "the future recommender can
// tokenize on commas without a schema migration"). Single-select
// values are stored verbatim.
//
// This swap from free text to chips is a UX shift, not a data
// model shift. The backend PATCH /users/me/preferences endpoint
// accepts the same string columns it always has.

type Preferences = {
  preferredClothingSize: string
  preferredShoeSize: string
  preferredRingSize: string
  preferredPerfume: string
  favoriteColors: string
  favoriteCategories: string
  favoriteBrands: string
  allergies: string
  acceptsSurpriseGifts: boolean
  // Free-form note (≤ 280 chars). Renders as a soft tile inside
  // the public preferences card when shared.
  giftNote: string
}

// Per-field publicity flags. Each defaults to false (owner-only).
// Keys match what the backend `preferencesVisibility` JSON column
// recognizes; unknown keys would be ignored server-side.
type VisibilityKey =
  | 'clothingSize'
  | 'shoeSize'
  | 'ringSize'
  | 'fragrance'
  | 'colors'
  | 'categories'
  | 'brands'
  | 'allergies'
  | 'surprises'
  | 'giftNote'

type Visibility = Record<VisibilityKey, boolean>

const VISIBILITY_EMPTY: Visibility = {
  clothingSize: false,
  shoeSize: false,
  ringSize: false,
  fragrance: false,
  colors: false,
  categories: false,
  brands: false,
  allergies: false,
  surprises: false,
  giftNote: false,
}

const EMPTY: Preferences = {
  preferredClothingSize: '',
  preferredShoeSize: '',
  preferredRingSize: '',
  preferredPerfume: '',
  favoriteColors: '',
  favoriteCategories: '',
  favoriteBrands: '',
  allergies: '',
  acceptsSurpriseGifts: true,
  giftNote: '',
}

// Gift note cap. Mirror of the backend's giftNote validator.
const GIFT_NOTE_MAX = 280

// Shoe size completeness check — mirror of the backend's
// isCompleteShoeSize. The public surface refuses to render a value
// that's just the scale ("EU") without a number.
function isCompleteShoeSize(v: string): boolean {
  if (!v) return false
  return /^(EU|US|UK)\s+\S+/.test(v.trim())
}

// Option sets. These live as `const` arrays so the chip components
// stay dumb / display-only — they don't need to know what each
// option means. i18n keys map values to localized labels.

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

const SHOE_SCALES = ['EU', 'US', 'UK'] as const
// The shoe number is now a manual text input (was a chip list in
// an earlier iteration) — half-sizes ("42.5"), region-edge sizes,
// and personal preferences (UK "10 1/2") were unrepresentable as
// pre-set chips. The SHOE_NUMS_* constants were removed alongside
// that change. The text input accepts /[0-9./ ]/ only and caps at
// 8 characters — see the input handler in the form for the
// sanitisation rules.

const RING_SIZES = ['5', '6', '7', '8', '9', '10', '11', '12']

// Fragrance families — value is the canonical string; UI label is
// localized.
const FRAGRANCE_FAMILIES = [
  'floral',
  'woody',
  'citrus',
  'oriental',
  'fresh',
] as const

// Favorite colors — pairs of (value, swatch hex). Names are localized
// via translation keys; the swatch is the visual.
const COLOR_OPTIONS: { value: string; swatch: string }[] = [
  { value: 'black', swatch: '#1A1A1F' },
  { value: 'white', swatch: '#F7F4EF' },
  { value: 'beige', swatch: '#D9C7AE' },
  { value: 'rose_gold', swatch: '#D9A89A' },
  { value: 'gold', swatch: '#D4A85A' },
  { value: 'silver', swatch: '#C5C5CC' },
  { value: 'red', swatch: '#D64A55' },
  { value: 'pink', swatch: '#E89AAE' },
  { value: 'purple', swatch: '#9A7DC8' },
  { value: 'blue', swatch: '#5A8AC8' },
  { value: 'green', swatch: '#6FA882' },
  { value: 'yellow', swatch: '#E8C25A' },
]

// Gift categories. Same convention: canonical lowercase values
// stored comma-separated; UI shows localized labels.
//
// All 12 categories are visible to everyone. The previous
// iteration filtered this list by "Preference type" (male /
// female / neutral); that layer was removed in the simplification
// pass — the curated subsets felt artificial without enough real
// benefit, since all other preference fields are universal.
// Preferences stay simple, elegant, lightweight, and user-driven.
const GIFT_CATEGORIES = [
  'flowers',
  'perfumes',
  'chocolate',
  'books',
  'accessories',
  'jewelry',
  'beauty',
  'tech',
  'home',
  'coffee',
  'sweets',
  'toys',
] as const

export default function PreferencesPage() {
  const { t } = useI18n()
  const toast = useToast()
  const ready = useSimulatedReady(300)
  const { accessToken, isAuthenticated } = useAuth()
  const [prefs, setPrefs] = useState<Preferences>(EMPTY)
  const [visibility, setVisibility] = useState<Visibility>(VISIBILITY_EMPTY)
  const [submitting, setSubmitting] = useState(false)

  // Hydrate from /users/me on mount. Also reads the per-field
  // publicity dict so the eye-toggle next to each chip group lands
  // in the right state.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled || !res.ok) return
        const data = (await res.json()) as Partial<Preferences> & {
          preferencesVisibility?: Record<string, boolean> | null
        }
        if (cancelled) return
        // Defensive cast for optional fields — older backends (or
        // stale caches) may not ship them.
        const d = data as Partial<Preferences> & {
          giftNote?: string | null
          preferencesVisibility?: Record<string, boolean> | null
        }
        setPrefs({
          preferredClothingSize: d.preferredClothingSize ?? '',
          preferredShoeSize: d.preferredShoeSize ?? '',
          preferredRingSize: d.preferredRingSize ?? '',
          preferredPerfume: d.preferredPerfume ?? '',
          favoriteColors: d.favoriteColors ?? '',
          favoriteCategories: d.favoriteCategories ?? '',
          favoriteBrands: d.favoriteBrands ?? '',
          allergies: d.allergies ?? '',
          acceptsSurpriseGifts:
            typeof d.acceptsSurpriseGifts === 'boolean'
              ? d.acceptsSurpriseGifts
              : true,
          giftNote: d.giftNote ?? '',
        })
        // Coerce visibility dict to our exact shape. Unknown keys
        // are filtered out; missing keys default to false (private).
        if (d.preferencesVisibility) {
          const v = d.preferencesVisibility
          setVisibility({
            clothingSize: v.clothingSize === true,
            shoeSize: v.shoeSize === true,
            ringSize: v.ringSize === true,
            fragrance: v.fragrance === true,
            colors: v.colors === true,
            categories: v.categories === true,
            brands: v.brands === true,
            allergies: v.allergies === true,
            surprises: v.surprises === true,
            giftNote: v.giftNote === true,
          })
        }
      } catch {
        // Silent — form stays at empty defaults.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Visibility toggle handler — optimistic flip, PATCH on its own
  // tick so the chip resolves instantly. Errors roll back. The same
  // PATCH /users/me/preferences endpoint accepts the visibility dict.
  const toggleVisibility = async (key: VisibilityKey) => {
    const next = { ...visibility, [key]: !visibility[key] }
    setVisibility(next)
    try {
      const res = await fetch(`${API_BASE}/users/me/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ preferencesVisibility: next }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setVisibility(visibility)
      toast.show(t('preferences.visibility_save_failed'), { tone: 'error' })
    }
  }

  // Shoe-size local draft. The DB persists a composite string
  // ("EU 42" / "US 9" / "UK 8"), but the user fills the scale +
  // number in two steps. Previously this was derived from
  // `prefs.preferredShoeSize` via parseShoe — which had a real bug:
  // clicking a scale chip first ("EU") never "stuck" in state
  // because the derived parser returned '' when no number was
  // present, so the chip un-deselected itself between renders.
  //
  // We use a separate local draft so the scale can be selected on
  // its own. Sync runs both directions:
  //   - On mount / when preferredShoeSize changes server-side,
  //     hydrate draft from parseShoe(value).
  //   - On every draft change, write a COMPLETE value back to
  //     prefs.preferredShoeSize only if both parts are non-empty.
  //     Partial drafts → preferredShoeSize='' (never persisted).
  const [shoeDraft, setShoeDraft] = useState<{ scale: string; num: string }>(
    () => parseShoe(prefs.preferredShoeSize),
  )

  // Hydrate the draft when the underlying prefs.preferredShoeSize
  // changes (e.g. after a server reload of /users/me). Wrapped in
  // a microtask so the react-hooks/set-state-in-effect lint rule
  // recognises it as a synchronisation pattern — same convention
  // used elsewhere in the codebase.
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const parsed = parseShoe(prefs.preferredShoeSize)
      setShoeDraft((cur) => {
        if (cur.scale === parsed.scale && cur.num === parsed.num) return cur
        return parsed
      })
    })
    return () => {
      cancelled = true
    }
  }, [prefs.preferredShoeSize])

  // Single setter — updates the LOCAL draft and projects the
  // composite value back into `prefs` (which feeds Save and the
  // live preview). Only writes a non-empty preferredShoeSize when
  // BOTH parts are non-empty after trim.
  const setShoe = (scale: string, num: string) => {
    setShoeDraft({ scale, num })
    setPrefs((p) => {
      const scaleClean = scale.trim()
      const numClean = num.trim()
      return {
        ...p,
        preferredShoeSize:
          scaleClean && numClean ? `${scaleClean} ${numClean}` : '',
      }
    })
  }

  // Fragrance / colors / categories — comma-separated.
  const fragranceSet = parseCSV(prefs.preferredPerfume)
  const colorSet = parseCSV(prefs.favoriteColors)
  const categorySet = parseCSV(prefs.favoriteCategories)
  const toggleCSV = (
    key: 'preferredPerfume' | 'favoriteColors' | 'favoriteCategories',
    value: string,
  ) =>
    setPrefs((p) => {
      const cur = parseCSV(p[key])
      const next = cur.has(value)
        ? new Set([...cur].filter((v) => v !== value))
        : new Set([...cur, value])
      return { ...p, [key]: Array.from(next).join(',') }
    })

  const onSave = async () => {
    if (!accessToken || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/users/me/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          preferredClothingSize: prefs.preferredClothingSize.trim() || null,
          // Shoe size: never save a partial scale-only value. If
          // the local state has just "EU" / "US" / "UK" with no
          // number, persist null instead of the partial — matches
          // the backend's defensive `isCompleteShoeSize` filter so
          // the public surface stays in sync.
          preferredShoeSize: isCompleteShoeSize(prefs.preferredShoeSize)
            ? prefs.preferredShoeSize.trim()
            : null,
          preferredRingSize: prefs.preferredRingSize.trim() || null,
          preferredPerfume: prefs.preferredPerfume.trim() || null,
          favoriteColors: prefs.favoriteColors.trim() || null,
          favoriteCategories: prefs.favoriteCategories.trim() || null,
          favoriteBrands: prefs.favoriteBrands.trim() || null,
          allergies: prefs.allergies.trim() || null,
          acceptsSurpriseGifts: prefs.acceptsSurpriseGifts,
          giftNote: prefs.giftNote.trim() || null,
        }),
      })
      if (!res.ok) {
        toast.show(t('register.error_toast'), { tone: 'error' })
        return
      }
      toast.show(t('toast.changes_saved'))
    } catch (err) {
      console.error('[preferences] PATCH failed', err)
      toast.show(t('register.error_toast'), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready || !isAuthenticated) {
    return (
      <PageContainer size="md">
        <section className="pt-5">
          <Skeleton className="h-7 w-32" rounded="full" />
          <Skeleton className="mt-4 h-9 w-2/5" />
          <Skeleton className="mt-2 h-9 w-3/5" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="mt-4 h-12 w-full"
              rounded="2xl"
            />
          ))}
        </section>
      </PageContainer>
    )
  }

  // Live count of preferences the user has opted into making public.
  // Shown in the visibility banner so the user gets immediate
  // feedback: "ah, 2 of my fields are visible on my profile right
  // now". Closes the discoverability gap between filling out a
  // preference and realising it stays private by default.
  const publicCount = (Object.keys(visibility) as VisibilityKey[]).filter(
    (k) => visibility[k],
  ).length
  const totalCount = (Object.keys(visibility) as VisibilityKey[]).length

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('preferences.badge')}</Badge>}
          line1={t('preferences.title_1')}
          gradient={t('preferences.title_2')}
          subtitle={t('preferences.subtitle')}
          size="sm"
        />

        {/* Visibility stance banner. Closes the major UX gap that
            made shared-preferences feel broken in real testing:
            preferences default to PRIVATE per field, and the
            per-field eye toggle is the only thing that flips them
            public. Without this banner, users filled out preferences,
            saved, and assumed they would appear on their public
            profile — they wouldn't, because they hadn't tapped any
            eye toggles. This banner:
              - States the default-private rule upfront
              - Shows a live count of public fields
              - Anchors the eye-toggle vocabulary the user will see
                on each field below.
            The banner color shifts: primary-tinted when at least one
            field is public (encouraging continuation), neutral-soft
            when zero are public (calm reminder, not red-flag). */}
        <div
          className="mt-5 flex items-start gap-3 rounded-2xl border p-3.5 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background:
              publicCount > 0
                ? 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--card)) 0%, var(--card) 100%)'
                : 'var(--card-soft)',
          }}
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{
              background:
                publicCount > 0
                  ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                  : 'var(--text-soft)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-xs font-bold leading-snug"
              style={{ color: 'var(--ink)' }}
            >
              {publicCount > 0
                ? t('preferences.visibility_banner_some').replace(
                    '{count}',
                    String(publicCount),
                  )
                : t('preferences.visibility_banner_none')}
            </p>
            <p
              className="mt-1 text-[0.7rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('preferences.visibility_banner_hint')}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold tabular-nums"
            style={{
              background: 'var(--ring)',
              color: 'var(--primary)',
            }}
          >
            {publicCount}/{totalCount}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-5">
          {/* Clothing size — single-select chips. */}
          <PrefBlock
            label={t('preferences.clothing_size')}
            publicity={{
              isPublic: visibility.clothingSize,
              onToggle: () => void toggleVisibility('clothingSize'),
            }}
          >
            <ChipRow>
              {CLOTHING_SIZES.map((s) => (
                <Chip
                  key={s}
                  selected={prefs.preferredClothingSize === s}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      preferredClothingSize:
                        p.preferredClothingSize === s ? '' : s,
                    }))
                  }
                >
                  {s}
                </Chip>
              ))}
            </ChipRow>
          </PrefBlock>

          {/* Shoe size — scale chip + MANUAL numeric input.
              Previous design used a chip list of pre-set numbers,
              but real-device feedback showed half-sizes and
              region-edge sizes weren't representable. The number is
              now a free-text input that accepts any value (letters
              or numbers — e.g. "42", "42.5", "10 1/2"). The scale
              still picks EU/US/UK so the string format stays
              stable ("EU 42.5"). */}
          <PrefBlock
            label={t('preferences.shoe_size')}
            publicity={{
              isPublic: visibility.shoeSize,
              onToggle: () => void toggleVisibility('shoeSize'),
            }}
          >
            <div className="flex flex-col gap-2">
              <ChipRow>
                {SHOE_SCALES.map((s) => (
                  <Chip
                    key={s}
                    selected={shoeDraft.scale === s}
                    onClick={() =>
                      setShoe(shoeDraft.scale === s ? '' : s, shoeDraft.num)
                    }
                  >
                    {s}
                  </Chip>
                ))}
              </ChipRow>
              {shoeDraft.scale && (
                <input
                  type="text"
                  inputMode="decimal"
                  value={shoeDraft.num}
                  onChange={(e) => {
                    // Accept digits, an optional dot or fraction
                    // slash, and short fraction characters. Cap
                    // at 8 chars — no one wears a size requiring
                    // more than "42 1/2" length. Reject anything
                    // else silently so a pasted phone number
                    // can't become a shoe size.
                    const raw = e.target.value.slice(0, 8)
                    const clean = raw.replace(/[^0-9./ ]/g, '')
                    setShoe(shoeDraft.scale, clean)
                  }}
                  placeholder={t('preferences.shoe_size_number_placeholder')}
                  aria-label={t('preferences.shoe_size_number_aria')}
                  className="w-32 rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                  }}
                />
              )}
              {/* Scale-without-number nag. Save explicitly persists
                  null when the value isn't complete, so the public
                  profile never shows "EU" alone. The hint warns
                  before the user clicks Save. */}
              {shoeDraft.scale && !shoeDraft.num.trim() && (
                <p
                  className="text-[0.65rem] leading-relaxed"
                  style={{ color: '#D55B6E' }}
                  role="status"
                >
                  {t('preferences.shoe_size_pick_number')}
                </p>
              )}
            </div>
          </PrefBlock>

          {/* Ring size — single-select numeric. */}
          <PrefBlock
            label={t('preferences.ring_size')}
            publicity={{
              isPublic: visibility.ringSize,
              onToggle: () => void toggleVisibility('ringSize'),
            }}
          >
            <ChipRow>
              {RING_SIZES.map((r) => (
                <Chip
                  key={r}
                  selected={prefs.preferredRingSize === r}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      preferredRingSize: p.preferredRingSize === r ? '' : r,
                    }))
                  }
                >
                  {r}
                </Chip>
              ))}
            </ChipRow>
          </PrefBlock>

          {/* Fragrance families — multi-select. */}
          <PrefBlock
            label={t('preferences.perfume')}
            publicity={{
              isPublic: visibility.fragrance,
              onToggle: () => void toggleVisibility('fragrance'),
            }}
          >
            <ChipRow>
              {FRAGRANCE_FAMILIES.map((f) => (
                <Chip
                  key={f}
                  selected={fragranceSet.has(f)}
                  onClick={() => toggleCSV('preferredPerfume', f)}
                >
                  {t(`preferences.fragrance_${f}`)}
                </Chip>
              ))}
            </ChipRow>
          </PrefBlock>

          {/* Favorite colors — multi-select swatches. */}
          <PrefBlock
            label={t('preferences.colors')}
            publicity={{
              isPublic: visibility.colors,
              onToggle: () => void toggleVisibility('colors'),
            }}
          >
            <ul className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((opt) => {
                const selected = colorSet.has(opt.value)
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => toggleCSV('favoriteColors', opt.value)}
                      aria-pressed={selected}
                      aria-label={t(`preferences.color_${opt.value}`)}
                      title={t(`preferences.color_${opt.value}`)}
                      className="qift-press relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95"
                      style={{
                        background: opt.swatch,
                        boxShadow: selected
                          ? '0 0 0 2px var(--card), 0 0 0 4px var(--primary)'
                          : '0 0 0 1px var(--border)',
                      }}
                    >
                      {selected && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={
                            isLightSwatch(opt.swatch) ? '#1A1A1F' : '#fff'
                          }
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden
                        >
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </PrefBlock>

          {/* Favorite gift categories — multi-select. All 12
              categories are visible to everyone. The previous
              iteration filtered this list by "Preference type"
              (male / female / neutral); that layer was removed
              in the simplification pass — preferences stay
              universal and user-driven. */}
          <PrefBlock
            label={t('preferences.categories')}
            publicity={{
              isPublic: visibility.categories,
              onToggle: () => void toggleVisibility('categories'),
            }}
          >
            <ChipRow>
              {GIFT_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  selected={categorySet.has(c)}
                  onClick={() => toggleCSV('favoriteCategories', c)}
                >
                  {t(`preferences.category_${c}`)}
                </Chip>
              ))}
            </ChipRow>
          </PrefBlock>

          {/* Brands — kept as free-text. Brand universe is too wide
              to enumerate; brand names vary by region; a chip set
              would be either incomplete or imposing. The text input
              still benefits from the cleaner styled wrapper below. */}
          <PrefBlock
            label={t('preferences.brands')}
            publicity={{
              isPublic: visibility.brands,
              onToggle: () => void toggleVisibility('brands'),
            }}
          >
            <input
              type="text"
              value={prefs.favoriteBrands}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, favoriteBrands: e.target.value }))
              }
              placeholder={t('preferences.brands_placeholder')}
              maxLength={200}
              autoComplete="off"
              className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
          </PrefBlock>

          {/* Allergies — free-text (range varies widely). */}
          <PrefBlock
            label={t('preferences.allergies')}
            publicity={{
              isPublic: visibility.allergies,
              onToggle: () => void toggleVisibility('allergies'),
            }}
          >
            <textarea
              value={prefs.allergies}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, allergies: e.target.value }))
              }
              placeholder={t('preferences.allergies_placeholder')}
              rows={2}
              maxLength={200}
              className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
          </PrefBlock>

          {/* Gift note — free-text. Plain text only on the public
              surface. Capped at 280 chars; live counter so the user
              can pace their message. */}
          <PrefBlock
            label={t('preferences.gift_note')}
            publicity={{
              isPublic: visibility.giftNote,
              onToggle: () => void toggleVisibility('giftNote'),
            }}
          >
            <textarea
              value={prefs.giftNote}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  giftNote: e.target.value.slice(0, GIFT_NOTE_MAX),
                }))
              }
              placeholder={t('preferences.gift_note_placeholder')}
              rows={3}
              maxLength={GIFT_NOTE_MAX}
              className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            />
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p
                className="text-[0.65rem] leading-relaxed"
                style={{ color: 'var(--muted)' }}
              >
                {t('preferences.gift_note_hint')}
              </p>
              <span
                className="shrink-0 text-[0.65rem] tabular-nums"
                style={{
                  color:
                    prefs.giftNote.length >= GIFT_NOTE_MAX
                      ? '#D55B6E'
                      : 'var(--muted)',
                }}
              >
                {prefs.giftNote.length}/{GIFT_NOTE_MAX}
              </span>
            </div>
          </PrefBlock>

          {/* Accept-surprises toggle. */}
          <button
            type="button"
            onClick={() =>
              setPrefs((p) => ({
                ...p,
                acceptsSurpriseGifts: !p.acceptsSurpriseGifts,
              }))
            }
            className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
            }}
          >
            <span className="flex flex-col text-start">
              <span className="font-semibold">
                {t('preferences.accept_surprises')}
              </span>
              <span
                className="mt-0.5 text-[0.7rem]"
                style={{ color: 'var(--muted)' }}
              >
                {t('preferences.accept_surprises_hint')}
              </span>
            </span>
            <span
              aria-hidden
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{
                background: prefs.acceptsSurpriseGifts
                  ? 'var(--primary)'
                  : 'var(--border-strong)',
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                style={{
                  left: prefs.acceptsSurpriseGifts
                    ? 'calc(100% - 22px)'
                    : '2px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                }}
              />
            </span>
          </button>

          <p
            className="mt-1 text-[0.7rem] leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {t('preferences.privacy_note')}
          </p>

          {/* Live self-preview. Renders exactly what /u/<me> visitors
              will see, driven from the owner's current DRAFT state
              (not the saved DB state) — so toggling an eye chip
              instantly updates the preview without round-tripping
              the server. This is the verification surface that
              closes the "I toggled but nothing shows on my profile"
              feedback loop:
                - If at least one (visibility ON + value SET) pair
                  exists → preview renders the same card a visitor
                  would see, with the same primitives.
                - If nothing is opted-in / no field has a value →
                  preview renders an explicit empty-state card
                  saying "Your preferences card won't appear yet"
                  so the owner immediately understands WHY their
                  public profile shows nothing.
              The mapping function `toPublicPreferences` mirrors the
              backend's `buildPublicPreferencesProjection` byte-for-
              byte so the preview is never wrong about what visitors
              actually see. */}
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="text-[0.65rem] font-semibold uppercase tracking-[0.2em]"
                style={{ color: 'var(--muted)' }}
              >
                {t('preferences.preview_label')}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold"
                style={{
                  background: 'var(--ring)',
                  color: 'var(--primary)',
                }}
              >
                {t('preferences.preview_badge')}
              </span>
            </div>
            <PreferencesPreview prefs={prefs} visibility={visibility} />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/profile"
              className="rounded-full border px-4 py-2 text-xs font-medium"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('social.cancel')}
            </Link>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {submitting ? '…' : t('preferences.save')}
            </button>
          </div>
        </div>
      </section>
    </PageContainer>
  )
}

// One labelled section. Title above, chip / input children below.
// Optional `publicity` slot renders a small eye-toggle next to the
// label that flips this field's public visibility on /u/<username>.
function PrefBlock({
  label,
  children,
  publicity,
}: {
  label: string
  children: React.ReactNode
  publicity?: {
    isPublic: boolean
    onToggle: () => void
  }
}) {
  const { t } = useI18n()
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className="block text-[0.65rem] font-semibold tracking-[0.2em]"
          style={{ color: 'var(--muted)' }}
        >
          {label}
        </span>
        {publicity && (
          // Per-field visibility toggle. Scaled up from a tiny 0.6rem
          // pill to a recognisable 0.7rem chip with explicit
          // "On profile" / "Hidden" copy — the original micro-pill
          // was the discoverability bug behind "shared preferences
          // never appear on my public profile" reports. The toggle
          // is now obviously a control, not page chrome.
          <button
            type="button"
            onClick={publicity.onToggle}
            aria-pressed={publicity.isPublic}
            aria-label={t(
              publicity.isPublic
                ? 'preferences.visibility_toggle_hide'
                : 'preferences.visibility_toggle_show',
            )}
            className="qift-press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition-colors active:scale-95"
            style={{
              borderColor: publicity.isPublic
                ? 'transparent'
                : 'var(--border)',
              background: publicity.isPublic
                ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                : 'var(--card-soft)',
              color: publicity.isPublic
                ? 'var(--primary)'
                : 'var(--text-soft)',
            }}
          >
            <PublicityEye isPublic={publicity.isPublic} />
            <span>
              {t(
                publicity.isPublic
                  ? 'preferences.visibility_chip_public'
                  : 'preferences.visibility_chip_hidden',
              )}
            </span>
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// Tiny eye glyph — open eye for public, slashed eye for private.
// Local twin of components/WishlistProductCard's VisibilityGlyph
// to keep the preferences page self-contained.
function PublicityEye({ isPublic }: { isPublic: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      {isPublic ? (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.5 10.5a2.5 2.5 0 003 3" />
          <path d="M9.4 5.2A10.7 10.7 0 0112 5c6 0 10 7 10 7a18 18 0 01-3.2 3.8" />
          <path d="M6.5 7C3.6 8.7 2 12 2 12s4 7 10 7c1.5 0 2.8-.3 4-.7" />
        </>
      )}
    </svg>
  )
}

// Horizontal chip row. Wraps on small screens; scrolls when very
// many options (rare — most rows fit two lines max).
function ChipRow({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-wrap gap-2">{children}</ul>
}

// Single chip. Tap toggles. Selected = filled primary tint;
// unselected = neutral surface.
function Chip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className="qift-press inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors active:scale-95"
        style={{
          borderColor: selected ? 'transparent' : 'var(--border)',
          background: selected
            ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
            : 'var(--card-soft)',
          color: selected ? 'var(--primary)' : 'var(--text)',
        }}
      >
        {children}
      </button>
    </li>
  )
}

// Helpers.
function parseShoe(s: string): { scale: string; num: string } {
  // Format: "<scale> <num>" e.g. "EU 42" / "US 9".
  const m = s.match(/^(EU|US|UK)\s+(.+)$/i)
  if (!m) return { scale: '', num: '' }
  return { scale: m[1].toUpperCase(), num: m[2].trim() }
}

function parseCSV(s: string): Set<string> {
  return new Set(
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  )
}

// Decide whether a swatch is light enough that the check mark
// should render dark for contrast. Crude luminance approximation —
// good enough for the predefined palette.
function isLightSwatch(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) return false
  const num = parseInt(m[1], 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  // Rec. 709 luma.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.6
}

// ─── Live public-profile preview ─────────────────────────────
//
// Renders exactly what visitors see on /u/<me>, driven from the
// owner's draft state. The mapping below MIRRORS the backend's
// `buildPublicPreferencesProjection` rule-for-rule so the preview
// never lies about what a visitor would actually see.
//
// Empty state matters: when nothing is opted in (or every opted-in
// field has no value), we render an explicit calm message instead
// of a blank card. The owner needs to know WHY their public profile
// shows nothing — not just see "no card" and assume the feature is
// broken (the exact bug this preview surface exists to solve).

function PreferencesPreview({
  prefs,
  visibility,
}: {
  prefs: Preferences
  visibility: Visibility
}) {
  const { t } = useI18n()
  const projected = useMemo(
    () => toPublicPreferences(prefs, visibility),
    [prefs, visibility],
  )

  // Mirror the backend's "return null when nothing publishable"
  // contract. Empty preview gets a calm explanatory tile instead
  // of an invisible nothing.
  if (projected === null) {
    return (
      <div
        className="flex items-start gap-3 rounded-2xl border p-4"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
        }}
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{
            background: 'var(--ring)',
            color: 'var(--text-soft)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a3 3 0 004.2 4.2" />
            <path d="M9.9 4.2A10 10 0 0122 12c-.6 1-1.4 2-2.4 3" />
            <path d="M6.6 6.6A10 10 0 002 12c1.4 2.4 4.3 7 10 7a10 10 0 005.4-1.6" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-bold leading-snug"
            style={{ color: 'var(--ink)' }}
          >
            {t('preferences.preview_empty_title')}
          </p>
          <p
            className="mt-1 text-[0.7rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('preferences.preview_empty_body')}
          </p>
        </div>
      </div>
    )
  }

  // Has at least one (visibility ON + value SET) pair — render the
  // EXACT same primitive used on /u/[username]. Visual identity is
  // identical to the real public profile by design.
  return <PreferencesSection prefs={projected} />
}

// Mirror of the backend `buildPublicPreferencesProjection`. Same
// rules, same return shape, same null-when-empty contract. Keep
// the two in lockstep — if you change one, change the other.
function toPublicPreferences(
  prefs: Preferences,
  visibility: Visibility,
): PublicPreferences | null {
  const out: PublicPreferences = {}
  if (visibility.clothingSize && prefs.preferredClothingSize) {
    out.clothingSize = prefs.preferredClothingSize
  }
  // Shoe size: defensive completeness check matches the backend.
  // A "scale-only" value ("EU") never reaches the preview / wire.
  if (visibility.shoeSize && isCompleteShoeSize(prefs.preferredShoeSize)) {
    out.shoeSize = prefs.preferredShoeSize
  }
  if (visibility.ringSize && prefs.preferredRingSize) {
    out.ringSize = prefs.preferredRingSize
  }
  if (visibility.fragrance && prefs.preferredPerfume) {
    out.fragrance = prefs.preferredPerfume
  }
  if (visibility.colors && prefs.favoriteColors) {
    out.colors = prefs.favoriteColors
  }
  if (visibility.categories && prefs.favoriteCategories) {
    out.categories = prefs.favoriteCategories
  }
  if (visibility.brands && prefs.favoriteBrands) {
    out.brands = prefs.favoriteBrands
  }
  if (visibility.allergies && prefs.allergies) {
    out.allergies = prefs.allergies
  }
  if (visibility.surprises) {
    // Surprise acceptance is a boolean; always emit when opted-in.
    // Even false matters (the public PreferencesSection only renders
    // the row when false, mirroring the "decline is the signal that
    // matters" rule on the public side).
    out.acceptsSurpriseGifts = prefs.acceptsSurpriseGifts
  }
  if (visibility.giftNote && prefs.giftNote.trim()) {
    out.giftNote = prefs.giftNote.trim()
  }
  return Object.keys(out).length === 0 ? null : out
}
