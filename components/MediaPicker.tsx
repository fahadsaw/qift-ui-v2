'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'

// Reusable action-sheet picker for camera + gallery. Used by:
//
//   - the avatar editor in /profile (mode='image')
//   - the post composer in /profile (mode='image-and-video')
//   - the gift-media attachment in /send (mode='image-and-video')
//
// Open it by setting `open` to true. The picker renders an
// accessible bottom-sheet with one or four action buttons, plus the
// matching hidden <input type=file> elements. When the user picks a
// source, the OS file/camera UI takes over and `onPicked(file)` fires
// with the chosen File once they confirm. The picker validates mime
// + size before calling `onPicked` — the caller can trust the file
// is the right kind and small enough to upload.
//
// Cancel paths: tapping the backdrop, the X, the "Cancel" row, or
// pressing Esc all call `onClose`. Picking a file calls `onPicked`
// AND then `onClose` so the parent doesn't need to manage both.
//
// Why a bottom-sheet (not a centered dialog): on mobile the bottom
// is the thumb-reachable zone, and Apple/Google action-sheet
// patterns are what users already know. On desktop the sheet pops
// from the bottom but caps its width at the surrounding container,
// so it doesn't look weird at desktop widths.

export type MediaPickerMode = 'image' | 'image-and-video'

type Props = {
  open: boolean
  mode: MediaPickerMode
  onClose: () => void
  onPicked: (file: File) => void
  // Optional: surface a typed reason when validation fails so the
  // caller can render a localized toast. Reasons:
  //   - 'invalid-type' (file is not image/video as required)
  //   - 'too-large-photo'
  //   - 'too-large-video'
  //   - 'empty'
  onError?: (reason: PickerErrorReason) => void
  photoMaxBytes?: number
  videoMaxBytes?: number
  // Optional title shown at the top of the sheet. Defaults to the
  // i18n key `media.picker_title_image` or `_image_video`.
  title?: string
}

export type PickerErrorReason =
  | 'invalid-type'
  | 'too-large-photo'
  | 'too-large-video'
  | 'empty'

const DEFAULT_PHOTO_MAX = 8 * 1024 * 1024
const DEFAULT_VIDEO_MAX = 50 * 1024 * 1024

export default function MediaPicker({
  open,
  mode,
  onClose,
  onPicked,
  onError,
  photoMaxBytes = DEFAULT_PHOTO_MAX,
  videoMaxBytes = DEFAULT_VIDEO_MAX,
  title,
}: Props) {
  const { t } = useI18n()
  const photoGalleryRef = useRef<HTMLInputElement>(null)
  const photoCameraRef = useRef<HTMLInputElement>(null)
  const videoGalleryRef = useRef<HTMLInputElement>(null)
  const videoCameraRef = useRef<HTMLInputElement>(null)

  // Lock body scroll while the sheet is open. Without this the page
  // behind the backdrop scrolls under the user's finger which feels
  // broken on iOS.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Esc-to-close. Captured globally only while the sheet is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    // Reset the input so picking the SAME file again still fires onChange.
    // Without this, "pick → cancel preview → re-pick the exact same file"
    // is a silent no-op because the value didn't change.
    e.target.value = ''
    if (!f) return
    const isImg = f.type.startsWith('image/')
    const isVid = f.type.startsWith('video/')
    if (mode === 'image' && !isImg) {
      onError?.('invalid-type')
      return
    }
    if (mode === 'image-and-video' && !isImg && !isVid) {
      onError?.('invalid-type')
      return
    }
    if (f.size === 0) {
      onError?.('empty')
      return
    }
    if (isImg && f.size > photoMaxBytes) {
      onError?.('too-large-photo')
      return
    }
    if (isVid && f.size > videoMaxBytes) {
      onError?.('too-large-video')
      return
    }
    onPicked(f)
    onClose()
  }

  const sheetTitle =
    title ??
    t(
      mode === 'image'
        ? 'media.picker_title_image'
        : 'media.picker_title_image_video',
    )

  const showVideoActions = mode === 'image-and-video'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={sheetTitle}
    >
      {/* Backdrop. Click to dismiss. The qift-fade-in animation on
          the backdrop pairs with qift-modal-in on the sheet so the
          two enter as one cohesive surface. */}
      <button
        type="button"
        aria-label={t('media.picker_close')}
        onClick={onClose}
        className="qift-fade-in absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      {/* Sheet. max-width caps it on desktop so it doesn't span the
          full viewport. pb safe-area for iPhone home-indicator
          breathing room. The card itself uses the same translucent
          gradient + backdrop blur as the rest of the app's modal
          surfaces. */}
      <div
        className="qift-modal-in relative z-10 w-full max-w-md rounded-t-[2rem] sm:rounded-3xl"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, transparent) 0%, color-mix(in srgb, var(--surface-2) 80%, transparent) 100%)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          boxShadow:
            '0 -22px 60px -22px rgba(58, 30, 80, 0.25), 0 0 0 1px var(--hairline)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)',
        }}
      >
        {/* Drag indicator — purely visual, doesn't actually drag yet.
            Signals "this is a sheet you can dismiss". Only on mobile;
            on desktop the sheet looks like a card and doesn't need
            the affordance. */}
        <div
          aria-hidden
          className="mx-auto mt-2 h-1.5 w-12 rounded-full sm:hidden"
          style={{ background: 'var(--border-strong)' }}
        />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
          <h3
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {sheetTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('media.picker_close')}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors qift-press"
            style={{ background: 'var(--card-soft)', color: 'var(--text-soft)' }}
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

        {/* Action rows. Each is a single tall button (≥ 56pt) so it's
            an unambiguous tap target on mobile. Icon + label, with
            the camera-driven actions placed first because the user
            who came here to "take a new photo" is almost always
            expressing intent rather than reaching for an existing
            file. */}
        <div className="flex flex-col px-3 pb-3">
          <PickerRow
            label={t('media.action_take_photo')}
            sublabel={t('media.action_take_photo_sub')}
            tone="primary"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            }
            onClick={() => photoCameraRef.current?.click()}
          />
          <PickerRow
            label={t('media.action_choose_photo')}
            sublabel={t('media.action_choose_photo_sub')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10.5" r="1.5" />
                <path d="M21 15l-5-5-9 9" />
              </svg>
            }
            onClick={() => photoGalleryRef.current?.click()}
          />
          {showVideoActions && (
            <>
              <PickerRow
                label={t('media.action_record_video')}
                sublabel={t('media.action_record_video_sub')}
                tone="primary"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <circle cx="12" cy="13" r="4" />
                    <path d="M3 7h4l2-3h6l2 3h4v12H3z" />
                  </svg>
                }
                onClick={() => videoCameraRef.current?.click()}
              />
              <PickerRow
                label={t('media.action_choose_video')}
                sublabel={t('media.action_choose_video_sub')}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <rect x="3" y="6" width="13" height="12" rx="2" />
                    <path d="M16 10l5-3v10l-5-3z" />
                  </svg>
                }
                onClick={() => videoGalleryRef.current?.click()}
              />
            </>
          )}
        </div>

        {/* iOS-style "Cancel" row, separated from the action stack.
            Tap target stays generous (h-12) so a thumb-rest at the
            bottom of the screen reliably hits it. */}
        <div className="px-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-colors qift-press"
            style={{
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
              border: '1px solid var(--hairline)',
            }}
          >
            {t('media.picker_cancel')}
          </button>
        </div>

        {/* Hidden inputs — the real OS file pickers. capture="environment"
            tells mobile browsers to default to the rear camera; the
            gallery variants omit `capture` so the OS shows its photo
            library. Desktop browsers ignore `capture` and just open
            the file dialog either way. */}
        <input
          ref={photoCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
        <input
          ref={photoGalleryRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        {showVideoActions && (
          <>
            <input
              ref={videoCameraRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={handleFile}
              className="hidden"
            />
            <input
              ref={videoGalleryRef}
              type="file"
              accept="video/*"
              onChange={handleFile}
              className="hidden"
            />
          </>
        )}
      </div>
    </div>
  )
}

// One row of the action sheet. `tone='primary'` paints the icon tile
// with the primary gradient — used for the camera-driven actions
// (Take photo / Record video) since those are the implied premium
// path. The gallery rows use a subtler neutral tile so the eye lands
// on the camera options first.
function PickerRow({
  label,
  sublabel,
  icon,
  onClick,
  tone = 'neutral',
}: {
  label: string
  sublabel?: string
  icon: React.ReactNode
  onClick: () => void
  tone?: 'primary' | 'neutral'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start transition-colors qift-press"
      style={{ color: 'var(--ink)' }}
    >
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
        style={
          tone === 'primary'
            ? {
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                color: '#fff',
                boxShadow: 'var(--shadow-soft)',
              }
            : {
                background: 'var(--card)',
                color: 'var(--primary)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
              }
        }
      >
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[0.92rem] font-semibold leading-tight">
          {label}
        </span>
        {sublabel && (
          <span
            className="mt-0.5 text-[0.72rem] leading-tight"
            style={{ color: 'var(--muted)' }}
          >
            {sublabel}
          </span>
        )}
      </span>
    </button>
  )
}
