'use client'

// Change-phone modal (PR 5 — platform stabilization).
//
// Two calm steps over the backend's OTP-verified flow:
//   1. phone — dial-code picker + national digits (identical
//      composition rules to the register form, so the E.164 we
//      submit keys the same Otp row the backend dispatches to)
//      → POST /users/me/change-phone/start
//   2. code  — 6-digit OtpInput + resend with a 60s cooldown
//      → POST /users/me/change-phone/confirm
//
// The session proves account ownership; the code proves NEW-number
// ownership. On success the backend returns the fresh /users/me
// envelope — passed back via onChanged so the identity card
// re-hydrates without a refetch.
//
// Error mapping is code-based (same envelope contract as register):
//   invalid_phone / phone_unchanged / phone_taken → inline on step 1
//   otp_rate_limited / sms_unavailable            → inline on step 1
//   invalid_code / expired_code / otp_locked      → inline on step 2
//   phone_taken on confirm (lost race)            → bounced to step 1

import { useEffect, useState } from 'react'
import OtpInput from '@/components/OtpInput'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  DIAL_COUNTRIES,
  composeE164,
  dialCountryFor,
  sanitizeLocalDigits,
  validatePhoneShape,
} from '@/lib/dialCodes'

// Matches the backend's CODE_LENGTH (6 after the OTP-hardening PR).
const OTP_LENGTH = 6
const RESEND_SECONDS = 60

type Step = 'phone' | 'code'

export default function ChangePhoneModal({
  accessToken,
  onClose,
  onChanged,
}: {
  accessToken: string
  onClose: () => void
  // Receives the fresh /users/me envelope returned by confirm.
  onChanged: (me: unknown) => void
}) {
  const { t } = useI18n()
  const toast = useToast()

  const [step, setStep] = useState<Step>('phone')
  const [dialCountryCode, setDialCountryCode] = useState('SA')
  const dialCountry = dialCountryFor(dialCountryCode)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Frozen E.164 from the successful start call — confirm + resend
  // must key the exact same target.
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [resending, setResending] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (step !== 'code' || secondsLeft <= 0) return
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [step, secondsLeft])

  // Maps the start-step error codes to inline copy. Returns null for
  // unknown codes so the caller can fall back to a generic message.
  const startErrorCopy = (errCode: string): string | null => {
    if (errCode === 'invalid_phone') return t('changephone.error_invalid_phone')
    if (errCode === 'phone_unchanged') return t('changephone.error_unchanged')
    if (errCode === 'phone_taken') return t('changephone.error_taken')
    if (errCode === 'otp_rate_limited') return t('otp.rate_limited')
    if (errCode === 'rate_limited') return t('otp.rate_limited')
    if (errCode === 'sms_unavailable')
      return t('changephone.error_sms_unavailable')
    return null
  }

  const callStart = async (target: string): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/users/me/change-phone/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ newPhone: target }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        code?: string
        message?: string
      }
      const errCode = String(data.code ?? data.message ?? '')
      setPhoneError(startErrorCopy(errCode) ?? t('changephone.error_generic'))
      return false
    }
    return true
  }

  const onSubmitPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    setPhoneError(null)
    const phoneErrorKey = validatePhoneShape(dialCountryCode, phone)
    if (phoneErrorKey) {
      setPhoneError(t(phoneErrorKey))
      return
    }
    const e164 = composeE164(dialCountry.dial, phone)
    if (!e164) {
      setPhoneError(t('changephone.error_invalid_phone'))
      return
    }
    setSending(true)
    try {
      const ok = await callStart(e164)
      if (ok) {
        setSentTo(e164)
        setCode('')
        setCodeError(null)
        setSecondsLeft(RESEND_SECONDS)
        setStep('code')
      }
    } catch {
      setPhoneError(t('changephone.error_generic'))
    } finally {
      setSending(false)
    }
  }

  const onResend = async () => {
    if (secondsLeft > 0 || resending) return
    setResending(true)
    setCode('')
    setCodeError(null)
    try {
      const ok = await callStart(sentTo)
      if (ok) {
        toast.show(t('otp.sent_again'))
        setSecondsLeft(RESEND_SECONDS)
      } else {
        // callStart wrote a phone-step error — surface it here too
        // so the user isn't staring at a silent code screen.
        setCodeError(t('changephone.error_generic'))
      }
    } catch {
      setCodeError(t('changephone.error_generic'))
    } finally {
      setResending(false)
    }
  }

  const onConfirm = async () => {
    if (confirming || code.length !== OTP_LENGTH) return
    setCodeError(null)
    setConfirming(true)
    try {
      const res = await fetch(`${API_BASE}/users/me/change-phone/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ newPhone: sentTo, code }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          code?: string
          message?: string
        }
        const errCode = String(data.code ?? data.message ?? '')
        if (errCode === 'invalid_code') {
          setCodeError(t('otp.invalid_code'))
          return
        }
        if (errCode === 'expired_code') {
          setCodeError(t('otp.expired_code'))
          return
        }
        if (errCode === 'otp_locked') {
          setCodeError(t('changephone.error_locked'))
          return
        }
        if (errCode === 'phone_taken') {
          // Lost the race — bounce back to step 1 with the inline
          // explanation so the user picks a different number.
          setPhoneError(t('changephone.error_taken'))
          setStep('phone')
          return
        }
        setCodeError(t('changephone.error_generic'))
        return
      }
      const me = (await res.json()) as unknown
      toast.show(t('changephone.success_toast'))
      onChanged(me)
      onClose()
    } catch {
      setCodeError(t('changephone.error_generic'))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-6 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border p-5 backdrop-blur-md"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('changephone.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[0.7rem] font-medium"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('changephone.cancel')}
          </button>
        </div>

        {step === 'phone' && (
          <form onSubmit={onSubmitPhone} className="mt-4 flex flex-col gap-3">
            <p
              className="text-[0.78rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('changephone.intro')}
            </p>

            {/* Same dial-code + national-digits composition as the
                register form so E.164 keying matches the backend. */}
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold tracking-[0.2em]"
                style={{ color: 'var(--muted)' }}
              >
                {t('changephone.new_phone_label')}
              </label>
              <div
                className="flex items-stretch overflow-hidden rounded-xl border"
                style={{
                  borderColor: phoneError
                    ? 'rgba(213, 91, 110, 0.55)'
                    : 'var(--border)',
                  background: 'var(--card)',
                }}
                dir="ltr"
              >
                <select
                  value={dialCountryCode}
                  onChange={(e) => setDialCountryCode(e.target.value)}
                  aria-label={t('register.country_label')}
                  className="appearance-none border-0 bg-transparent px-3 py-3 text-sm font-medium focus:outline-none"
                  style={{
                    color: 'var(--text)',
                    borderInlineEnd: '1px solid var(--border)',
                    minWidth: '7.5rem',
                  }}
                >
                  {DIAL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.dial} ({c.code})
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder={dialCountry.mobileExample}
                  value={phone}
                  onChange={(e) => {
                    const cleaned = sanitizeLocalDigits(
                      dialCountry.dial,
                      e.target.value,
                    )
                    setPhone(cleaned)
                    if (phoneError) setPhoneError(null)
                  }}
                  dir="ltr"
                  className="w-full bg-transparent px-3 py-3 text-base font-medium focus:outline-none"
                  style={{ color: 'var(--text)' }}
                />
              </div>
              {phoneError && (
                <p
                  className="mt-1.5 text-[0.72rem] font-medium"
                  style={{ color: '#B83A50' }}
                >
                  {phoneError}
                </p>
              )}
            </div>

            <PrimaryButton type="submit" disabled={sending} loading={sending}>
              {t('forgot.send_code')}
            </PrimaryButton>
          </form>
        )}

        {step === 'code' && (
          <div className="mt-4 flex flex-col gap-3">
            <p
              className="text-[0.78rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('changephone.code_hint')}{' '}
              <span
                dir="ltr"
                className="font-semibold"
                style={{ color: 'var(--ink)' }}
              >
                {sentTo}
              </span>
            </p>

            <OtpInput
              length={OTP_LENGTH}
              value={code}
              onChange={(next) => {
                setCode(next)
                if (codeError) setCodeError(null)
              }}
              autoFocus
              error={!!codeError}
            />
            {codeError && (
              <p
                className="text-center text-[0.78rem] font-medium"
                style={{ color: '#D55B6E' }}
              >
                {codeError}
              </p>
            )}

            <PrimaryButton
              onClick={() => void onConfirm()}
              disabled={code.length !== OTP_LENGTH || confirming}
              loading={confirming}
            >
              {t('changephone.confirm_button')}
            </PrimaryButton>

            <div
              className="text-center text-[0.8rem]"
              style={{ color: 'var(--muted)' }}
            >
              {secondsLeft > 0 ? (
                <span>
                  {t('otp.resend_in')}{' '}
                  <span
                    dir="ltr"
                    className="font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {secondsLeft}
                    {t('otp.seconds_short')}
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void onResend()}
                  disabled={resending}
                  className="font-medium underline-offset-4 transition-colors hover:underline disabled:opacity-50"
                  style={{ color: 'var(--primary)' }}
                >
                  {t('otp.resend')}
                </button>
              )}
            </div>

            <SecondaryButton
              onClick={() => {
                setStep('phone')
                setCode('')
                setCodeError(null)
              }}
            >
              {t('changephone.back_to_phone')}
            </SecondaryButton>
          </div>
        )}
      </div>
    </div>
  )
}
