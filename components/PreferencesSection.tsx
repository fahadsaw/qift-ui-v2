'use client'

import { useI18n } from '@/lib/i18n'
import type { PublicPreferences } from '@/lib/social'

// Read-only preferences section for /u/<username>.
//
// Renders the SAME visual identity as the owner's /preferences page
// (chip groups + color swatches) but with no interactive controls —
// it's purely informational for the viewer who's deciding what to
// send as a gift.
//
// Privacy is already enforced server-side: `preferences` is built by
// the public-profile projection from the owner's per-field
// publicity flags. We render whatever arrives. Missing fields read
// as "this person hasn't shared that yet" — we silently skip the
// row instead of rendering an empty placeholder.
//
// V1 scope (do not extend without a design pass):
//   - No call-to-action chips that mutate (this is a public read-only
//     section).
//   - No comments or reactions.
//   - No "request to share more" prompts — that would be social-
//     media-style nudging, which Qift explicitly avoids.

const COLOR_SWATCHES: Record<string, string> = {
  black: '#1A1A1F',
  white: '#F7F4EF',
  beige: '#D9C7AE',
  rose_gold: '#D9A89A',
  gold: '#D4A85A',
  silver: '#C5C5CC',
  red: '#D64A55',
  pink: '#E89AAE',
  purple: '#9A7DC8',
  blue: '#5A8AC8',
  green: '#6FA882',
  yellow: '#E8C25A',
}

export default function PreferencesSection({
  prefs,
}: {
  prefs: PublicPreferences
}) {
  const { t } = useI18n()

  // If every field is absent (defensive — caller should have already
  // checked), render nothing. The /u/[username] caller wraps this in
  // a `<PublicSection>` so emitting null collapses the section
  // cleanly.
  const fragrance = parseCSV(prefs.fragrance)
  const colors = parseCSV(prefs.colors)
  const categories = parseCSV(prefs.categories)
  const hasAny =
    !!prefs.clothingSize ||
    !!prefs.shoeSize ||
    !!prefs.ringSize ||
    fragrance.length > 0 ||
    colors.length > 0 ||
    categories.length > 0 ||
    !!prefs.brands ||
    !!prefs.allergies ||
    prefs.acceptsSurpriseGifts === false
  if (!hasAny) return null

  return (
    <div className="flex flex-col gap-4">
      {prefs.clothingSize && (
        <PrefRow label={t('preferences.clothing_size')}>
          <ChipDisplay value={prefs.clothingSize} />
        </PrefRow>
      )}
      {prefs.shoeSize && (
        <PrefRow label={t('preferences.shoe_size')}>
          <ChipDisplay value={prefs.shoeSize} />
        </PrefRow>
      )}
      {prefs.ringSize && (
        <PrefRow label={t('preferences.ring_size')}>
          <ChipDisplay value={prefs.ringSize} />
        </PrefRow>
      )}
      {fragrance.length > 0 && (
        <PrefRow label={t('preferences.perfume')}>
          <div className="flex flex-wrap gap-2">
            {fragrance.map((f) => (
              <ChipDisplay key={f} value={t(`preferences.fragrance_${f}`)} />
            ))}
          </div>
        </PrefRow>
      )}
      {colors.length > 0 && (
        <PrefRow label={t('preferences.colors')}>
          <ul className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const swatch = COLOR_SWATCHES[c]
              if (!swatch) return null
              return (
                <li
                  key={c}
                  aria-label={t(`preferences.color_${c}`)}
                  title={t(`preferences.color_${c}`)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    background: swatch,
                    boxShadow: '0 0 0 1px var(--border)',
                  }}
                />
              )
            })}
          </ul>
        </PrefRow>
      )}
      {categories.length > 0 && (
        <PrefRow label={t('preferences.categories')}>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <ChipDisplay key={c} value={t(`preferences.category_${c}`)} />
            ))}
          </div>
        </PrefRow>
      )}
      {prefs.brands && (
        <PrefRow label={t('preferences.brands')}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            {prefs.brands}
          </p>
        </PrefRow>
      )}
      {prefs.allergies && (
        <PrefRow label={t('preferences.allergies')}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            {prefs.allergies}
          </p>
        </PrefRow>
      )}
      {prefs.acceptsSurpriseGifts === false && (
        // Only render when explicitly declining surprises — the
        // default `true` would be noisy on every profile that ever
        // toggled the flag. Decline is the signal that matters.
        <PrefRow label={t('preferences.accept_surprises')}>
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('preferences.surprises_declined')}
          </p>
        </PrefRow>
      )}
    </div>
  )
}

function PrefRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span
        className="mb-1.5 block text-[0.65rem] font-semibold tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

// Read-only chip. Matches the visual identity of the owner's
// /preferences page chip (selected state) so the viewer feels
// continuity between editing and viewing.
function ChipDisplay({ value }: { value: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
      style={{
        borderColor: 'transparent',
        background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
        color: 'var(--primary)',
      }}
    >
      {value}
    </span>
  )
}

function parseCSV(s: string | undefined): string[] {
  if (!s) return []
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}
