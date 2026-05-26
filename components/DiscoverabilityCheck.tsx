'use client'

// Discoverability self-check card.
//
// Surfaced in /settings so a user can see, in plain language, how
// other Qift users would find them right now — and which channels
// are currently dark. Plugs the hole left by the search surface's
// self-exclusion rule (the user can't simply "search for myself"
// to verify they're findable; the search deliberately filters
// the viewer's own row out of results).
//
// READ-ONLY. No mutations. The card pulls /users/me + /social-
// accounts/me and projects the verdicts client-side — no new
// backend endpoint, no new authorization surface.
//
// What it shows, per channel:
//
//   QIFT USERNAME            Always findable when public.
//   PHONE                    findable | hidden — explains which
//                            gate is blocking (allowPhoneDiscovery
//                            off, or profileVisibility=private).
//   EMAIL                    findable | hidden — same shape.
//   SOCIAL (per linked acct) findable | hidden — currently every
//                            linked account is searchable (Qift
//                            doesn't expose a separate per-platform
//                            discoverability toggle); the card just
//                            shows the stored handle so the user
//                            can verify it's what they expect.
//
// Privacy: surfaces the user's OWN data only. The phone is masked
// (last 4 digits visible) so a shoulder-surfer can't read the
// full number, but the format is preserved so the user can
// confirm the stored E.164 matches what they registered with.

import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import Skeleton from './Skeleton'

// Shape of GET /users/me — only the fields this card consumes.
type MeResponse = {
  id: string
  qiftUsername: string
  phone: string | null
  email: string | null
  phoneVerifiedAt: string | null
  emailVerifiedAt: string | null
  profileVisibility: 'public' | 'private' | string
  allowPhoneDiscovery: boolean
  allowEmailDiscovery: boolean
}

// Shape of GET /social-accounts/me rows.
type SocialAccount = {
  id: string
  platform: string
  handle: string
  url?: string | null
  verificationLevel?: string
  verified?: boolean
  isPrimary?: boolean
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; code: 'unauthorized' | 'server' | 'network' }
  | { kind: 'ready'; me: MeResponse; socials: SocialAccount[] }

export default function DiscoverabilityCheck() {
  const { t, lang } = useI18n()
  const { accessToken } = useAuth()
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  useEffect(() => {
    // Logout would unmount /settings entirely (auth-gated route),
    // so accessToken null on mount means "not logged in yet" —
    // bail without firing the fetch. We don't reset state to
    // 'idle' here because doing setState synchronously inside an
    // effect trips the project's react-hooks/set-state-in-effect
    // lint rule. `idle` is already the initial useState value.
    if (!accessToken) return
    let cancelled = false
    const ctrl = new AbortController()
    void (async () => {
      setState({ kind: 'loading' })
      try {
        const [meRes, socialsRes] = await Promise.all([
          fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          }),
          fetch(`${API_BASE}/social-accounts/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          }),
        ])
        if (cancelled) return
        if (meRes.status === 401 || socialsRes.status === 401) {
          setState({ kind: 'error', code: 'unauthorized' })
          return
        }
        if (!meRes.ok || !socialsRes.ok) {
          setState({ kind: 'error', code: 'server' })
          return
        }
        const me = (await meRes.json()) as MeResponse
        const socials = (await socialsRes.json()) as SocialAccount[]
        if (cancelled) return
        setState({ kind: 'ready', me, socials })
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
            ? 'discoverability.error_unauthorized'
            : state.code === 'server'
              ? 'discoverability.error_server'
              : 'discoverability.error_network',
        )}
      </p>
    )
  }

  const isPrivate = state.me.profileVisibility === 'private'
  // The four/five channel verdicts.
  const rows: Row[] = [
    qiftUsernameRow(state.me, isPrivate, lang),
    phoneRow(state.me, isPrivate, lang),
    emailRow(state.me, isPrivate, lang),
    ...state.socials.map((s) => socialRow(s, lang)),
  ]

  return (
    <div className="flex flex-col gap-2.5">
      {isPrivate && (
        <p
          className="rounded-xl px-3 py-2 text-[0.7rem] leading-relaxed"
          style={{
            background:
              'color-mix(in srgb, #E89B3A 14%, var(--card-soft))',
            color: 'var(--ink)',
          }}
        >
          {t('discoverability.private_banner')}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <RowItem key={row.key} row={row} />
        ))}
      </ul>
      <p
        className="mt-1 text-[0.68rem] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        {t('discoverability.footer_hint')}
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// ROW MODEL
// ──────────────────────────────────────────────────────────────────

type RowVerdict = 'findable' | 'hidden' | 'unset'

type Row = {
  key: string
  channelLabel: string
  // The exact stored value the backend search would compare against
  // — already normalized at write time. Surfaced verbatim so the
  // user can spot a typo / wrong country code immediately. Empty
  // string when the channel isn't set up yet.
  storedValue: string
  verdict: RowVerdict
  // Plain-language explanation when verdict !== 'findable'. Empty
  // for findable rows (the channelLabel + storedValue carries the
  // confirmation).
  reasonKey: string | null
}

// Mask a phone — keep dial code + last 4 digits. Phone storage is
// already in E.164 so we know "+966501234567" → "+966••••4567".
function maskPhone(e164: string): string {
  if (!e164) return ''
  // Find where the local-MSISDN begins (after +<dialcode>). The
  // simplest heuristic: keep the leading +<countrycode> up to 4
  // chars then mask the middle and keep the last 4.
  const match = e164.match(/^(\+\d{1,3})(\d+)(\d{4})$/)
  if (!match) return e164
  const [, dial, , tail] = match
  return `${dial} •••• ${tail}`
}

function maskEmail(email: string): string {
  if (!email) return ''
  const at = email.indexOf('@')
  if (at < 1) return email
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 2) return `${local}${domain}`
  return `${local[0]}${'•'.repeat(Math.min(local.length - 2, 4))}${local.slice(-1)}${domain}`
}

function qiftUsernameRow(me: MeResponse, isPrivate: boolean, lang: string): Row {
  return {
    key: 'qift',
    channelLabel:
      lang === 'ar' ? 'اسم المستخدم في قِفت' : 'Qift username',
    storedValue: `@${me.qiftUsername}`,
    verdict: isPrivate ? 'hidden' : 'findable',
    reasonKey: isPrivate ? 'discoverability.reason_private_profile' : null,
  }
}

function phoneRow(me: MeResponse, isPrivate: boolean, lang: string): Row {
  const stored = me.phone ?? ''
  if (!stored) {
    return {
      key: 'phone',
      channelLabel: lang === 'ar' ? 'رقم الجوّال' : 'Phone',
      storedValue: '',
      verdict: 'unset',
      reasonKey: 'discoverability.reason_phone_unset',
    }
  }
  if (isPrivate) {
    return {
      key: 'phone',
      channelLabel: lang === 'ar' ? 'رقم الجوّال' : 'Phone',
      storedValue: maskPhone(stored),
      verdict: 'hidden',
      reasonKey: 'discoverability.reason_private_profile',
    }
  }
  if (!me.allowPhoneDiscovery) {
    return {
      key: 'phone',
      channelLabel: lang === 'ar' ? 'رقم الجوّال' : 'Phone',
      storedValue: maskPhone(stored),
      verdict: 'hidden',
      reasonKey: 'discoverability.reason_phone_off',
    }
  }
  return {
    key: 'phone',
    channelLabel: lang === 'ar' ? 'رقم الجوّال' : 'Phone',
    storedValue: maskPhone(stored),
    verdict: 'findable',
    reasonKey: null,
  }
}

function emailRow(me: MeResponse, isPrivate: boolean, lang: string): Row {
  const stored = me.email ?? ''
  if (!stored) {
    return {
      key: 'email',
      channelLabel: lang === 'ar' ? 'البريد الإلكتروني' : 'Email',
      storedValue: '',
      verdict: 'unset',
      reasonKey: 'discoverability.reason_email_unset',
    }
  }
  if (isPrivate) {
    return {
      key: 'email',
      channelLabel: lang === 'ar' ? 'البريد الإلكتروني' : 'Email',
      storedValue: maskEmail(stored),
      verdict: 'hidden',
      reasonKey: 'discoverability.reason_private_profile',
    }
  }
  if (!me.allowEmailDiscovery) {
    return {
      key: 'email',
      channelLabel: lang === 'ar' ? 'البريد الإلكتروني' : 'Email',
      storedValue: maskEmail(stored),
      verdict: 'hidden',
      reasonKey: 'discoverability.reason_email_off',
    }
  }
  return {
    key: 'email',
    channelLabel: lang === 'ar' ? 'البريد الإلكتروني' : 'Email',
    storedValue: maskEmail(stored),
    verdict: 'findable',
    reasonKey: null,
  }
}

// Platform display label. Kept local rather than re-using the
// /search FIELD_LABELS so this card doesn't depend on the search
// page's internal mapping (which could change with a UX redesign).
const PLATFORM_LABEL_AR: Record<string, string> = {
  snapchat: 'سناب شات',
  tiktok: 'تيك توك',
  instagram: 'إنستغرام',
  x: 'إكس (تويتر)',
  facebook: 'فيسبوك',
  youtube: 'يوتيوب',
  threads: 'ثريدز',
  telegram: 'تيليجرام',
}
const PLATFORM_LABEL_EN: Record<string, string> = {
  snapchat: 'Snapchat',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  facebook: 'Facebook',
  youtube: 'YouTube',
  threads: 'Threads',
  telegram: 'Telegram',
}

function socialRow(account: SocialAccount, lang: string): Row {
  const platformLabel =
    (lang === 'ar' ? PLATFORM_LABEL_AR : PLATFORM_LABEL_EN)[
      account.platform
    ] ?? account.platform
  return {
    key: `social-${account.id}`,
    channelLabel: platformLabel,
    // Show the EXACT stored handle (already normalized at write
    // time). If the user reports search isn't finding them, the
    // stored handle here is the literal value the backend
    // compares against — if it doesn't match what they typed in
    // the search box, that's the bug.
    storedValue: `@${account.handle}`,
    verdict: 'findable',
    reasonKey: null,
  }
}

// ──────────────────────────────────────────────────────────────────
// ROW VIEW
// ──────────────────────────────────────────────────────────────────

function RowItem({ row }: { row: Row }) {
  const { t } = useI18n()
  const pillColor =
    row.verdict === 'findable'
      ? 'var(--primary)'
      : row.verdict === 'hidden'
        ? '#D55B6E'
        : 'var(--muted)'
  const pillLabel =
    row.verdict === 'findable'
      ? t('discoverability.pill_findable')
      : row.verdict === 'hidden'
        ? t('discoverability.pill_hidden')
        : t('discoverability.pill_unset')

  return (
    <li
      className="rounded-2xl border px-3 py-2.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-[0.78rem] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {row.channelLabel}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[0.62rem] font-bold tracking-[0.06em]"
          style={{
            background: `color-mix(in srgb, ${pillColor} 14%, transparent)`,
            color: pillColor,
          }}
        >
          {pillLabel}
        </span>
      </div>
      {row.storedValue && (
        <p
          className="mt-1 text-[0.78rem]"
          dir="ltr"
          style={{
            color: 'var(--text-soft)',
            fontFamily:
              row.key === 'phone' ? 'var(--font-geist-mono), monospace' : undefined,
          }}
        >
          {row.storedValue}
        </p>
      )}
      {row.reasonKey && (
        <p
          className="mt-1 text-[0.7rem] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {t(row.reasonKey)}
        </p>
      )}
    </li>
  )
}
