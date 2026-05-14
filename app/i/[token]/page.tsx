'use client'

// Public invite landing page — recipient lands here after the
// sender shares the manual-share link via their own channel
// (Snapchat DM, WhatsApp, email, SMS, etc.).
//
// PRIVACY (load-bearing):
//   - This page renders WITHOUT auth. The recipient may not yet
//     have a Qift account; that's the point of the invite flow.
//   - The public token-resolution endpoint returns ONLY
//     { isValid, expiresAt }. It NEVER reveals:
//       - the sender's identity
//       - the channel the invite was minted for
//       - the platform (for social invites)
//       - whether the recipient's phone/email/handle exists in
//         Qift's user table
//   - The CTA is a generic "Join Qift" / "Sign in" pair. No
//     pre-fill, no auto-link.
//
// SCOPE:
//   - The invite is currently a GENERAL invite link. The MVP
//     doesn't tie invites to a specific gift or payment. The
//     recipient registers → links their accounts → the SENDER
//     can then send a gift via the normal /send flow.
//   - Gift-tied invites (escrow, held payments, recipient-
//     accept-before-charge) are documented as future work in
//     project_invitation_architecture.md.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton from '@/components/Skeleton'
import { fetchInviteByToken, type PublicInviteView } from '@/lib/invites'
import { useI18n } from '@/lib/i18n'

export default function InviteLandingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { t } = useI18n()
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<PublicInviteView | null>(null)
  const [loading, setLoading] = useState(true)

  // Next.js 16: `params` is a Promise (async route segments).
  // Resolve it once on mount.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { token: t } = await params
      if (!cancelled) setToken(t)
    })()
    return () => {
      cancelled = true
    }
  }, [params])

  // Resolve the token against the public endpoint. The endpoint
  // returns isValid=false for any reason (missing / revoked /
  // expired) without revealing which one — same UX either way.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    void (async () => {
      try {
        const result = await fetchInviteByToken(token)
        if (cancelled) return
        setState(result)
      } catch {
        if (!cancelled) setState({ isValid: false, expiresAt: null })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading || !state) {
    return (
      <PageContainer size="md">
        <section className="pt-5">
          <Skeleton className="h-7 w-20" rounded="full" />
          <Skeleton className="mt-4 h-9 w-2/5" />
          <Skeleton className="mt-2 h-9 w-3/5" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-6 h-48 w-full" rounded="3xl" />
        </section>
      </PageContainer>
    )
  }

  if (!state.isValid) {
    return (
      <PageContainer size="md">
        <section className="pt-5 qift-fade-in">
          <PageHeading
            badge={<Badge>{t('invite.badge')}</Badge>}
            line1={t('invite.invalid_title_1')}
            gradient={t('invite.invalid_title_2')}
            subtitle={t('invite.invalid_subtitle')}
            size="sm"
          />

          <Card>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('invite.invalid_body')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/"
                className="inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  color: '#fff',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                {t('invite.cta_home')}
              </Link>
            </div>
          </Card>
        </section>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('invite.badge')}</Badge>}
          line1={t('invite.title_1')}
          gradient={t('invite.title_2')}
          subtitle={t('invite.subtitle')}
          size="sm"
        />

        <Card>
          <h3
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('invite.what_is_qift_title')}
          </h3>
          <p
            className="mt-2 text-xs leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('invite.what_is_qift_body')}
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            <Bullet text={t('invite.bullet_privacy')} />
            <Bullet text={t('invite.bullet_addressless')} />
            <Bullet text={t('invite.bullet_social')} />
          </ul>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/register"
              className="inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                color: '#fff',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {t('invite.cta_register')}
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('invite.cta_login')}
            </Link>
          </div>
        </Card>

        {state.expiresAt && (
          <p
            className="mt-3 text-[0.65rem] text-center"
            style={{ color: 'var(--muted)' }}
          >
            {t('invite.expires_prefix')}{' '}
            {new Date(state.expiresAt).toLocaleDateString()}
          </p>
        )}
      </section>
    </PageContainer>
  )
}

function Bullet({ text }: { text: string }) {
  return (
    <li
      className="flex items-start gap-2 text-xs leading-relaxed"
      style={{ color: 'var(--text-soft)' }}
    >
      <span
        aria-hidden
        className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: 'var(--primary)' }}
      />
      <span>{text}</span>
    </li>
  )
}
