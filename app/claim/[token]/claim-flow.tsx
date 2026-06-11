'use client'

// Corporate claim flow — the recipient-facing journey (CF PR 5
// frontend). Stages, in privacy order:
//
//   teaser    → fully GENERIC: "a gift is waiting" + a masked
//               channel hint. NO name, NO company, NO gift (F1).
//   otp       → 6-digit code sent to the channel bound server-side.
//   revealed  → identity echo ("Hi Sara — a gift from Acme") + the
//               gift + the campaign message. "This isn't me" and
//               decline are first-class exits here.
//   address   → delivery address with coverage error handling
//               (out-of-coverage is calm and retryable).
//   claimed   → done. Irrevocable server-side.
//
// Dead links (missing / expired / finalized) are indistinguishable
// by contract — the invalid screen never guesses which case it is.

import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import OtpInput from '@/components/OtpInput'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useI18n } from '@/lib/i18n'
import {
  ClaimApiError,
  clearClaimSession,
  declineClaim,
  fetchClaimTeaser,
  notMeClaim,
  readClaimSession,
  revealClaim,
  sendClaimOtp,
  storeClaimSession,
  submitClaimAddress,
  verifyClaimOtp,
  type ClaimReveal,
} from '@/lib/claim'

type Stage =
  | 'loading'
  | 'invalid'
  | 'teaser'
  | 'otp'
  | 'revealed'
  | 'address'
  | 'claimed'
  | 'declined'
  | 'notme'

const OTP_LENGTH = 6
const RESEND_SECONDS = 60

const GCC_COUNTRIES = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'] as const

export default function ClaimFlow({ token }: { token: string }) {
  const { t } = useI18n()

  const [stage, setStage] = useState<Stage>('loading')
  const [channelHint, setChannelHint] = useState('')
  const [channel, setChannel] = useState<'phone' | 'email'>('phone')
  const [session, setSession] = useState<string | null>(null)
  const [claim, setClaim] = useState<ClaimReveal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // OTP stage
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)

  // Confirm sub-states for the two exits on the reveal screen.
  const [confirmExit, setConfirmExit] = useState<'decline' | 'notme' | null>(
    null,
  )

  // Address form
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState<string>('SA')
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [line1, setLine1] = useState('')
  const [notes, setNotes] = useState('')
  const [coverageBlocked, setCoverageBlocked] = useState(false)

  const errText = useCallback(
    (e: unknown): string => {
      const code = e instanceof ClaimApiError ? e.code : 'unknown_error'
      const key = `claim.err.${code}`
      const translated = t(key)
      // Unknown codes fall back to the generic line instead of
      // leaking a raw key to the recipient.
      return translated === key ? t('claim.err.unknown_error') : translated
    },
    [t],
  )

  // ── Boot: stored session → straight to reveal; else teaser ───────
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      const stored = readClaimSession(token)
      if (stored) {
        try {
          const res = await revealClaim(token, stored)
          if (cancelled) return
          setSession(stored)
          setClaim(res.claim)
          setStage('revealed')
          return
        } catch {
          clearClaimSession(token)
        }
      }
      try {
        const teaser = await fetchClaimTeaser(token)
        if (cancelled) return
        setChannelHint(teaser.channelHint)
        setChannel(teaser.channel)
        setStage('teaser')
      } catch {
        if (!cancelled) setStage('invalid')
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [token])

  // Resend cooldown tick.
  useEffect(() => {
    if (resendIn <= 0) return
    const id = setInterval(() => setResendIn((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [resendIn])

  // A dead claim mid-flow (expired, finalized elsewhere) collapses
  // to the generic invalid screen; a dead session re-runs OTP.
  const handleFlowError = useCallback(
    (e: unknown) => {
      if (e instanceof ClaimApiError) {
        if (e.status === 404) {
          setStage('invalid')
          return
        }
        if (e.code === 'claim_session_invalid') {
          clearClaimSession(token)
          setSession(null)
          setCode('')
          setError(t('claim.err.claim_session_invalid'))
          setStage('otp')
          return
        }
      }
      setError(errText(e))
    },
    [errText, t, token],
  )

  // ── Actions ──────────────────────────────────────────────────────

  const onSendOtp = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await sendClaimOtp(token)
      setChannelHint(res.channelHint)
      setResendIn(RESEND_SECONDS)
      setCode('')
      setStage('otp')
    } catch (e) {
      if (e instanceof ClaimApiError && e.status === 404) setStage('invalid')
      else setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const onVerify = async (value?: string) => {
    const otpCode = (value ?? code).trim()
    if (otpCode.length !== OTP_LENGTH || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await verifyClaimOtp(token, otpCode)
      storeClaimSession(token, res.sessionToken)
      setSession(res.sessionToken)
      setClaim(res.claim)
      setStage('revealed')
    } catch (e) {
      setCode('')
      if (e instanceof ClaimApiError && e.status === 404) setStage('invalid')
      else setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const onExit = async (kind: 'decline' | 'notme') => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      if (kind === 'decline') await declineClaim(token, session)
      else await notMeClaim(token, session)
      clearClaimSession(token)
      setStage(kind === 'decline' ? 'declined' : 'notme')
    } catch (e) {
      handleFlowError(e)
    } finally {
      setBusy(false)
      setConfirmExit(null)
    }
  }

  const onSubmitAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session || busy) return
    setBusy(true)
    setError(null)
    setCoverageBlocked(false)
    try {
      await submitClaimAddress(token, session, {
        fullName: fullName.trim() || undefined,
        phone: phone.trim(),
        country,
        city: city.trim(),
        district: district.trim() || undefined,
        line1: line1.trim(),
        notes: notes.trim() || undefined,
      })
      clearClaimSession(token)
      setStage('claimed')
    } catch (err) {
      if (err instanceof ClaimApiError && err.code === 'address_out_of_coverage') {
        setCoverageBlocked(true)
      } else {
        handleFlowError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  // ── Render helpers ───────────────────────────────────────────────

  const panelStyle = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
  } as const

  const gift = claim?.gift

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md pb-16 pt-4">
        {/* ── Loading ─────────────────────────────────────────── */}
        {stage === 'loading' && (
          <p
            className="mt-12 text-center text-sm"
            style={{ color: 'var(--muted)' }}
          >
            {t('claim.loading')}
          </p>
        )}

        {/* ── Invalid / dead link (generic by contract) ───────── */}
        {stage === 'invalid' && (
          <div className="mt-8 rounded-2xl p-6 text-center" style={panelStyle}>
            <PageHeading
              line1={t('claim.invalid_title_1')}
              gradient={t('claim.invalid_title_2')}
              subtitle={t('claim.invalid_body')}
              size="sm"
            />
          </div>
        )}

        {/* ── Stage 1: generic teaser (F1 — nothing identifying) ─ */}
        {stage === 'teaser' && (
          <>
            <PageHeading
              badge={<Badge>{t('claim.badge')}</Badge>}
              line1={t('claim.teaser_title_1')}
              gradient={t('claim.teaser_title_2')}
              subtitle={t('claim.teaser_body')}
              size="md"
            />
            <div className="mt-6 rounded-2xl p-5" style={panelStyle}>
              <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                {channel === 'email'
                  ? t('claim.teaser_channel_email')
                  : t('claim.teaser_channel_phone')}
              </p>
              <p
                className="mt-1 text-base font-semibold tracking-wide"
                style={{ color: 'var(--ink)', direction: 'ltr' }}
              >
                {channelHint}
              </p>
              {error && (
                <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
              )}
              <div className="mt-4">
                <PrimaryButton
                  onClick={() => void onSendOtp()}
                  disabled={busy}
                  loading={busy}
                >
                  {t('claim.send_code')}
                </PrimaryButton>
              </div>
              <p className="mt-3 text-xs" style={{ color: 'var(--muted-2)' }}>
                {t('claim.teaser_privacy_note')}
              </p>
            </div>
          </>
        )}

        {/* ── Stage 2: OTP ────────────────────────────────────── */}
        {stage === 'otp' && (
          <>
            <PageHeading
              badge={<Badge>{t('claim.badge')}</Badge>}
              line1={t('claim.otp_title_1')}
              gradient={t('claim.otp_title_2')}
              subtitle={`${t('claim.otp_sent_to')} ${channelHint}`}
              size="sm"
            />
            <div className="mt-6 rounded-2xl p-5" style={panelStyle}>
              <OtpInput
                length={OTP_LENGTH}
                value={code}
                onChange={(next) => {
                  setCode(next)
                  setError(null)
                }}
                onComplete={(full) => void onVerify(full)}
                autoFocus
                disabled={busy}
                error={!!error}
              />
              {error && (
                <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
              )}
              <div className="mt-4">
                <PrimaryButton
                  onClick={() => void onVerify()}
                  disabled={busy || code.length !== OTP_LENGTH}
                  loading={busy}
                >
                  {t('claim.verify')}
                </PrimaryButton>
              </div>
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => void onSendOtp()}
                  disabled={busy || resendIn > 0}
                  className="text-xs underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
                  style={{ color: 'var(--muted)' }}
                >
                  {resendIn > 0
                    ? `${t('claim.resend_wait')} (${resendIn})`
                    : t('claim.resend')}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Stage 3: identity echo + reveal ─────────────────── */}
        {stage === 'revealed' && claim && (
          <>
            <PageHeading
              badge={<Badge>{t('claim.badge')}</Badge>}
              line1={`${t('claim.hello')} ${claim.recipientName} 👋`}
              gradient={`${t('claim.gift_from')} ${claim.orgDisplayName}`}
              size="sm"
            />

            <div className="mt-6 rounded-2xl p-5" style={panelStyle}>
              {gift?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={gift.imageUrl}
                  alt={gift.productName ?? ''}
                  className="mb-4 h-44 w-full rounded-xl object-cover"
                />
              ) : null}
              <p
                className="text-lg font-bold"
                style={{ color: 'var(--ink)' }}
              >
                {gift?.productName ?? t('claim.gift_generic')}
              </p>
              {gift?.storeName && (
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  {t('claim.from_store')} {gift.storeName}
                </p>
              )}
              {claim.message && (
                <blockquote
                  className="mt-4 rounded-xl px-4 py-3 text-sm leading-relaxed"
                  style={{
                    background:
                      'color-mix(in srgb, var(--primary) 8%, transparent)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {claim.message}
                </blockquote>
              )}
              {error && (
                <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
              )}

              {confirmExit === null ? (
                <>
                  <div className="mt-5 flex flex-col gap-2">
                    <PrimaryButton
                      onClick={() => {
                        setError(null)
                        setStage('address')
                      }}
                    >
                      {t('claim.accept_cta')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => {
                        if (!busy) setConfirmExit('decline')
                      }}
                    >
                      {t('claim.decline_cta')}
                    </SecondaryButton>
                  </div>
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={() => setConfirmExit('notme')}
                      className="text-xs underline-offset-2 hover:underline"
                      style={{ color: 'var(--muted)' }}
                    >
                      {t('claim.not_me')}
                    </button>
                  </div>
                </>
              ) : (
                <div
                  className="mt-5 rounded-xl border p-4"
                  style={{ borderColor: 'var(--border-strong)' }}
                >
                  <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                    {confirmExit === 'decline'
                      ? t('claim.decline_confirm')
                      : t('claim.notme_confirm')}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <PrimaryButton
                      onClick={() => void onExit(confirmExit)}
                      disabled={busy}
                      loading={busy}
                      showArrow={false}
                    >
                      {t('claim.confirm_yes')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => {
                        if (!busy) setConfirmExit(null)
                      }}
                    >
                      {t('claim.confirm_back')}
                    </SecondaryButton>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Stage 4: address ────────────────────────────────── */}
        {stage === 'address' && claim && (
          <>
            <PageHeading
              badge={<Badge>{t('claim.badge')}</Badge>}
              line1={t('claim.address_title_1')}
              gradient={t('claim.address_title_2')}
              subtitle={t('claim.address_intro')}
              size="sm"
            />

            <form
              onSubmit={(e) => void onSubmitAddress(e)}
              className="mt-6 flex flex-col gap-4 rounded-2xl p-5"
              style={panelStyle}
            >
              {coverageBlocked && (
                <div
                  className="rounded-xl px-4 py-3 text-sm leading-relaxed"
                  style={{
                    background:
                      'color-mix(in srgb, var(--danger) 10%, transparent)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {t('claim.coverage_blocked')}
                </div>
              )}

              <Field
                label={t('claim.f_name')}
                optional={t('claim.optional')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
              <Field
                label={t('claim.f_phone')}
                requiredMark
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                dirOverride="ltr"
                inputMode="tel"
                autoComplete="tel"
                helper={t('claim.f_phone_help')}
              />

              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold tracking-[0.2em]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('claim.f_country')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {GCC_COUNTRIES.map((c) => {
                    const active = country === c
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setCountry(c)}
                        className="rounded-xl border px-2 py-2 text-sm font-medium transition-colors"
                        style={{
                          borderColor: active
                            ? 'color-mix(in srgb, var(--primary) 60%, transparent)'
                            : 'var(--border)',
                          background: active
                            ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                            : 'var(--card)',
                          color: active ? 'var(--ink)' : 'var(--text-soft)',
                        }}
                      >
                        {t(`claim.country.${c}`)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Field
                label={t('claim.f_city')}
                requiredMark
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
              />
              <Field
                label={t('claim.f_district')}
                optional={t('claim.optional')}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
              <Field
                label={t('claim.f_line1')}
                requiredMark
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                autoComplete="street-address"
              />
              <Field
                label={t('claim.f_notes')}
                optional={t('claim.optional')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                rows={2}
              />

              {error && (
                <p className="text-sm" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
              )}

              <PrimaryButton
                type="submit"
                disabled={
                  busy || !phone.trim() || !city.trim() || !line1.trim()
                }
                loading={busy}
              >
                {t('claim.address_submit')}
              </PrimaryButton>
              <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
                {t('claim.address_privacy_note')}
              </p>
              <SecondaryButton
                onClick={() => {
                  if (busy) return
                  setError(null)
                  setCoverageBlocked(false)
                  setStage('revealed')
                }}
              >
                {t('claim.back')}
              </SecondaryButton>
            </form>
          </>
        )}

        {/* ── Terminal states ─────────────────────────────────── */}
        {stage === 'claimed' && (
          <div className="mt-8 rounded-2xl p-6 text-center" style={panelStyle}>
            <PageHeading
              line1={t('claim.done_title_1')}
              gradient={t('claim.done_title_2')}
              subtitle={t('claim.done_body')}
              size="sm"
            />
          </div>
        )}
        {stage === 'declined' && (
          <div className="mt-8 rounded-2xl p-6 text-center" style={panelStyle}>
            <PageHeading
              line1={t('claim.declined_title')}
              gradient={t('claim.declined_title_2')}
              subtitle={t('claim.declined_body')}
              size="sm"
            />
          </div>
        )}
        {stage === 'notme' && (
          <div className="mt-8 rounded-2xl p-6 text-center" style={panelStyle}>
            <PageHeading
              line1={t('claim.notme_title')}
              gradient={t('claim.notme_title_2')}
              subtitle={t('claim.notme_body')}
              size="sm"
            />
          </div>
        )}
      </div>
    </PageContainer>
  )
}
