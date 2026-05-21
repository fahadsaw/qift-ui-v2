'use client'

// Phase 2.5b — product-image gallery picker.
//
// Replaces the single `imageUrl` text input on ProductModal with an
// 8-slot ordered gallery. Each existing image gets a tile with a
// reorder + remove affordance; the first tile is the primary image
// (mirrored into Product.imageUrl server-side for backward compat).
// Below the existing tiles, a single "Add image" tap-target offers
// three input modes:
//
//   1. Upload from device   — file picker, `accept="image/*"`.
//   2. Camera capture       — same input + `capture="environment"`,
//                              so a mobile browser opens the rear
//                              camera directly. Hidden when the
//                              underlying input doesn't support
//                              the attribute (desktop falls back
//                              to a file picker, which is fine).
//   3. Paste URL            — expandable inline input for the
//                              legacy URL-paste flow; preserves
//                              the existing workflow for merchants
//                              already on it.
//
// Reorder is up-arrow / down-arrow chevrons (simple for closed
// beta; drag-to-reorder ships as a later polish slice).
//
// Upload happens via lib/productMedia.uploadProductImage. The
// component STAGES uploaded URLs locally; the parent reads them
// out via `value` / `onChange` and only POSTs them to /products
// on save. This means a failed save never loses prior uploads —
// they're still in component state and the user can retry.
//
// PRIVACY / SAFETY
// Every uploaded image lives at a public R2 URL by design
// (storefront products are public). The backend gates ownership at
// upload time (storeId must belong to the viewer). The picker
// surfaces no PII; the file picker hands raw bytes to the backend
// directly via multipart.

import { useCallback, useId, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  uploadProductImage,
  ProductImageUploadError,
} from '@/lib/productMedia'

// Match the backend's MAX_PRODUCT_IMAGES cap. Closed beta starts
// conservative; the limit can be raised by the backend without a
// schema migration.
const MAX_PRODUCT_IMAGES = 8

export type ProductMediaPickerProps = {
  // Auth token for the upload endpoint. Required — the picker
  // cannot stage uploads without it. Parent typically reads from
  // useAuth().
  accessToken: string
  // The store the merchant is editing. Used as the ownership
  // anchor at the upload-endpoint level (the backend rejects an
  // upload whose storeId doesn't belong to the viewer).
  storeId: string
  // Current ordered gallery URLs. The parent owns the source-of-
  // truth state; the picker is a controlled component.
  value: string[]
  onChange: (next: string[]) => void
}

export default function ProductMediaPicker({
  accessToken,
  storeId,
  value,
  onChange,
}: ProductMediaPickerProps) {
  const { t } = useI18n()
  const toast = useToast()
  // Per-tile pending state. Indexed by display position. While
  // uploading, the corresponding tile renders a calm "Uploading…"
  // overlay instead of the image thumb.
  const [uploadingAtEnd, setUploadingAtEnd] = useState(false)
  // Expanded state for the URL-paste fallback. Collapsed by
  // default — the upload + camera affordances are the primary
  // path; URL paste is a fallback that the merchant has to ask
  // for. The expanded value lives inside the picker so reopening
  // the modal doesn't lose what the merchant was typing.
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')

  // One hidden file input drives both "from device" and "camera"
  // modes — the `capture` attribute is toggled via the second
  // hidden input below. Two inputs is the simplest cross-platform
  // path: mobile browsers honour `capture="environment"` to open
  // the rear camera, desktop browsers ignore it and open the
  // standard file picker. Result: same accept-list, two visible
  // buttons, no JS feature detection needed.
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  // Stable ids so the visible label-buttons target the right input
  // for screen readers / keyboard users.
  const galleryInputId = useId()
  const cameraInputId = useId()

  const atCap = value.length >= MAX_PRODUCT_IMAGES

  // ─── Operations ─────────────────────────────────────────────────

  const onPickedFile = useCallback(
    async (file: File) => {
      if (atCap) return
      setUploadingAtEnd(true)
      try {
        const { url } = await uploadProductImage(accessToken, {
          storeId,
          file,
        })
        onChange([...value, url])
      } catch (err) {
        const code =
          err instanceof ProductImageUploadError ? err.code : 'unknown'
        // Map the error code to a calm toast. The user-facing copy
        // doesn't reveal backend internals — just what the user
        // can do next.
        const messageKey =
          code === 'too_large'
            ? 'media_picker.error_too_large'
            : code === 'bad_format'
              ? 'media_picker.error_bad_format'
              : code === 'forbidden'
                ? 'media_picker.error_forbidden'
                : code === 'network'
                  ? 'media_picker.error_network'
                  : 'media_picker.error_unknown'
        toast.show(t(messageKey), { tone: 'error' })
      } finally {
        setUploadingAtEnd(false)
      }
    },
    [accessToken, atCap, onChange, storeId, t, toast, value],
  )

  const onPasteUrl = useCallback(() => {
    if (atCap) return
    const trimmed = urlDraft.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.show(t('media_picker.error_url_invalid'), { tone: 'error' })
      return
    }
    if (value.includes(trimmed)) {
      // Silent no-op + reset — the backend dedupes anyway, but
      // surfacing the dedup avoids the user pasting the same URL
      // four times wondering why nothing happens.
      toast.show(t('media_picker.error_url_duplicate'), { tone: 'error' })
      return
    }
    onChange([...value, trimmed])
    setUrlDraft('')
    setUrlOpen(false)
  }, [atCap, onChange, t, toast, urlDraft, value])

  const onRemove = useCallback(
    (index: number) => {
      if (index < 0 || index >= value.length) return
      const next = value.slice()
      next.splice(index, 1)
      onChange(next)
    },
    [onChange, value],
  )

  const onMove = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= value.length) return
      const next = value.slice()
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      onChange(next)
    },
    [onChange, value],
  )

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
          {t('media_picker.label')}
          <span
            className="ms-1 text-[0.65rem]"
            style={{ color: 'var(--muted)' }}
          >
            {value.length}/{MAX_PRODUCT_IMAGES}
          </span>
        </p>
      </div>
      <p
        className="mt-1 text-[0.7rem] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        {t('media_picker.hint')}
      </p>

      {value.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {value.map((url, idx) => (
            <li key={`${url}-${idx}`}>
              <Tile
                url={url}
                isPrimary={idx === 0}
                canMoveUp={idx > 0}
                canMoveDown={idx < value.length - 1}
                onRemove={() => onRemove(idx)}
                onMoveUp={() => onMove(idx, -1)}
                onMoveDown={() => onMove(idx, 1)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Add-image affordance. Disabled at cap. Buttons go on one
          row when there's space; wrap to two rows on the narrowest
          screens. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          htmlFor={galleryInputId}
          aria-disabled={atCap || uploadingAtEnd}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[0.72rem] font-semibold"
          style={{
            borderColor: 'var(--primary)',
            color: 'var(--primary)',
            background: 'var(--card-soft)',
            opacity: atCap || uploadingAtEnd ? 0.5 : 1,
            cursor: atCap || uploadingAtEnd ? 'not-allowed' : 'pointer',
          }}
        >
          {uploadingAtEnd
            ? t('media_picker.uploading')
            : t('media_picker.upload_device')}
        </label>
        <input
          id={galleryInputId}
          ref={galleryInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/avif"
          disabled={atCap || uploadingAtEnd}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Reset BEFORE the async call so picking the same file
            // again immediately still fires onChange.
            e.target.value = ''
            if (file) void onPickedFile(file)
          }}
        />

        {/* Camera-capture tap-target. Wired to a SEPARATE hidden
            input so the `capture` attribute is set only when the
            merchant explicitly asks for the camera. Mobile browsers
            open the rear camera directly; desktop browsers fall
            back to the standard file picker (acceptable — the
            merchant just sees a file chooser instead of a camera). */}
        <label
          htmlFor={cameraInputId}
          aria-disabled={atCap || uploadingAtEnd}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[0.72rem] font-semibold"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-soft)',
            background: 'var(--card-soft)',
            opacity: atCap || uploadingAtEnd ? 0.5 : 1,
            cursor: atCap || uploadingAtEnd ? 'not-allowed' : 'pointer',
          }}
        >
          {t('media_picker.camera')}
        </label>
        <input
          id={cameraInputId}
          ref={cameraInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/avif"
          capture="environment"
          disabled={atCap || uploadingAtEnd}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void onPickedFile(file)
          }}
        />

        <button
          type="button"
          onClick={() => setUrlOpen((v) => !v)}
          disabled={atCap}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.72rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-soft)',
            background: 'var(--card-soft)',
          }}
        >
          {urlOpen
            ? t('media_picker.url_close')
            : t('media_picker.url_paste')}
        </button>
      </div>

      {urlOpen && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            inputMode="url"
            placeholder="https://"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            dir="ltr"
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onPasteUrl()
              }
            }}
          />
          <button
            type="button"
            onClick={onPasteUrl}
            disabled={!urlDraft.trim()}
            className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              background: 'var(--card-soft)',
            }}
          >
            {t('media_picker.url_add')}
          </button>
        </div>
      )}

      {atCap && (
        <p
          className="mt-2 text-[0.65rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('media_picker.cap_reached')}
        </p>
      )}
    </div>
  )
}

// ─── Single-tile renderer ───────────────────────────────────────

function Tile({
  url,
  isPrimary,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  url: string
  isPrimary: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        aspectRatio: '1 / 1',
      }}
    >
      {/* The thumbnail. Plain <img> here — Next/Image is overkill
          for a 100-150px tile inside a modal, and the merchant's
          R2 origin isn't on the Next.js image-loader allow-list
          without configuration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        // If the URL is broken (legacy data, deleted R2 object),
        // render the broken-image background instead of crashing.
        // The merchant can remove the tile via the trash button.
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.opacity = '0.2'
        }}
      />

      {/* Primary badge. First tile gets the calm Qift-primary
          color; later tiles get nothing. */}
      {isPrimary && (
        <span
          className="absolute top-1.5 start-1.5 rounded-full px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.12em]"
          style={{
            background:
              'color-mix(in srgb, var(--primary) 88%, transparent)',
            color: '#fff',
          }}
        >
          {t('media_picker.primary')}
        </span>
      )}

      {/* Top-right cluster: remove button. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('media_picker.remove')}
        className="absolute top-1.5 end-1.5 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md"
        style={{
          background: 'color-mix(in srgb, #000 38%, transparent)',
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
          className="h-3.5 w-3.5"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Bottom-row: reorder chevrons. Hidden when there's nowhere
          to move (single-tile case → both disabled). */}
      <div
        className="absolute bottom-1.5 start-1.5 flex gap-1"
        style={{ direction: 'ltr' }}
      >
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label={t('media_picker.move_earlier')}
          className="flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md disabled:opacity-30"
          style={{
            background: 'color-mix(in srgb, #000 38%, transparent)',
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
            className="h-3.5 w-3.5"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label={t('media_picker.move_later')}
          className="flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md disabled:opacity-30"
          style={{
            background: 'color-mix(in srgb, #000 38%, transparent)',
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
            className="h-3.5 w-3.5"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
