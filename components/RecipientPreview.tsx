'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

// Recipient identity preview card. Renders the public-safe profile
// summary the sender needs to confirm "is this the right person?"
// before paying.
//
// Used in two places, with the same visual contract:
//
//   - /send: under the username field, the moment the live
//     /users/check call resolves to an existing recipient.
//
//   - /checkout: at the top of the summary, above the gift card.
//     The user has to consciously look at this person before
//     pressing Pay & send.
//
// What we render (intentionally narrow):
//   - Avatar (uploaded image OR gradient initials fallback)
//   - Display name (or fallback to "@username" if no full name set)
//   - @username on its own line, in LTR
//   - Public/private chip — driven by Profile.visibility, just so a
//     wrong-username collision shows up visually (sending to a
//     private account with the same handle reads differently)
//   - Optional safety-line: "Make sure this is the right recipient"
//
// What we DELIBERATELY do not render — even when the API would let
// us pull the data from a sibling endpoint:
//   - phone / email / address / city
//   - gift counts (sent / received)
//   - wishlist items
//   - size or scent preferences
//   - private gift history
// The sender doesn't need any of those to confirm identity; surfacing
// them would erode the recipient's privacy posture and tempt scope
// creep over time. Single-purpose card.

export type RecipientSummary = {
  qiftUsername: string
  // Server returns `null` when the recipient hasn't set a display
  // name. We fall back to "@username" in the render path.
  fullName: string | null
  avatarUrl: string | null
  // Either 'public' or 'private'. Anything else is normalised to
  // 'public' downstream — defensive, and matches the User schema's
  // default.
  profileVisibility: 'public' | 'private' | string
}

type Variant =
  // /send card. Compact, tucked under the recipient field. Shows the
  // "make sure this is right" safety line.
  | 'compact'
  // /checkout card. Larger, top-of-page. Shows a "you're sending to"
  // lead-in instead of the safety line — the checkout page IS the
  // confirmation, so the framing is "here's who, ready to pay?"
  | 'confirm'

type Props = {
  recipient: RecipientSummary
  variant: Variant
}

export default function RecipientPreview({ recipient, variant }: Props) {
  const { t } = useI18n()

  // Normalise visibility so "private" is the only non-public value
  // that triggers the alternate chip; anything else (including a
  // legacy server returning 'followers' or similar) is shown as
  // public — better-safe-default.
  const isPrivate = recipient.profileVisibility === 'private'

  // Display-name fallback. We never show an empty string in the
  // header position; the @handle takes over if the user hasn't set
  // a display name. Gives the card a stable height regardless.
  const displayName =
    recipient.fullName?.trim() && recipient.fullName.trim().length > 0
      ? recipient.fullName.trim()
      : `@${recipient.qiftUsername}`

  // Initials for the avatar fallback. Up to two characters from the
  // first whitespace-separated parts of the display name, falling
  // back to the first two of the username so the gradient disc is
  // never blank.
  const initials = (() => {
    const fromName = displayName
      .replace(/^@/, '')
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
    return fromName || recipient.qiftUsername.slice(0, 2).toUpperCase()
  })()

  const isCompact = variant === 'compact'

  return (
    <div
      className="qift-fade-in flex items-start gap-3 rounded-2xl border p-3.5 backdrop-blur-md"
      style={{
        borderColor: isCompact
          ? 'var(--border)'
          : 'color-mix(in srgb, var(--primary) 35%, var(--border))',
        background: isCompact ? 'var(--surface-2)' : 'var(--card)',
        boxShadow: isCompact ? undefined : 'var(--shadow-soft)',
      }}
    >
      {/* Avatar. 56 px on the confirm card so it has presence at
          checkout; 48 px on the compact card so it doesn't crowd
          the form. The gradient fallback uses the same primary →
          accent stops as the rest of the app's identity surfaces. */}
      <div
        aria-hidden
        className={`relative shrink-0 overflow-hidden rounded-2xl text-white ${
          isCompact ? 'h-12 w-12 text-base' : 'h-14 w-14 text-lg'
        } flex items-center justify-center font-bold`}
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {recipient.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipient.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden>{initials}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!isCompact && (
          <p
            className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('recipient.confirm_kicker')}
          </p>
        )}
        <div
          className={`flex items-center gap-1.5 ${isCompact ? '' : 'mt-1'}`}
        >
          <h3
            className="truncate text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {displayName}
          </h3>
          {/* Public / private chip. Helps the sender notice if they
              picked a private account with the same handle as the
              public one they meant. */}
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold"
            style={{
              background: isPrivate
                ? 'color-mix(in srgb, var(--muted) 18%, transparent)'
                : 'color-mix(in srgb, var(--primary) 12%, transparent)',
              color: isPrivate ? 'var(--muted)' : 'var(--primary)',
            }}
          >
            {isPrivate
              ? t('recipient.badge_private')
              : t('recipient.badge_public')}
          </span>
        </div>
        <p
          className="mt-0.5 truncate text-xs"
          dir="ltr"
          style={{ color: 'var(--muted)' }}
        >
          @{recipient.qiftUsername}
        </p>
        {isCompact && (
          <p
            className="mt-1.5 text-[0.7rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('recipient.compact_safety')}
          </p>
        )}
      </div>

      {/* On the confirm card, give the sender a one-tap escape: a
          small "View profile" link (opens /u/:username in a new tab
          so it doesn't blow away the checkout state). Compact card
          omits this — the same link sits below the field on /send. */}
      {!isCompact && (
        <Link
          href={`/u/${recipient.qiftUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="qift-press shrink-0 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {t('recipient.view_profile')}
        </Link>
      )}
    </div>
  )
}
