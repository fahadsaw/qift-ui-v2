"use client";

// Forgot / reset password — the real flow (replaces the launch-era
// visual stub that faked a "reset link" with a setTimeout).
//
// BACKEND CONTRACT (no backend changes were needed):
//   POST /auth/forgot-password { identifier, channel }
//     → ALWAYS { ok: true } (anti-enumeration: account-not-found,
//       unverified channel, soft-deleted, and rate-limited all look
//       identical). The OTP is dispatched server-side via the same
//       OtpService the register flow uses — 4 digits, 5-minute TTL,
//       5 sends / 5 min, 5 verify attempts per code (F1 lockout).
//   POST /auth/reset-password { identifier, channel, code, newPassword }
//     → { ok: true } | 400 with message ∈ { invalid_code,
//       expired_code, otp_locked, invalid_password }. user-not-found
//       deliberately surfaces as invalid_code (no enumeration).
//
// CHANNEL CHOICE
// Recovery is verified-channel-only on the backend: phone recovery
// needs phoneVerifiedAt, email recovery needs emailVerifiedAt — and
// registration stamps ONLY the channel the OTP proved. The register
// flow defaults to email (SMS provisioning is the less reliable
// path), so most accounts are email-verified. We mirror that default
// here and tell the user to pick the channel they verified at
// sign-up. Because of the anti-enumeration contract we can never
// know (or reveal) which channel that is.
//
// Copy stays calm and never confirms an account exists: the reset
// step says "if an account is linked to this channel, a code is on
// its way" rather than "we sent you a code".

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Badge from "@/components/Badge";
import Field from "@/components/Field";
import OtpInput from "@/components/OtpInput";
import PageContainer from "@/components/PageContainer";
import PageHeading from "@/components/PageHeading";
import PrimaryButton from "@/components/PrimaryButton";
import SecondaryButton from "@/components/SecondaryButton";
import { API_BASE } from "@/lib/apiBase";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import {
  DIAL_COUNTRIES,
  composeE164,
  dialCountryFor,
  sanitizeLocalDigits,
  validatePhoneShape,
} from "@/lib/dialCodes";

type Step = "request" | "reset" | "done";
type OtpChannel = "phone" | "email";

// Mirrors the register flow's OTP contract — same backend
// infrastructure, so the same constants.
const OTP_LENGTH = 4;
const RESEND_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [step, setStep] = useState<Step>("request");

  // ─ Request step state ─────────────────────────────────────────
  // Default 'email' — matches the register default, which means it
  // matches the verified channel for most accounts (see header).
  const [channel, setChannel] = useState<OtpChannel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dialCountryCode, setDialCountryCode] = useState("SA");
  const dialCountry = dialCountryFor(dialCountryCode);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  // Frozen at request time so resend + reset use byte-identical
  // keying with the Otp row the backend created (same pattern as
  // the register flow freezing its channel).
  const [sentIdentifier, setSentIdentifier] = useState("");
  const [sentDisplay, setSentDisplay] = useState("");

  // ─ Reset step state ───────────────────────────────────────────
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (step !== "reset" || secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  const passMismatch = confirm.length > 0 && newPassword !== confirm;

  // Compose + shape-validate the identifier for the active channel.
  // Returns null (and sets the inline error) when the input can't
  // possibly be a valid target — saves a pointless round trip.
  const buildIdentifier = (): { wire: string; display: string } | null => {
    if (channel === "phone") {
      const phoneErrorKey = validatePhoneShape(dialCountryCode, phone);
      if (phoneErrorKey) {
        setFieldError(t(phoneErrorKey));
        return null;
      }
      const e164 = composeE164(dialCountry.dial, phone);
      if (!e164) {
        setFieldError(t("otp.send_failed"));
        return null;
      }
      return { wire: e164, display: `${dialCountry.dial} ${phone.trim()}` };
    }
    const cleaned = email.trim().toLowerCase();
    if (!cleaned || !cleaned.includes("@")) {
      setFieldError(t("otp.email_required_for_email_channel"));
      return null;
    }
    return { wire: cleaned, display: cleaned };
  };

  // POST /auth/forgot-password. The endpoint always answers
  // { ok: true } — only a transport failure is an error here.
  const requestCode = async (identifier: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, channel }),
      });
      if (!res.ok) throw new Error("forgot_failed");
      return true;
    } catch (err) {
      console.error("[forgot-password] request failed", err);
      toast.show(t("otp.send_failed"), { tone: "error" });
      return false;
    }
  };

  const onRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requesting) return;
    setFieldError(null);
    const identifier = buildIdentifier();
    if (!identifier) return;
    setRequesting(true);
    const ok = await requestCode(identifier.wire);
    setRequesting(false);
    if (!ok) return;
    setSentIdentifier(identifier.wire);
    setSentDisplay(identifier.display);
    setCode("");
    setCodeError(null);
    setSecondsLeft(RESEND_SECONDS);
    setStep("reset");
  };

  const onResend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setCode("");
    setCodeError(null);
    const ok = await requestCode(sentIdentifier);
    setResending(false);
    if (!ok) return;
    // Neutral copy — the backend never confirms a dispatch happened
    // (anti-enumeration), so neither do we.
    toast.show(t("forgot.resent_toast"));
    setSecondsLeft(RESEND_SECONDS);
  };

  const onResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetting) return;
    setCodeError(null);
    setPasswordError(null);

    if (code.length !== OTP_LENGTH) {
      setCodeError(t("forgot.error_invalid_code"));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(t("forgot.error_password"));
      return;
    }
    if (newPassword !== confirm) {
      setPasswordError(t("forgot.password_mismatch"));
      return;
    }

    setResetting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: sentIdentifier,
          channel,
          code: code.trim(),
          newPassword,
        }),
      });

      if (!res.ok) {
        // Plain BadRequestException puts the stable code in
        // `message`; newer typed errors use `code`. Read both —
        // same convention as the register flow.
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
        };
        const errCode = String(data.code ?? data.message ?? "");
        if (errCode === "invalid_code") {
          // Also covers "no recovery-eligible account" by design —
          // the message stays generic so nothing is enumerable.
          setCodeError(t("forgot.error_invalid_code"));
          return;
        }
        if (errCode === "expired_code") {
          setCodeError(t("otp.expired_code"));
          return;
        }
        if (errCode === "otp_locked") {
          setCodeError(t("forgot.error_locked"));
          return;
        }
        if (errCode === "invalid_password") {
          setPasswordError(t("forgot.error_password"));
          return;
        }
        throw new Error("reset_failed");
      }

      setStep("done");
    } catch (err) {
      console.error("[forgot-password] reset failed", err);
      toast.show(t("forgot.error_generic"), { tone: "error" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <PageContainer>
      <section className="pt-5 pb-10">
        {/* ─ Step 1 — request a code ─────────────────────────────── */}
        {step === "request" && (
          <>
            <PageHeading
              badge={<Badge>{t("forgot.badge")}</Badge>}
              line1={t("forgot.title_1")}
              gradient={t("forgot.title_2")}
              subtitle={t("forgot.intro")}
              size="sm"
            />

            <form
              onSubmit={onRequestSubmit}
              className="mt-6 flex flex-col gap-4"
            >
              {/* Channel picker — same radiogroup pattern as the
                  register flow so the muscle memory transfers. */}
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold tracking-[0.2em]"
                  style={{ color: "var(--muted)" }}
                >
                  {t("otp.channel_label")}
                </label>
                <div
                  role="radiogroup"
                  aria-label={t("otp.channel_label")}
                  className="grid grid-cols-2 gap-2"
                >
                  {(
                    [
                      { id: "email", label: t("otp.channel_email") },
                      { id: "phone", label: t("otp.channel_sms") },
                    ] as const
                  ).map((opt) => {
                    const active = channel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setChannel(opt.id);
                          setFieldError(null);
                        }}
                        className="rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors"
                        style={{
                          borderColor: active
                            ? "color-mix(in srgb, var(--primary) 60%, transparent)"
                            : "var(--border)",
                          background: active
                            ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                            : "var(--card)",
                          color: active ? "var(--ink)" : "var(--text-soft)",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p
                  className="mt-1.5 text-[0.7rem]"
                  style={{ color: "var(--muted-2)" }}
                >
                  {t("forgot.channel_hint")}
                </p>
              </div>

              {channel === "email" ? (
                <Field
                  label={t("forgot.email_label")}
                  placeholder={t("forgot.email_placeholder")}
                  type="email"
                  inputMode="email"
                  dirOverride="ltr"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  error={fieldError ?? undefined}
                />
              ) : (
                // Phone field with dial-code picker — same markup as
                // the register form so E.164 composition matches the
                // backend's Otp-row keying exactly.
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold tracking-[0.2em]"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("register.phone_label")}
                  </label>
                  <div
                    className="flex items-stretch overflow-hidden rounded-xl border"
                    style={{
                      borderColor: fieldError
                        ? "rgba(213, 91, 110, 0.55)"
                        : "var(--border)",
                      background: "var(--card)",
                    }}
                    dir="ltr"
                  >
                    <select
                      value={dialCountryCode}
                      onChange={(e) => setDialCountryCode(e.target.value)}
                      aria-label={t("register.country_label")}
                      className="appearance-none border-0 bg-transparent px-3 py-3 text-sm font-medium focus:outline-none"
                      style={{
                        color: "var(--text)",
                        borderInlineEnd: "1px solid var(--border)",
                        minWidth: "7.5rem",
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
                        );
                        setPhone(cleaned);
                        if (fieldError) setFieldError(null);
                      }}
                      dir="ltr"
                      className="w-full bg-transparent px-3 py-3 text-base font-medium focus:outline-none"
                      style={{ color: "var(--text)" }}
                    />
                  </div>
                  {fieldError && (
                    <p
                      className="mt-1.5 text-[0.72rem] font-medium"
                      style={{ color: "#B83A50" }}
                    >
                      {fieldError}
                    </p>
                  )}
                </div>
              )}

              <PrimaryButton
                type="submit"
                disabled={requesting}
                loading={requesting}
                className="mt-1"
              >
                {t("forgot.send_code")}
              </PrimaryButton>
            </form>

            <p className="mt-5 text-center text-[0.8rem]">
              <Link
                href="/login"
                className="font-medium underline-offset-4 hover:underline"
                style={{ color: "var(--ink)" }}
              >
                {t("forgot.back_to_login")}
              </Link>
            </p>
          </>
        )}

        {/* ─ Step 2 — code + new password ────────────────────────── */}
        {step === "reset" && (
          <>
            <PageHeading
              badge={<Badge>{t("forgot.badge")}</Badge>}
              line1={t("forgot.reset_title_1")}
              gradient={t("forgot.reset_title_2")}
              subtitle={
                <span>
                  {t("forgot.reset_intro")}{" "}
                  <span
                    dir="ltr"
                    className="font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {sentDisplay}
                  </span>
                </span>
              }
              size="sm"
            />

            <form
              onSubmit={onResetSubmit}
              className="mt-6 flex flex-col gap-4"
            >
              <div>
                <label
                  className="mb-1.5 block text-center text-xs font-semibold tracking-[0.2em]"
                  style={{ color: "var(--muted)" }}
                >
                  {t("otp.code_label")}
                </label>
                <OtpInput
                  length={OTP_LENGTH}
                  value={code}
                  onChange={(next) => {
                    setCode(next);
                    if (codeError) setCodeError(null);
                  }}
                  autoFocus
                  error={!!codeError}
                />
                {codeError && (
                  <p
                    className="mt-2 text-center text-[0.8rem] font-medium"
                    style={{ color: "#D55B6E" }}
                  >
                    {codeError}
                  </p>
                )}
              </div>

              <Field
                label={t("forgot.new_password_label")}
                placeholder={t("forgot.new_password_placeholder")}
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                autoComplete="new-password"
                error={passwordError ?? undefined}
              />

              <Field
                label={t("forgot.confirm_label")}
                placeholder={t("forgot.new_password_placeholder")}
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                error={passMismatch ? t("forgot.password_mismatch") : undefined}
              />

              <div className="-mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[0.7rem] font-medium transition-colors"
                  style={{ color: "var(--primary)" }}
                >
                  {showPassword ? t("login.hide") : t("login.show")}
                </button>
              </div>

              <PrimaryButton
                type="submit"
                disabled={
                  resetting ||
                  code.length !== OTP_LENGTH ||
                  newPassword.length < MIN_PASSWORD_LENGTH ||
                  passMismatch
                }
                loading={resetting}
              >
                {t("forgot.reset_button")}
              </PrimaryButton>

              <div
                className="text-center text-[0.8rem]"
                style={{ color: "var(--muted)" }}
              >
                {secondsLeft > 0 ? (
                  <span>
                    {t("otp.resend_in")}{" "}
                    <span
                      dir="ltr"
                      className="font-semibold"
                      style={{ color: "var(--ink)" }}
                    >
                      {secondsLeft}
                      {t("otp.seconds_short")}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onResend()}
                    disabled={resending}
                    className="font-medium underline-offset-4 transition-colors hover:underline disabled:opacity-50"
                    style={{ color: "var(--primary)" }}
                  >
                    {t("otp.resend")}
                  </button>
                )}
              </div>

              <SecondaryButton
                onClick={() => {
                  setStep("request");
                  setCode("");
                  setCodeError(null);
                  setNewPassword("");
                  setConfirm("");
                  setPasswordError(null);
                }}
              >
                {t("forgot.change_target")}
              </SecondaryButton>
            </form>
          </>
        )}

        {/* ─ Step 3 — done ───────────────────────────────────────── */}
        {step === "done" && (
          <>
            <PageHeading
              badge={<Badge>{t("forgot.badge")}</Badge>}
              line1={t("forgot.done_title_1")}
              gradient={t("forgot.done_title_2")}
              size="sm"
            />
            <div
              className="mt-6 rounded-3xl border p-6 text-center backdrop-blur-md"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <p
                className="text-base font-medium leading-relaxed"
                style={{ color: "var(--ink)" }}
              >
                {t("forgot.done_body")}
              </p>
              <PrimaryButton
                onClick={() => router.push("/login")}
                className="mt-5"
              >
                {t("forgot.done_cta")}
              </PrimaryButton>
            </div>
          </>
        )}
      </section>
    </PageContainer>
  );
}
