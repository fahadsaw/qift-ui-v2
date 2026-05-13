'use client'

import { useI18n } from '@/lib/i18n'
import type { PublicPreferences } from '@/lib/social'

// Read-only preferences section for /u/<username>.
//
// Self-contained card: header + chip rows together. The /u/[username]
// caller just mounts <PreferencesSection> with no wrapping — this
// component owns its visual anchor.
//
// Why a card with header (not bare chips):
//   - On real-device usage, bare chip rows between the action bar
//     and the tabs read as "accidental scattered UI" rather than
//     "preferences card". A premium-calm card with a clear label
//     ("Gifting preferences") tells the viewer what they're looking
//     at without needing to read the tiny chip labels.
//   - The card style stays LIGHT: subtle border, soft primary-tinted
//     background. Not dashboard-heavy; reads as "helpful gifting
//     context" per the storefront-refinement direction.
//
// Privacy is already enforced server-side: `preferences` is built by
// the public-profile projection from the owner's per-field
// publicity flags (`buildPublicPreferencesProjection`). We render
// whatever arrives. Missing fields read as "this person hasn't
// shared that yet" — we silently skip the row instead of rendering
// an empty placeholder.
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

  // Defensive guard — emit null when no shared field has a value.
  // The caller already gates on `profile.preferences` being defined,
  // but a backend regression that ships an empty object should still
  // collapse cleanly here.
  const fragrance = parseCSV(prefs.fragrance)
  const colors = parseCSV(prefs.colors)
  const categories = parseCSV(prefs.categories)
  // Defensive shoe-size check — mirror of the backend
  // isCompleteShoeSize. A scale-only value ("EU") never renders.
  const shoeSizeOk = !!prefs.shoeSize && /^(EU|US|UK)\s+\S+/.test(prefs.shoeSize.trim())
  const hasAny =
    !!prefs.clothingSize ||
    shoeSizeOk ||
    !!prefs.ringSize ||
    fragrance.length > 0 ||
    colors.length > 0 ||
    categories.length > 0 ||
    !!prefs.brands ||
    !!prefs.allergies ||
    prefs.acceptsSurpriseGifts === false ||
    (prefs.gender === 'male' || prefs.gender === 'female') ||
    !!prefs.giftNote
  if (!hasAny) return null

  return (
    <section
      // Calm card. Subtle border + primary-tinted background so the
      // section reads as "helpful gifting context" rather than
      // floating chips. The tint is intentionally LIGHT (8% mix) —
      // any heavier and the card starts to compete with the action
      // row above it.
      className="rounded-2xl border p-4 backdrop-blur-md"
      aria-label={t('preferences.public_section_title')}
      style={{
        borderColor: 'var(--border)',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, var(--card)) 0%, var(--card) 100%)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      {/* Header. Sparkle glyph + label so the card is instantly
          recognizable as a gifting-signal surface (not "settings",
          not "profile data"). The label uses the SAME translation
          key the dashboard already had — preserves continuity if
          the merchant team wants to A/B copy later. */}
      <header className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M12 2l1.7 4.5L18 8l-4.3 1.5L12 14l-1.7-4.5L6 8l4.3-1.5z" />
            <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="text-sm font-bold leading-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('preferences.public_section_title')}
          </h2>
          <p
            className="mt-0.5 text-[0.65rem] leading-snug"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('preferences.public_section_hint')}
          </p>
        </div>
      </header>
      <div className="flex flex-col gap-3.5">
      {prefs.clothingSize && (
        <PrefRow label={t('preferences.clothing_size')}>
          <ChipDisplay value={prefs.clothingSize} />
        </PrefRow>
      )}
      {shoeSizeOk && (
        <PrefRow label={t('preferences.shoe_size')}>
          <ChipDisplay value={prefs.shoeSize as string} />
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
      {(prefs.gender === 'male' || prefs.gender === 'female') && (
        <PrefRow label={t('preferences.gender')}>
          <ChipDisplay value={t(`preferences.gender_${prefs.gender}`)} />
        </PrefRow>
      )}
      {prefs.giftNote && (
        // Free-text note. Plain string only — no markdown, no
        // auto-linked URLs, no rich rendering. CSS wrap so a long
        // note stays inside the card.
        <PrefRow label={t('preferences.gift_note')}>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}
          >
            {prefs.giftNote}
          </p>
        </PrefRow>
      )}
      </div>
    </section>
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
