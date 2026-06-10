'use client'

// Change-email modal (PR 6 — mirror of ChangePhoneModal).
//
// Two steps over the backend's OTP-verified flow:
//   1. email — plain address field → POST /users/me/change-email/start
//   2. code  — 6-digit OtpInput + 60s resend cooldown
//      → POST /users/me/change-email/confirm
//
// The session proves account ownership; the code (delivered to the
// NEW address) proves mailbox ownership — so the committed address
// lands with emailVerifiedAt stamped. Also serves as "add email
// with proof" when the account has none yet.
//
// Error mapping (code-based envelope, same contract as register):
//   invalid_email / email_unchanged / email_taken → inline, step 1
//   otp_rate_limited / email_unavailable          → inline, step 1
//   invalid_code / expired_code / otp_locked      → inline, step 2
//   email_taken on confirm (lost race)            → bounced to step 1

import { useEffect, useState } from 'react'
import Field from '@/components/Field'
import OtpInput from '@/components/OtpInput'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

// Matches the backend's CODE_LENGTH (6 after the OTP-hardening PR).
const OTP_LENGTH = 6
const RESEND_SECONDS = 60

type Step = 'email' | 'code'

export default function ChangeEmailModal({
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

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Frozen lowercased address from the successful start call.
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

  const startErrorCopy = (errCode: string): string | null => {
    if (errCode === 'invalid_email') return t('changeemail.error_invalid_email')
    if (errCode === 'email_unchanged') return t('changeemail.error_unchanged')
    if (errCode === 'email_taken') return t('changeemail.error_taken')
    if (errCode === 'otp_rate_limited') return t('otp.rate_limited')
    if (errCode === 'rate_limited') return t('otp.rate_limited')
    if (errCode === 'email_unavailable')
      return t('changeemail.error_email_unavailable')
    return null
  }

  const callStart = async (target: string): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/users/me/change-email/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ newEmail: target }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        code?: string
        message?: string
      }
      const errCode = String(data.code ?? data.message ?? '')
      setEmailError(startErrorCopy(errCode) ?? t('changeemail.error_generic'))
      return false
    }
    return true
  }

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    setEmailError(null)
    const cleaned = email.trim().toLowerCase()
    if (!cleaned.includes('@')) {
      setEmailError(t('changeemail.error_invalid_email'))
      return
    }
    setSending(true)
    try {
      const ok = await callStart(cleaned)
      if (ok) {
        setSentTo(cleaned)
        setCode('')
        setCodeError(null)
        setSecondsLeft(RESEND_SECONDS)
        setStep('code')
      }
    } catch {
      setEmailError(t('changeemail.error_generic'))
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
        setCodeError(t('changeemail.error_generic'))
      }
    } catch {
      setCodeError(t('changeemail.error_generic'))
    } finally {
      setResending(false)
    }
  }

  const onConfirm = async () => {
    if (confirming || code.length !== OTP_LENGTH) return
    setCodeError(null)
    setConfirming(true)
    try {
      const res = await fetch(`${API_BASE}/users/me/change-email/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ newEmail: sentTo, code }),
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
        if (errCode === 'email_taken') {
          setEmailError(t('changeemail.error_taken'))
          setStep('email')
          return
        }
        setCodeError(t('changeemail.error_generic'))
        return
      }
      const me = (await res.json()) as unknown
      toast.show(t('changeemail.success_toast'))
      onChanged(me)
      onClose()
    } catch {
      setCodeError(t('changeemail.error_generic'))
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
            {t('changeemail.title')}
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

        {step === 'email' && (
          <form onSubmit={onSubmitEmail} className="mt-4 flex flex-col gap-3">
            <p
              className="text-[0.78rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('changeemail.intro')}
            </p>

            <Field
              label={t('changeemail.new_email_label')}
              placeholder={t('forgot.email_placeholder')}
              type="email"
              inputMode="email"
              dirOverride="ltr"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError(null)
              }}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              error={emailError ?? undefined}
            />

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
              {t('changeemail.confirm_button')}
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
                setStep('email')
                setCode('')
                setCodeError(null)
              }}
            >
              {t('changeemail.back_to_email')}
            </SecondaryButton>
          </div>
        )}
      </div>
    </div>
  )
}
