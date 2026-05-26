'use client'

// Account identity card — primary surface for "what does Qift have
// stored about me, and what's its verification state".
//
// WHY THIS EXISTS
// Real-user testing turned up a gap: the Settings page never showed
// the registered phone number, leaving testers unable to verify what
// was actually stored. Backend (/users/me) returns phone +
// phoneVerifiedAt + email + emailVerifiedAt; the frontend just
// never rendered them on this page. (The same fields ARE rendered
// today on /social-accounts, but that surface is a step removed
// from the settings home a user naturally lands on.)
//
// This card displays the FULL phone number — unmasked — because the
// owner is looking at their own settings on their own device. The
// asymmetric counterpart, DiscoverabilityCheck, MASKS the same data
// because it's a "what others would see if they searched for you"
// view. They serve different intents:
//
//   AccountIdentityCard      — "what does Qift have for me?"
//                              Full values, edit affordances, repair
//                              CTAs.
//   DiscoverabilityCheck     — "would I be findable?"
//                              Masked values, per-channel verdict.
//
// EDIT POLICY
// Phone rotation is an auth-level operation (re-OTP required), so
// the inline action is just "manage in linked accounts" → routes to
// /social-accounts where the existing phone display + planned
// secondary-phone flow live. Email editing has an existing
// PATCH /users/me/email path; we route the user there rather than
// re-implementing the editor twice.
//
// REPAIR CTA
// If `phone` is null (defensive — backend register requires phone,
// but a legacy / corrupted row could be missing it), the card
// surfaces a calm "no phone on file" warning + a "fix this" link.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import Skeleton from './Skeleton'

// Shape of GET /users/me — only the fields this card consumes. Any
// other field returned by the backend is ignored (we deliberately
// don't widen this type to the full envelope — keeps the card
// untouched when unrelated fields shift).
type MeResponse = {
  id: string
  qiftUsername: string
  fullName: string | null
  phone: string | null
  email: string | null
  phoneVerifiedAt: string | null
  emailVerifiedAt: string | null
  allowPhoneDiscovery: boolean
  allowEmailDiscovery: boolean
  profileVisibility: 'public' | 'private' | string
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; code: 'unauthorized' | 'server' | 'network' }
  | { kind: 'ready'; me: MeResponse }

export default function AccountIdentityCard() {
  const { t } = useI18n()
  const { accessToken } = useAuth()
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    const ctrl = new AbortController()
    void (async () => {
      setState({ kind: 'loading' })
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        })
        if (cancelled) return
        if (res.status === 401 || res.status === 403) {
          setState({ kind: 'error', code: 'unauthorized' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'error', code: 'server' })
          return
        }
        const me = (await res.json()) as MeResponse
        if (!cancelled) setState({ kind: 'ready', me })
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        if (!cancelled) setState({ kind: 'error', code: 'network' })
      }
    })()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [accessToken])

  if (!accessToken) return null
  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <p
        className="text-[0.78rem] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        {t(
          state.code === 'unauthorized'
            ? 'identity.error_unauthorized'
            : state.code === 'server'
              ? 'identity.error_server'
              : 'identity.error_network',
        )}
      </p>
    )
  }

  const me = state.me
  const phoneVerified = Boolean(me.phoneVerifiedAt)
  const emailVerified = Boolean(me.emailVerifiedAt)
  const phonePresent = Boolean(me.phone && me.phone.trim())
  const emailPresent = Boolean(me.email && me.email.trim())

  return (
    <div className="flex flex-col gap-2.5">
      <IdentityRow
        label={t('identity.row_username')}
        value={`@${me.qiftUsername}`}
        ltr
        chips={[]}
        action={null}
      />

      <IdentityRow
        label={t('identity.row_phone')}
        value={me.phone ?? ''}
        ltr
        // Phone is required at register time; if it's missing here
        // the row is in a broken state. Surface a calm warning +
        // a route into /social-accounts where the planned phone
        // management flow will live (Phase 2 — see doc).
        missing={!phonePresent}
        missingLabel={t('identity.phone_missing')}
        chips={
          phonePresent
            ? [
                {
                  label: phoneVerified
                    ? t('identity.chip_verified')
                    : t('identity.chip_unverified'),
                  tone: phoneVerified ? 'good' : 'warn',
                },
                {
                  label: me.allowPhoneDiscovery
                    ? t('identity.chip_discoverable')
                    : t('identity.chip_not_discoverable'),
                  tone: me.allowPhoneDiscovery ? 'good' : 'neutral',
                },
              ]
            : []
        }
        action={
          phonePresent ? (
            <Link
              href="/social-accounts"
              className="text-[0.7rem] font-semibold underline-offset-4 hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              {t('identity.manage_phone')}
            </Link>
          ) : (
            <Link
              href="/social-accounts"
              className="text-[0.7rem] font-semibold underline-offset-4 hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              {t('identity.repair_phone_cta')}
            </Link>
          )
        }
      />

      <IdentityRow
        label={t('identity.row_email')}
        value={me.email ?? ''}
        ltr
        missing={!emailPresent}
        missingLabel={t('identity.email_missing')}
        chips={
          emailPresent
            ? [
                {
                  label: emailVerified
                    ? t('identity.chip_verified')
                    : t('identity.chip_unverified'),
                  tone: emailVerified ? 'good' : 'warn',
                },
                {
                  label: me.allowEmailDiscovery
                    ? t('identity.chip_discoverable')
                    : t('identity.chip_not_discoverable'),
                  tone: me.allowEmailDiscovery ? 'good' : 'neutral',
                },
              ]
            : []
        }
        action={
          <Link
            href="/social-accounts"
            className="text-[0.7rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            {emailPresent
              ? t('identity.manage_email')
              : t('identity.add_email_cta')}
          </Link>
        }
      />

      <p
        className="mt-1 text-[0.68rem] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        {t('identity.footer_hint')}
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// ROW PRIMITIVE
// ──────────────────────────────────────────────────────────────────

type ChipTone = 'good' | 'warn' | 'neutral'
type Chip = { label: string; tone: ChipTone }

function IdentityRow({
  label,
  value,
  ltr,
  missing,
  missingLabel,
  chips,
  action,
}: {
  label: string
  value: string
  ltr?: boolean
  missing?: boolean
  missingLabel?: string
  chips: Chip[]
  action: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl border px-3 py-2.5"
      style={{
        borderColor: missing
          ? 'color-mix(in srgb, #E89B3A 35%, var(--border))'
          : 'var(--border)',
        background: missing
          ? 'color-mix(in srgb, #E89B3A 8%, var(--card-soft))'
          : 'var(--card-soft)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-[0.7rem] font-semibold tracking-[0.06em]"
          style={{ color: 'var(--muted)' }}
        >
          {label}
        </span>
        {action}
      </div>
      {missing ? (
        <p
          className="mt-1 text-[0.78rem] leading-relaxed"
          style={{ color: '#A45A0F' }}
        >
          ⚠ {missingLabel}
        </p>
      ) : (
        <p
          className="mt-1 text-[0.92rem] font-semibold"
          dir={ltr ? 'ltr' : undefined}
          style={{
            color: 'var(--ink)',
            // Tabular figures for phone digits so the number doesn't
            // shimmy between font weights / RTL contexts.
            fontVariantNumeric: 'tabular-nums',
            wordBreak: 'break-all',
          }}
        >
          {value}
        </p>
      )}
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span
              key={`${i}-${c.label}`}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.62rem] font-bold tracking-[0.06em]"
              style={chipStyle(c.tone)}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function chipStyle(tone: ChipTone): React.CSSProperties {
  if (tone === 'good') {
    return {
      background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
      color: 'var(--primary)',
    }
  }
  if (tone === 'warn') {
    return {
      background: 'color-mix(in srgb, #E89B3A 18%, transparent)',
      color: '#A45A0F',
    }
  }
  return {
    background: 'var(--surface-2)',
    color: 'var(--muted)',
  }
}
