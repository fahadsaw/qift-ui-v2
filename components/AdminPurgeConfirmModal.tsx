'use client'

// Permanent-purge confirmation modal — admin-only, super_admin gated.
//
// WHY THIS IS SEPARATE FROM <AdminConfirmModal>
// The disable/restore flow uses a focused two-button confirmation
// (yes / no), which is the right ergonomics for a reversible
// operation. Purge is irreversible — it deserves stronger friction:
//
//   1. Type-to-confirm input. The operator must type the target's
//      qiftUsername EXACTLY (case-sensitive, no auto-correct) before
//      the confirm button enables. This is the same pattern Stripe,
//      GitHub, AWS use for destructive operations — the muscle-memory
//      muscle-tap that fires "Yes, disable" three times in a row
//      while moderating cannot fire "Yes, purge" because typing is
//      deliberate.
//
//   2. Longer unlock delay (3 seconds vs 1). Defends against a
//      misclick on the modal-open transition. The confirm button
//      stays visually present from the start so the operator can
//      see what they're about to commit to, but won't take a
//      click until the delay elapses.
//
//   3. Explicit "what gets released / what gets preserved" body.
//      The operator must know that:
//        - phone / email / qiftUsername become available for
//          re-registration
//        - social-account handles become available for re-link
//        - Gift / Order / Invite / AuditLog history is PRESERVED
//          with an anonymised tombstone owner
//
//   4. Danger tone (red gradient) on the confirm button.
//
// SAFETY POSTURE
//   - Backdrop click + ESC = cancel (only when not busy).
//   - While `busy`, both cancel paths are blocked so an in-flight
//     write can't be abandoned mid-request.
//   - State (the typed username + the unlock flag) resets every
//     time `open` flips false → true, so re-opening the modal for
//     a different user doesn't carry stale input.
//   - The typed value is compared against `targetUsername`
//     INCLUDING leading-@ handling: the operator can type either
//     `sarah_q` or `@sarah_q` (the modal strips the @ before
//     comparison).

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'

type PurgeModalProps = {
  open: boolean
  // The target user's CURRENT qiftUsername (post any rename). The
  // backend re-checks this server-side; surfacing it here lets the
  // operator see the exact string they must type.
  targetUsername: string
  // Optional human name for the preview card. Purely cosmetic —
  // not part of the confirm match.
  targetFullName?: string | null
  busy?: boolean
  // Called with the typed username (post-strip) — caller passes
  // through to the API as `confirmUsername`.
  onConfirm: (confirmUsername: string) => void
  onCancel: () => void
}

export default function AdminPurgeConfirmModal(props: PurgeModalProps) {
  if (!props.open) return null
  // Inner body is keyed to a render-time stable value so the input
  // state + 3-second unlock timer remount cleanly when a new purge
  // dialog opens (e.g. operator cancels for user A, then opens for
  // user B). Mounting inside the open-gated branch is cheaper than
  // adding a useEffect that synchronously resets state — and it
  // sidesteps the React 19 set-state-in-effect lint rule entirely.
  return <PurgeModalBody {...props} key={props.targetUsername} />
}

function PurgeModalBody({
  targetUsername,
  targetFullName,
  busy = false,
  onConfirm,
  onCancel,
}: PurgeModalProps) {
  const { t } = useI18n()
  const [typed, setTyped] = useState('')
  const [unlocked, setUnlocked] = useState<boolean>(false)

  // 3-second unlock timer. Mounts with the modal body (which itself
  // mounts only when open=true, courtesy of the outer gate), so
  // every dialog session starts with a fresh delay.
  useEffect(() => {
    const id = setTimeout(() => setUnlocked(true), 3000)
    return () => clearTimeout(id)
  }, [])

  // ESC = cancel. Same posture as <AdminConfirmModal>: only when
  // not busy, so an in-flight request can't be abandoned.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  // Strip leading @-signs before comparing — operators often paste
  // the handle with the @ prefix. Backend normalisation expects the
  // bare username (the backend re-checks server-side with the same
  // strip).
  const normalisedTyped = typed.replace(/^@+/, '').trim()
  const matches = normalisedTyped === targetUsername
  const confirmDisabled = !unlocked || !matches || busy

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qift-admin-purge-title"
      className="qift-fade-in fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{
        background: 'color-mix(in srgb, var(--bg-base) 78%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        className="m-3 w-full max-w-md rounded-3xl border p-5 backdrop-blur-xl"
        style={{
          borderColor: 'color-mix(in srgb, #D55B6E 35%, var(--border))',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="qift-admin-purge-title"
          className="text-base font-bold tracking-tight"
          style={{ color: '#D55B6E' }}
        >
          {t('admin.purge_title')}
        </h2>

        {/* Irreversible warning. The red tint + the explicit
            "cannot be undone" copy is the visual sign that this
            isn't a normal action. Avoid scare-banner clichés;
            calm + accurate is the right register. */}
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('admin.purge_body_intro')}
        </p>

        {/* Target preview card — the operator sees exactly which
            row they're about to purge before committing. */}
        <div
          className="mt-3 rounded-2xl border px-3 py-2.5"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
          }}
        >
          <p
            className="text-[0.78rem] font-bold"
            style={{ color: 'var(--ink)' }}
            dir="ltr"
          >
            @{targetUsername}
            {targetFullName ? ` — ${targetFullName}` : ''}
          </p>
        </div>

        {/* Released vs preserved breakdown. The operator MUST be
            able to predict the post-purge state — both halves are
            load-bearing for the consent. */}
        <div className="mt-3 grid grid-cols-1 gap-2">
          <div
            className="rounded-xl border px-3 py-2.5 text-[0.78rem] leading-relaxed"
            style={{
              borderColor:
                'color-mix(in srgb, #D55B6E 30%, var(--border))',
              background:
                'color-mix(in srgb, #D55B6E 6%, var(--card-soft))',
            }}
          >
            <p
              className="text-[0.7rem] font-bold tracking-[0.06em]"
              style={{ color: '#D55B6E' }}
            >
              {t('admin.purge_released_label')}
            </p>
            <p className="mt-1" style={{ color: 'var(--ink)' }}>
              {t('admin.purge_released_body')}
            </p>
          </div>

          <div
            className="rounded-xl border px-3 py-2.5 text-[0.78rem] leading-relaxed"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
            }}
          >
            <p
              className="text-[0.7rem] font-bold tracking-[0.06em]"
              style={{ color: 'var(--muted)' }}
            >
              {t('admin.purge_preserved_label')}
            </p>
            <p className="mt-1" style={{ color: 'var(--ink)' }}>
              {t('admin.purge_preserved_body')}
            </p>
          </div>
        </div>

        {/* Type-to-confirm input. The label tells the operator
            exactly what to type; the placeholder echoes the
            target so a quick glance confirms the value. Only
            comes alive when the typed value matches. */}
        <div className="mt-4">
          <label
            className="text-[0.72rem] font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            {t('admin.purge_typed_label')}{' '}
            <span dir="ltr" style={{ color: '#D55B6E' }}>
              @{targetUsername}
            </span>
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`@${targetUsername}`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            className="mt-1.5 w-full rounded-xl border px-3 py-2 text-sm font-mono"
            style={{
              borderColor: matches
                ? 'color-mix(in srgb, #D55B6E 60%, var(--border))'
                : 'var(--border)',
              background: 'var(--card)',
              color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
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
            {t('admin.confirm_cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(normalisedTyped)}
            disabled={confirmDisabled}
            className="qift-press rounded-full px-4 py-2 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background:
                'linear-gradient(135deg, #D55B6E 0%, #B53349 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {busy
              ? '…'
              : !unlocked
                ? t('admin.purge_confirm_unlocking')
                : t('admin.purge_confirm_cta')}
          </button>
        </div>
      </div>
    </div>
  )
}
