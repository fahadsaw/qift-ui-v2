'use client'

// Confirmation modal for admin destructive / high-stakes actions.
//
// PURPOSE
// Disable / restore / role-change all share the same UX shape: a
// calm dialog that explains what's about to happen, what records
// it touches, and forces a deliberate confirm tap. The 1-second
// confirm-button delay defends against muscle-memory clicks on
// repeated actions ("disable, disable, disable" while scrolling
// through a moderation queue).
//
// SCOPE LIMIT
// This is a focused two-button confirm dialog — no form inputs,
// no multi-step flows. If a future destructive action needs an
// optional reason or extra fields, build a dedicated component
// for it; reusing this modal for a multi-field flow would force
// it to grow into a generic kitchen-sink component.
//
// SAFETY
// - Backdrop tap = cancel (matches platform convention)
// - ESC = cancel
// - Confirm button starts disabled for `confirmDelaySeconds`
//   to break the click-stream momentum on a repeated workflow
// - All copy is owned by the caller — no localized strings
//   baked into this file so any translation drift stays
//   visible at the call site

import { useEffect, useState } from 'react'

export type AdminConfirmModalTone = 'danger' | 'caution' | 'neutral'

export default function AdminConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'caution',
  busy = false,
  confirmDelaySeconds = 1,
}: {
  open: boolean
  // Plain text or React node. Strings render as-is; nodes (e.g. a
  // bulleted list of effects) render inline so the caller controls
  // the structure.
  title: string
  body: React.ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  // Drives the confirm button colour. `danger` = red (destructive,
  // irreversible-ish); `caution` = amber (soft-delete / restore —
  // the operation IS reversible); `neutral` = primary (no real
  // stakes, just confirming a benign change).
  tone?: AdminConfirmModalTone
  busy?: boolean
  // The confirm button is disabled for this many seconds after the
  // modal opens. Set to 0 to allow immediate confirm (e.g. for a
  // tooling-level confirm that doesn't carry user-state stakes).
  confirmDelaySeconds?: number
}) {
  // Boolean flag that flips to true once `confirmDelaySeconds` has
  // elapsed since the modal opened. State-flag approach (instead
  // of comparing Date.now() against a stamped readyAt during
  // render) keeps the render path pure — the React 19 purity rule
  // rejects Date.now() during render, and the setState approach
  // is exactly the pattern that rule documents as correct.
  const [unlocked, setUnlocked] = useState<boolean>(
    confirmDelaySeconds <= 0,
  )

  useEffect(() => {
    if (!open) {
      // Reset the flag when the modal closes so a subsequent open
      // (e.g. operator dismisses then re-opens for a different
      // user) starts its own delay cycle.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnlocked(confirmDelaySeconds <= 0)
      return
    }
    if (confirmDelaySeconds <= 0) return
    const id = setTimeout(() => {
      setUnlocked(true)
    }, confirmDelaySeconds * 1000)
    return () => clearTimeout(id)
  }, [open, confirmDelaySeconds])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmDisabled = !unlocked || busy

  // Tone → confirm button background. The amber-caution tone matches
  // the closed-beta banner palette used in /terms and /privacy, so
  // operators see a consistent "deliberate but reversible" signal.
  const confirmBg =
    tone === 'danger'
      ? 'linear-gradient(135deg, #D55B6E 0%, #B53349 100%)'
      : tone === 'caution'
        ? 'linear-gradient(135deg, #E89B3A 0%, #B5701F 100%)'
        : 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qift-admin-confirm-title"
      className="qift-fade-in fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{
        background: 'color-mix(in srgb, var(--bg-base) 75%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        // Backdrop click = cancel. Stop propagation on the inner
        // card click below so taps inside the dialog don't bubble.
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="m-3 w-full max-w-md rounded-3xl border p-5 backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="qift-admin-confirm-title"
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h2>
        <div
          className="mt-2 text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {body}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="qift-press rounded-full px-4 py-2 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: confirmBg,
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
