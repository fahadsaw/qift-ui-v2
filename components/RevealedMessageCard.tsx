'use client'

// Premium revealed-message card.
//
// Replaces the plain "media + paragraph" shape that lived inline in
// /gifts/[id]/page.tsx. The new shape treats the sender's words as
// a signature piece:
//   - Decorative quote glyph above the text.
//   - Larger, looser, slightly more emotive type (uses the system
//     serif fallback chain so Arabic falls back to Naskh-style
//     glyphs and Latin to Georgia/Cambria — both feel handwritten-
//     adjacent without shipping a custom font).
//   - Sender attribution row at the bottom with a soft hairline.
//   - Optional media inset above the text, with a tappable expand
//     button that opens the fullscreen MediaLightbox.
//   - Subtle qift-letter-in entry on the text so the words feel
//     like they're "settling in" rather than just appearing.
//
// Pre-delivery (`visible === false`) the card defers to the
// existing locked-state rendering — kept inline in the page so the
// caller can swap them based on backend reveal flags.

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import MediaLightbox from './MediaLightbox'

export default function RevealedMessageCard({
  message,
  mediaUrl,
  mediaType,
  senderName,
  senderHandle,
  anonymous,
  // Heightens the entry animation when the user just tapped to
  // open the gift. Subsequent visits (and senders) get the calm
  // qift-fade-in only.
  emphasised,
}: {
  message: string
  mediaUrl: string | null
  mediaType: 'image' | 'video' | null
  senderName: string
  senderHandle?: string
  anonymous?: boolean
  emphasised?: boolean
}) {
  const { t } = useI18n()
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const hasMedia = !!mediaUrl && (mediaType === 'image' || mediaType === 'video')
  const hasText = !!message.trim()

  return (
    <>
      <div
        className={`mt-4 overflow-hidden rounded-3xl border ${emphasised ? 'qift-reveal-pop' : 'qift-fade-in'}`}
        style={{
          borderColor: 'var(--border)',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--primary) 4%, var(--card)) 0%, var(--card) 60%)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {hasMedia && mediaType === 'image' && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={t('gifts.media_expand')}
            className="group relative block w-full overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #1a1326, #110a1c)',
              maxHeight: 460,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl!}
              alt={t('gifts.detail_message')}
              className="mx-auto block w-full transition-transform duration-300 group-hover:scale-[1.02]"
              style={{
                maxHeight: 460,
                objectFit: 'contain',
              }}
            />
            <ExpandHint />
          </button>
        )}
        {hasMedia && mediaType === 'video' && (
          <ElegantVideoPreview
            url={mediaUrl!}
            onExpand={() => setLightboxOpen(true)}
          />
        )}

        {hasText ? (
          <figure className="px-6 pt-7 pb-6">
            {/* Decorative quote glyph — small, soft, sits above the
                text like a signature mark. RTL-friendly: positioned
                with start-aligned padding so it reads correctly
                regardless of language direction. */}
            <span
              aria-hidden
              className="block text-3xl leading-none"
              style={{
                color:
                  'color-mix(in srgb, var(--primary) 70%, transparent)',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              ❝
            </span>

            <blockquote
              className="qift-letter-in mt-2"
              style={{
                fontFamily:
                  '"Amiri", "Scheherazade New", Georgia, "Times New Roman", serif',
                fontSize: '1.125rem',
                lineHeight: 1.85,
                color: 'var(--ink)',
                letterSpacing: '0.005em',
              }}
            >
              {message}
            </blockquote>

            <figcaption
              className="mt-5 flex items-center gap-2.5 border-t pt-3.5 text-xs"
              style={{
                borderColor: 'var(--hairline)',
                color: 'var(--muted)',
              }}
            >
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full text-[0.7rem] font-bold text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                  fontStyle: anonymous ? 'italic' : undefined,
                }}
              >
                {anonymous
                  ? '?'
                  : (senderName.trim()[0] ?? '·').toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className="text-[0.78rem] font-semibold"
                  style={{
                    color: 'var(--ink)',
                    fontStyle: anonymous ? 'italic' : undefined,
                  }}
                >
                  {senderName}
                </span>
                {senderHandle && !anonymous && (
                  <span
                    dir="ltr"
                    className="text-[0.65rem]"
                    style={{ color: 'var(--muted)' }}
                  >
                    @{senderHandle}
                  </span>
                )}
              </span>
            </figcaption>
          </figure>
        ) : (
          // No text + no media → render a soft "no message" line
          // matching the original card's tone. With media but no
          // text we still skip this block; the media speaks for
          // itself.
          !hasMedia && (
            <p
              className="px-6 py-7 text-center text-sm italic"
              style={{ color: 'var(--muted-2)' }}
            >
              {t('gifts.detail_no_message')}
            </p>
          )
        )}
      </div>

      {lightboxOpen && hasMedia && (
        <MediaLightbox
          url={mediaUrl!}
          type={mediaType!}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  )
}

// Floating "expand" pill that sits in the top-right of an image
// preview. Only visible enough to tell the user the image is
// tappable; doesn't compete with the photo itself.
function ExpandHint() {
  const { t } = useI18n()
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold opacity-0 transition-opacity group-hover:opacity-100"
      style={{
        top: 12,
        insetInlineEnd: 12,
        background: 'rgba(0, 0, 0, 0.55)',
        color: '#fff',
        backdropFilter: 'blur(8px)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
      >
        <path d="M15 3h6v6" />
        <path d="M9 21H3v-6" />
        <path d="M21 3l-7 7" />
        <path d="M3 21l7-7" />
      </svg>
      {t('gifts.media_expand')}
    </span>
  )
}

// Inline video preview with a custom muted-by-default hero state.
// The native browser controls work just fine for playback — we
// just want the *initial* state to feel composed, not "default
// HTML5 video bar". Tapping the play button starts inline
// playback (muted); tapping the expand button opens the lightbox
// where the video autoplays muted with full controls.
function ElegantVideoPreview({
  url,
  onExpand,
}: {
  url: string
  onExpand: () => void
}) {
  const { t } = useI18n()
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <div className="relative">
        <video
          src={url}
          controls
          autoPlay
          muted
          playsInline
          preload="metadata"
          className="block w-full"
          style={{
            maxHeight: 460,
            background: 'linear-gradient(180deg, #1a1326, #110a1c)',
          }}
        />
        <button
          type="button"
          onClick={onExpand}
          aria-label={t('gifts.media_expand')}
          className="absolute z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-95"
          style={{
            top: 12,
            insetInlineEnd: 12,
            background: 'rgba(0, 0, 0, 0.55)',
            color: '#fff',
            backdropFilter: 'blur(8px)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative w-full"
      style={{
        background: 'linear-gradient(180deg, #1a1326, #110a1c)',
        aspectRatio: '4 / 3',
        maxHeight: 460,
      }}
    >
      {/* Poster: a single video frame loaded at low fidelity. We use
          preload="metadata" so the browser fetches just enough to
          render the first frame as a thumbnail without downloading
          the whole file — important on mobile data. */}
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className="block h-full w-full"
        style={{
          objectFit: 'contain',
          opacity: 0.85,
        }}
      />
      {/* Soft scrim so the play button reads against bright frames. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 50%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.45) 100%)',
        }}
      />
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={t('gifts.video_play')}
        className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-all active:scale-95"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow:
            '0 18px 36px -10px color-mix(in srgb, var(--primary) 75%, transparent)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-6 w-6 ps-0.5 text-white"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onExpand}
        aria-label={t('gifts.media_expand')}
        className="absolute z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-95"
        style={{
          top: 12,
          insetInlineEnd: 12,
          background: 'rgba(0, 0, 0, 0.55)',
          color: '#fff',
          backdropFilter: 'blur(8px)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
          <path d="M21 3l-7 7" />
          <path d="M3 21l7-7" />
        </svg>
      </button>
    </div>
  )
}
