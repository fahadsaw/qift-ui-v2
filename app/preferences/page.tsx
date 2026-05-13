'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

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
}

// Option sets. These live as `const` arrays so the chip components
// stay dumb / display-only — they don't need to know what each
// option means. i18n keys map values to localized labels.

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

const SHOE_SCALES = ['EU', 'US', 'UK'] as const
// Pragmatic numeric ranges per scale. We accept any string anyway,
// so users wearing edge sizes can still bring their value via the
// /preferences API or a future text-fallback.
const SHOE_NUMS_EU = [
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
]
const SHOE_NUMS_US = ['5', '6', '7', '8', '9', '10', '11', '12', '13']
const SHOE_NUMS_UK = ['4', '5', '6', '7', '8', '9', '10', '11', '12']

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
        setPrefs({
          preferredClothingSize: data.preferredClothingSize ?? '',
          preferredShoeSize: data.preferredShoeSize ?? '',
          preferredRingSize: data.preferredRingSize ?? '',
          preferredPerfume: data.preferredPerfume ?? '',
          favoriteColors: data.favoriteColors ?? '',
          favoriteCategories: data.favoriteCategories ?? '',
          favoriteBrands: data.favoriteBrands ?? '',
          allergies: data.allergies ?? '',
          acceptsSurpriseGifts:
            typeof data.acceptsSurpriseGifts === 'boolean'
              ? data.acceptsSurpriseGifts
              : true,
        })
        // Coerce visibility dict to our exact shape. Unknown keys
        // are filtered out; missing keys default to false (private).
        if (data.preferencesVisibility) {
          const v = data.preferencesVisibility
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

  // Shoe-size composite parser. Stored as "EU 42" / "US 9" / "UK 8".
  // Locally we split into scale + number for chip rendering.
  const parsedShoe = parseShoe(prefs.preferredShoeSize)
  const setShoe = (scale: string, num: string) =>
    setPrefs((p) => ({
      ...p,
      preferredShoeSize: scale && num ? `${scale} ${num}` : '',
    }))

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
          preferredShoeSize: prefs.preferredShoeSize.trim() || null,
          preferredRingSize: prefs.preferredRingSize.trim() || null,
          preferredPerfume: prefs.preferredPerfume.trim() || null,
          favoriteColors: prefs.favoriteColors.trim() || null,
          favoriteCategories: prefs.favoriteCategories.trim() || null,
          favoriteBrands: prefs.favoriteBrands.trim() || null,
          allergies: prefs.allergies.trim() || null,
          acceptsSurpriseGifts: prefs.acceptsSurpriseGifts,
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

          {/* Shoe size — scale + numeric. */}
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
                    selected={parsedShoe.scale === s}
                    onClick={() =>
                      setShoe(parsedShoe.scale === s ? '' : s, parsedShoe.num)
                    }
                  >
                    {s}
                  </Chip>
                ))}
              </ChipRow>
              {parsedShoe.scale && (
                <ChipRow>
                  {(parsedShoe.scale === 'EU'
                    ? SHOE_NUMS_EU
                    : parsedShoe.scale === 'US'
                      ? SHOE_NUMS_US
                      : SHOE_NUMS_UK
                  ).map((n) => (
                    <Chip
                      key={n}
                      selected={parsedShoe.num === n}
                      onClick={() =>
                        setShoe(parsedShoe.scale, parsedShoe.num === n ? '' : n)
                      }
                    >
                      {n}
                    </Chip>
                  ))}
                </ChipRow>
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

          {/* Favorite gift categories — multi-select. */}
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

          <div className="mt-2 flex items-center gap-2">
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
