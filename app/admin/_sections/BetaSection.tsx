'use client'

// Closed Beta Gate management console.
//
// Surfaces the three /admin/beta/* resources (BetaAccessController):
//   1. Gate status banner   — is BETA_GATE_ENABLED on right now?
//   2. Invite codes         — create, list (with usage), disable/enable.
//   3. Allowlist            — add/remove email / email_domain / phone
//                             entries that bypass the code requirement.
//
// Authorization is server-side: every mutation is gated by
// `beta.manage` (OpsRoleGuard). An operator without it sees a 403,
// which we surface as a calm permission-specific message rather than
// a generic failure. The frontend gating here is UX only.
//
// All wire calls go through lib/betaAccess.ts; BetaApiError carries
// the backend's typed `code` so we can map failures to translated,
// specific copy.

import { useCallback, useEffect, useState } from 'react'
import Skeleton from '@/components/Skeleton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  BetaApiError,
  BETA_ALLOWLIST_KINDS,
  type BetaAllowlistEntry,
  type BetaAllowlistKind,
  type BetaInviteCode,
  type BetaStatus,
  addBetaAllowlistEntry,
  createBetaCode,
  fetchBetaStatus,
  listBetaAllowlist,
  listBetaCodes,
  removeBetaAllowlistEntry,
  setBetaCodeDisabled,
} from '@/lib/betaAccess'

// Map a BetaApiError to a translated, specific message. Falls back to
// the generic admin-action failure for anything unmapped (e.g. a 502
// from a flaky upstream that never carries a typed `code`).
function betaErrorMessage(
  err: unknown,
  t: (k: string) => string,
): string {
  if (err instanceof BetaApiError) {
    switch (err.code) {
      case 'beta_code_required':
        return t('admin.beta_error_code_required')
      case 'beta_max_uses_invalid':
        return t('admin.beta_error_max_uses_invalid')
      case 'beta_expires_at_invalid':
        return t('admin.beta_error_expires_invalid')
      case 'beta_code_taken':
        return t('admin.beta_error_code_taken')
      case 'beta_code_not_found':
        return t('admin.beta_error_code_not_found')
      case 'beta_allowlist_kind_invalid':
        return t('admin.beta_error_allowlist_kind_invalid')
      case 'beta_allowlist_value_invalid':
        return t('admin.beta_error_allowlist_value_invalid')
      case 'beta_allowlist_duplicate':
        return t('admin.beta_error_allowlist_duplicate')
      case 'beta_allowlist_not_found':
        return t('admin.beta_error_allowlist_not_found')
      default:
        // 403 with no typed code = RBAC denial (operator lacks
        // beta.manage). Surface it as a permission message.
        if (err.status === 403) return t('admin.beta_error_forbidden')
        return t('admin.action_failed')
    }
  }
  return t('admin.action_failed')
}

export function BetaSection({
  accessToken,
}: {
  accessToken: string | null
}) {
  const { t } = useI18n()
  const toast = useToast()

  const [status, setStatus] = useState<BetaStatus | null>(null)
  const [codes, setCodes] = useState<BetaInviteCode[] | null>(null)
  const [allowlist, setAllowlist] = useState<BetaAllowlistEntry[] | null>(null)
  // Set once if the very first load 403s — the whole section is then
  // read-as-forbidden (operator lacks beta.manage). We still render
  // the explanatory copy rather than empty lists.
  const [forbidden, setForbidden] = useState(false)

  const refreshCodes = useCallback(async () => {
    if (!accessToken) return
    try {
      setCodes(await listBetaCodes(accessToken))
    } catch (err) {
      if (err instanceof BetaApiError && err.status === 403) {
        setForbidden(true)
      }
      setCodes([])
    }
  }, [accessToken])

  const refreshAllowlist = useCallback(async () => {
    if (!accessToken) return
    try {
      setAllowlist(await listBetaAllowlist(accessToken))
    } catch (err) {
      if (err instanceof BetaApiError && err.status === 403) {
        setForbidden(true)
      }
      setAllowlist([])
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const s = await fetchBetaStatus(accessToken)
        if (!cancelled) setStatus(s)
      } catch (err) {
        if (
          !cancelled &&
          err instanceof BetaApiError &&
          err.status === 403
        ) {
          setForbidden(true)
        }
      }
      await refreshCodes()
      await refreshAllowlist()
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, refreshCodes, refreshAllowlist])

  if (forbidden) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
        {t('admin.beta_error_forbidden')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p
        className="text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.beta_intro')}
      </p>

      <GateStatusBanner status={status} />

      <CodesPanel
        accessToken={accessToken}
        codes={codes}
        toast={toast}
        onChanged={refreshCodes}
      />

      <AllowlistPanel
        accessToken={accessToken}
        entries={allowlist}
        toast={toast}
        onChanged={refreshAllowlist}
      />
    </div>
  )
}

// ── Gate status banner ──────────────────────────────────────────────

function GateStatusBanner({ status }: { status: BetaStatus | null }) {
  const { t } = useI18n()
  if (status === null) {
    return <Skeleton className="h-16 w-full" rounded="2xl" />
  }
  const on = status.gateEnabled
  return (
    <div
      className="rounded-2xl border p-3.5"
      style={{
        borderColor: on
          ? 'color-mix(in srgb, #3FA46A 45%, var(--border))'
          : 'color-mix(in srgb, #E89B3A 45%, var(--border))',
        background: on
          ? 'color-mix(in srgb, #3FA46A 8%, var(--card))'
          : 'color-mix(in srgb, #E89B3A 8%, var(--card))',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
          {on ? t('admin.beta_gate_on') : t('admin.beta_gate_off')}
        </p>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.6rem] font-bold tracking-[0.08em]"
          style={{
            background: on
              ? 'color-mix(in srgb, #3FA46A 18%, transparent)'
              : 'color-mix(in srgb, #E89B3A 18%, transparent)',
            color: on ? '#3FA46A' : '#E89B3A',
          }}
        >
          {on ? t('admin.beta_gate_on_chip') : t('admin.beta_gate_off_chip')}
        </span>
      </div>
      <p
        className="mt-1.5 text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {on ? t('admin.beta_gate_on_hint') : t('admin.beta_gate_off_hint')}
      </p>
    </div>
  )
}

// ── Invite codes ────────────────────────────────────────────────────

function CodesPanel({
  accessToken,
  codes,
  toast,
  onChanged,
}: {
  accessToken: string | null
  codes: BetaInviteCode[] | null
  toast: ReturnType<typeof useToast>
  onChanged: () => Promise<void>
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const onCreate = async () => {
    if (!accessToken || creating) return
    setCreating(true)
    try {
      const maxUsesNum = maxUses.trim() ? Number(maxUses.trim()) : null
      await createBetaCode(accessToken, {
        code: customCode.trim() || undefined,
        label: label.trim() || undefined,
        maxUses:
          maxUsesNum !== null && Number.isFinite(maxUsesNum)
            ? maxUsesNum
            : null,
        // <input type="date"> yields YYYY-MM-DD; widen to an ISO
        // instant at end-of-day UTC so a same-day code stays valid
        // through the chosen date. Empty = never expires.
        expiresAt: expiresAt.trim()
          ? new Date(`${expiresAt.trim()}T23:59:59.000Z`).toISOString()
          : null,
      })
      setLabel('')
      setCustomCode('')
      setMaxUses('')
      setExpiresAt('')
      toast.show(t('admin.beta_code_created_toast'))
      await onChanged()
    } catch (err) {
      toast.show(betaErrorMessage(err, t), { tone: 'error' })
    } finally {
      setCreating(false)
    }
  }

  const onToggleDisabled = async (code: BetaInviteCode) => {
    if (!accessToken || busyId) return
    const nextDisabled = !code.disabledAt
    setBusyId(code.id)
    try {
      await setBetaCodeDisabled(accessToken, code.id, nextDisabled)
      toast.show(
        nextDisabled
          ? t('admin.beta_code_disabled_toast')
          : t('admin.beta_code_enabled_toast'),
      )
      await onChanged()
    } catch (err) {
      toast.show(betaErrorMessage(err, t), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3
        className="text-sm font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('admin.beta_codes_title')}
      </h3>

      {/* Create-code form. All fields optional: empty custom code →
          backend auto-generates QIFT-XXXX-XXXX; empty maxUses →
          unlimited; empty expiry → never expires. */}
      <div
        className="flex flex-col gap-2 rounded-2xl border p-3"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <p
          className="text-[0.62rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--muted)' }}
        >
          {t('admin.beta_create_code_title')}
        </p>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('admin.beta_code_label_ph')}
          className="rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
        <input
          type="text"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value)}
          placeholder={t('admin.beta_code_custom_ph')}
          dir="ltr"
          autoCapitalize="characters"
          spellCheck={false}
          className="rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder={t('admin.beta_max_uses_ph')}
            className="flex-1 rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
            }}
          />
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            aria-label={t('admin.beta_expires_ph')}
            className="flex-1 rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={creating}
          className="self-start rounded-full border px-4 py-1.5 text-[0.72rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: 'transparent',
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            color: '#fff',
          }}
        >
          {t('admin.beta_create_cta')}
        </button>
      </div>

      {/* Codes list */}
      {codes === null ? (
        <Skeleton className="h-20 w-full" rounded="2xl" />
      ) : codes.length === 0 ? (
        // PR 8 — empty state with a next action instead of bare text.
        <div
          className="rounded-2xl border px-4 py-5 text-center"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            {t('admin.beta_codes_empty')}
          </p>
          <p
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.beta_codes_empty_hint')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {codes.map((c) => {
            const disabled = Boolean(c.disabledAt)
            const expired =
              c.expiresAt !== null && new Date(c.expiresAt) <= new Date()
            const exhausted =
              c.maxUses !== null && c.usedCount >= c.maxUses
            return (
              <li
                key={c.id}
                className="rounded-2xl border p-3 backdrop-blur-md"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  opacity: disabled ? 0.85 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="truncate font-mono text-sm font-bold"
                      style={{ color: 'var(--ink)' }}
                      dir="ltr"
                    >
                      {c.code}
                    </p>
                    {c.label && (
                      <p
                        className="mt-0.5 truncate text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {c.label}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {disabled && (
                      <Chip color="#D55B6E">
                        {t('admin.beta_code_disabled_chip')}
                      </Chip>
                    )}
                    {!disabled && expired && (
                      <Chip color="#E89B3A">
                        {t('admin.beta_code_expired_chip')}
                      </Chip>
                    )}
                    {!disabled && !expired && exhausted && (
                      <Chip color="#E89B3A">
                        {t('admin.beta_code_exhausted_chip')}
                      </Chip>
                    )}
                  </div>
                </div>
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  <span className="tabular-nums">
                    {c.maxUses === null
                      ? `${t('admin.beta_code_uses')}: ${c.usedCount} · ${t('admin.beta_code_unlimited')}`
                      : `${t('admin.beta_code_uses')}: ${c.usedCount} / ${c.maxUses}`}
                  </span>
                  {c.expiresAt && (
                    <span>
                      {t('admin.beta_code_expires_at')}:{' '}
                      {new Date(c.expiresAt).toLocaleDateString('ar-SA')}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {/* PR 8 — one-tap copy so the operator can paste a
                      code straight into WhatsApp/iMessage. Clipboard
                      API needs a secure context; failures degrade to
                      a calm error toast. */}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(c.code)
                        .then(() => toast.show(t('admin.beta_code_copied')))
                        .catch(() =>
                          toast.show(t('admin.beta_code_copy_failed'), {
                            tone: 'error',
                          }),
                        )
                    }}
                    className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors"
                    style={{
                      borderColor:
                        'color-mix(in srgb, var(--primary) 35%, var(--border))',
                      background:
                        'color-mix(in srgb, var(--primary) 10%, var(--card-soft))',
                      color: 'var(--primary)',
                    }}
                  >
                    {t('admin.beta_copy_cta')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onToggleDisabled(c)}
                    disabled={busyId === c.id}
                    className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: disabled
                        ? 'color-mix(in srgb, var(--primary) 35%, var(--border))'
                        : 'color-mix(in srgb, #D55B6E 35%, var(--border))',
                      background: disabled
                        ? 'color-mix(in srgb, var(--primary) 10%, var(--card-soft))'
                        : 'color-mix(in srgb, #D55B6E 8%, var(--card-soft))',
                      color: disabled ? 'var(--primary)' : '#D55B6E',
                    }}
                  >
                    {disabled
                      ? t('admin.beta_enable_cta')
                      : t('admin.beta_disable_cta')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Allowlist ───────────────────────────────────────────────────────

function AllowlistPanel({
  accessToken,
  entries,
  toast,
  onChanged,
}: {
  accessToken: string | null
  entries: BetaAllowlistEntry[] | null
  toast: ReturnType<typeof useToast>
  onChanged: () => Promise<void>
}) {
  const { t } = useI18n()
  const [kind, setKind] = useState<BetaAllowlistKind>('email')
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const onAdd = async () => {
    if (!accessToken || adding || !value.trim()) return
    setAdding(true)
    try {
      await addBetaAllowlistEntry(accessToken, {
        kind,
        value: value.trim(),
        label: label.trim() || undefined,
      })
      setValue('')
      setLabel('')
      toast.show(t('admin.beta_allowlist_added_toast'))
      await onChanged()
    } catch (err) {
      toast.show(betaErrorMessage(err, t), { tone: 'error' })
    } finally {
      setAdding(false)
    }
  }

  const onRemove = async (id: string) => {
    if (!accessToken || busyId) return
    setBusyId(id)
    try {
      await removeBetaAllowlistEntry(accessToken, id)
      toast.show(t('admin.beta_allowlist_removed_toast'))
      await onChanged()
    } catch (err) {
      toast.show(betaErrorMessage(err, t), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3
        className="text-sm font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('admin.beta_allowlist_title')}
      </h3>

      <div
        className="flex flex-col gap-2 rounded-2xl border p-3"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <p
          className="text-[0.62rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--muted)' }}
        >
          {t('admin.beta_add_allowlist_title')}
        </p>
        {/* Kind picker — email / email_domain / phone. */}
        <div className="flex flex-wrap gap-1.5">
          {BETA_ALLOWLIST_KINDS.map((k) => {
            const active = kind === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors"
                style={{
                  borderColor: active ? 'var(--primary)' : 'var(--border)',
                  background: active ? 'var(--ring)' : 'var(--card-soft)',
                  color: active ? 'var(--primary)' : 'var(--text-soft)',
                }}
              >
                {t(`admin.beta_allowlist_kind_${k}`)}
              </button>
            )
          })}
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t(`admin.beta_allowlist_value_ph_${kind}`)}
          dir="ltr"
          autoCapitalize="none"
          spellCheck={false}
          className="rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('admin.beta_allowlist_label_ph')}
          className="rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={adding || !value.trim()}
          className="self-start rounded-full border px-4 py-1.5 text-[0.72rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: 'transparent',
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            color: '#fff',
          }}
        >
          {t('admin.beta_add_cta')}
        </button>
      </div>

      {entries === null ? (
        <Skeleton className="h-20 w-full" rounded="2xl" />
      ) : entries.length === 0 ? (
        // PR 8 — empty state with a next action instead of bare text.
        <div
          className="rounded-2xl border px-4 py-5 text-center"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            {t('admin.beta_allowlist_empty')}
          </p>
          <p
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.beta_allowlist_empty_hint')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-2xl border p-3 backdrop-blur-md"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
              }}
            >
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-bold"
                  style={{ color: 'var(--ink)' }}
                  dir="ltr"
                >
                  {e.value}
                </p>
                <p
                  className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  <Chip color="var(--primary)">
                    {t(`admin.beta_allowlist_kind_${e.kind}`) || e.kind}
                  </Chip>
                  {e.label && <span className="truncate">{e.label}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onRemove(e.id)}
                disabled={busyId === e.id}
                className="shrink-0 rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor:
                    'color-mix(in srgb, #D55B6E 35%, var(--border))',
                  background:
                    'color-mix(in srgb, #D55B6E 8%, var(--card-soft))',
                  color: '#D55B6E',
                }}
              >
                {t('admin.beta_remove_cta')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Shared ──────────────────────────────────────────────────────────

function Chip({
  color,
  children,
}: {
  color: string
  children: React.ReactNode
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-bold tracking-[0.06em]"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
      }}
    >
      {children}
    </span>
  )
}
