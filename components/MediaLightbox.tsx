'use client'

// Fullscreen media viewer for delivered gift attachments.
//
// Opens when the user taps the inline image/video preview on the
// gift detail page. Renders the media at full viewport with a soft
// dark backdrop, a single close affordance, and tap-to-dismiss on
// the backdrop. For video, the lightbox autoplays muted-by-default
// (browser policy and user-respect: never blast sound at someone
// who tapped a thumbnail). The user can unmute / pause / seek with
// the native HTML5 controls.
//
// Premium notes:
// - Image rendered with object-fit: contain so portraits don't crop.
// - 16px safe-area padding so phones with home indicators / notches
//   don't clip the controls.
// - Close button is finger-sized (44px) and pinned to top-right
//   honouring safe-area-inset-top.
// - qift-lightbox-in keyframe (defined in globals.css) gives the
//   media a subtle scale-up + blur-to-crisp entry — feels considered
//   without being slow.

import { useEffect } from 'react'
import { useI18n } from '@/lib/i18n'

export default function MediaLightbox({
  url,
  type,
  onClose,
}: {
  url: string
  type: 'image' | 'video'
  onClose: () => void
}) {
  const { t } = useI18n()

  // Esc closes. Same pattern as GiftRevealOverlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t('gifts.lightbox_label')}
      onClick={onClose}
      className="qift-fade-in fixed inset-0 z-[70] flex items-center justify-center"
      style={{
        background: 'rgba(8, 5, 14, 0.94)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingInline: 'env(safe-area-inset-left)',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('profile.close')}
        className="absolute z-10 flex h-11 w-11 items-center justify-center rounded-full transition-colors active:scale-95"
        style={{
          top: 'calc(env(safe-area-inset-top) + 12px)',
          insetInlineEnd: '12px',
          background: 'rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(12px)',
          color: '#fff',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Click-target wrapper. Stops bubbling so tapping the media
          itself doesn't dismiss — only the backdrop does. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="qift-lightbox-in flex h-full w-full items-center justify-center px-4"
      >
        {type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={t('gifts.detail_message')}
            className="max-h-full max-w-full rounded-2xl"
            style={{
              objectFit: 'contain',
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
            }}
          />
        ) : (
          <video
            src={url}
            controls
            // Muted-by-default is non-negotiable (autoplay policy +
            // user-respect). The user can tap the speaker icon in
            // the native controls to unmute.
            autoPlay
            muted
            playsInline
            className="max-h-full max-w-full rounded-2xl"
            style={{
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
            }}
          />
        )}
      </div>
    </div>
  )
}
