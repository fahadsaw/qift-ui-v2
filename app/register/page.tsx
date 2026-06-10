"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AddressForm, { type AddressValue } from "@/components/AddressForm";
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
import { setAuth, type AuthUser } from "@/lib/auth";
import { buildAddressPayload, schemaFor } from "@/lib/addresses";
import {
  DIAL_COUNTRIES,
  composeE164,
  dialCountryFor,
  sanitizeLocalDigits,
  validatePhoneShape,
} from "@/lib/dialCodes";

type Step = "form" | "otp";
// Which channel the user picked for OTP delivery. Drives both
// /otp/send (target=phone vs target=email, type=phone vs type=email)
// and /auth/register (channel='phone' vs channel='email' tells the
// backend which Otp row to verify against).
//
// Default is 'email' because Taqnyat SMS isn't fully provisioned in
// production yet — Resend email is the reliable path. The user can
// flip to SMS at any time; if it fails with sms_unavailable we flip
// back automatically.
type OtpChannel = "phone" | "email";
const DEFAULT_CHANNEL: OtpChannel = "email";

const OTP_LENGTH = 4;
const OTP_RESEND_SECONDS = 60;

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [account, setAccount] = useState({
    fullname: "",
    username: "",
    phone: "",
    email: "",
    password: "",
    confirm: "",
    // Closed Beta Gate invite code. Optional in the form: when the
    // gate is OFF (default) the backend ignores it; when ON, an
    // allowlisted email/phone registers without one, so we never
    // hard-require it client-side. The backend decideRegistration is
    // authoritative — it returns a typed 403 if a code is required
    // and missing/invalid.
    betaCode: "",
  });

  const [address, setAddress] = useState<AddressValue>({
    country: "SA",
    details: {},
  });

  // Dial-code country selector. Defaults to SA (matches the address
  // schema default). On submit we compose the E.164 string from
  // `dialCountry.dial + account.phone`; the local input only carries
  // the national-format digits so users don't have to type the +966.
  const [dialCountryCode, setDialCountryCode] = useState<string>("SA");
  const dialCountry = dialCountryFor(dialCountryCode);

  const [setDefault, setSetDefault] = useState(true);
  const [agreed, setAgreed] = useState(false);

  // Per-field error messages keyed off the backend's typed error
  // codes (`username_taken`, `email_taken`, `phone_taken`,
  // `username_invalid`). Cleared on every submit start; populated on
  // a 4xx response from /auth/register so users see inline guidance
  // instead of a generic toast.
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    email?: string;
    phone?: string;
    betaCode?: string;
  }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const [step, setStep] = useState<Step>("form");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // The channel the user picked at form time. Frozen into local state
  // because the OTP screen needs to keep using the same channel for
  // resend + verify even if the form-level toggle is later changed
  // by the user (it isn't reachable from the OTP screen, but we
  // capture intent at submit time so the contract is unambiguous).
  const [channel, setChannel] = useState<OtpChannel>(DEFAULT_CHANNEL);

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  // PR 8 — beta onboarding UX. Public gate probe (GET /beta/status)
  // so the invite-code field presents itself honestly:
  //   true  → required field + invite-only banner copy (the user
  //           learns BEFORE filling the form and burning an OTP)
  //   false → field hidden entirely (no dead weight in the form)
  //   null  → probe unanswered (network error / old backend) — keep
  //           the historical optional presentation; the backend 403
  //           mapping below remains the authoritative gate either way.
  const [gateEnabled, setGateEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/beta/status`);
        if (!res.ok) return;
        const data = (await res.json()) as { gateEnabled?: boolean };
        if (!cancelled) setGateEnabled(data.gateEnabled === true);
      } catch {
        // Unknown state — fall through to the optional presentation.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update =
    (key: keyof typeof account) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setAccount((s) => ({ ...s, [key]: e.target.value }));

  const passMismatch =
    account.confirm.length > 0 && account.password !== account.confirm;

  const schema = schemaFor(address.country);

  const addressFilled =
    !!schema &&
    schema.fields
      .filter((f) => !f.optional)
      .every((f) => (address.details[f.key] ?? "").trim().length > 0);

  const canSubmit =
    account.fullname.trim().length >= 2 &&
    account.email.includes("@") &&
    account.username.trim().length >= 3 &&
    account.phone.trim().length >= 6 &&
    account.password.length >= 8 &&
    !passMismatch &&
    addressFilled &&
    agreed &&
    // NOTE: the invite code is deliberately NOT a submit blocker
    // even when the gate is on — allowlisted emails/phones register
    // WITHOUT a code, and they have none to enter. The banner +
    // required styling steer code-holders; the helper copy tells
    // allowlisted invitees they can continue. A code-less,
    // non-allowlisted submit costs nothing extra: the backend's
    // gate rejection happens AFTER OTP verify but intentionally
    // leaves the OTP un-consumed, so adding the code and
    // resubmitting needs no new OTP.
    !submitting;

  // Single source of truth for the canonical E.164 phone we send
  // to the backend. Used by /otp/send + /auth/register so the OTP
  // we generate matches the user we look up at register time.
  const e164Phone = () => composeE164(dialCountry.dial, account.phone);

  // Send the OTP via the picked channel.
  //
  // `attemptedChannel` is threaded explicitly so the auto-fallback
  // path (sms_unavailable → retry on email) doesn't have to wait
  // for the React state update from setChannel — we recurse with
  // the new value immediately. The frozen state is updated alongside
  // so subsequent resends and the verify step use the same channel.
  const requestOtp = async (
    attemptedChannel: OtpChannel = channel,
  ): Promise<boolean> => {
    try {
      let target: string;
      if (attemptedChannel === "phone") {
        // Country-aware shape gate before we hit the network. Catches
        // common typos (e.g. SA users typing 9 digits without the 5
        // prefix). validatePhoneShape returns null on success or a
        // translation key for the inline error.
        const phoneErrorKey = validatePhoneShape(
          dialCountryCode,
          account.phone,
        );
        if (phoneErrorKey) {
          setFieldErrors({ phone: t(phoneErrorKey) });
          return false;
        }
        const e164 = e164Phone();
        if (!e164) {
          toast.show(t("otp.send_failed"), { tone: "error" });
          return false;
        }
        target = e164;
      } else {
        const email = account.email.trim().toLowerCase();
        if (!email || !email.includes("@")) {
          setFieldErrors({
            email: t("otp.email_required_for_email_channel"),
          });
          return false;
        }
        target = email;
      }

      // Body shape matches OtpService.SendOtpInput: { target, type }.
      // Target is normalised by composeE164 (phone) or trim+lowercase
      // (email) so the backend's Otp row keying matches what we'll
      // resend at verify time.
      const res = await fetch(`${API_BASE}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          type: attemptedChannel,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
        };
        // 503 sms_unavailable → automatically retry via email if the
        // user supplied one. Same for the symmetric email_unavailable
        // path. We surface a toast so the user knows the channel
        // changed under them.
        if (data.code === "sms_unavailable" && attemptedChannel === "phone") {
          const emailFilled = account.email.trim().includes("@");
          if (emailFilled) {
            toast.show(t("otp.sms_unavailable"));
            setChannel("email");
            return await requestOtp("email");
          }
          // No email to fall back to — ask the user to enter one.
          setFieldErrors({
            email: t("otp.email_required_for_email_channel"),
          });
          setChannel("email");
          return false;
        }
        if (
          data.code === "email_unavailable" &&
          attemptedChannel === "email"
        ) {
          toast.show(t("otp.email_unavailable"), { tone: "error" });
          setChannel("phone");
          return await requestOtp("phone");
        }
        if (data.code === "otp_rate_limited") {
          toast.show(t("otp.rate_limited"), { tone: "error" });
          return false;
        }
        throw new Error("otp_send_failed");
      }

      // Read the success body. dispatched=false means the backend
      // attempted delivery but the provider returned a non-2xx — the
      // OTP row exists but the user may never see the code. Surface
      // a soft warning so they can flip channels manually.
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        dispatched?: boolean;
        channel?: OtpChannel;
        expiresAt?: string;
      };
      if (data.dispatched === false) {
        toast.show(t("otp.dispatch_uncertain"));
      }

      // Persist the channel that actually succeeded — important for
      // the auto-fallback case where the user requested phone but we
      // ended up sending via email.
      setChannel(attemptedChannel);
      setSecondsLeft(OTP_RESEND_SECONDS);
      setStep("otp");
      return true;
    } catch (err) {
      console.error("[register] otp/send failed", err);
      toast.show(t("otp.send_failed"), { tone: "error" });
      return false;
    }
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await requestOtp();
    setSubmitting(false);
  };

  const onResend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setOtpCode("");
    setOtpError(null);
    const ok = await requestOtp();
    if (ok) toast.show(t("otp.sent_again"));
    setResending(false);
  };

  // Single round-trip register-or-login. The backend now verifies (phone,
  // code) against the Otp table itself before issuing any JWT, so the
  // frontend no longer calls /otp/verify separately. Existing-phone case
  // is handled server-side: it returns a JWT for that user (login path).
  const verifyOtp = async () => {
    if (otpCode.length !== OTP_LENGTH) return;

    setOtpSubmitting(true);
    setOtpError(null);
    setFieldErrors({});

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: account.fullname,
          qiftUsername: account.username,
          phone: e164Phone(),
          email: account.email,
          password: account.password,
          // Mandatory — backend rejects 400 invalid_code / expired_code
          // when the (channel-target, code) pair doesn't match a live
          // Otp row. The `channel` field tells the backend which target
          // to look the row up by (phone vs email), so the OTP we just
          // typed maps to the right verification path.
          code: otpCode,
          channel,
          // Closed Beta Gate. Sent only when non-empty; the backend
          // decideRegistration ignores it when BETA_GATE_ENABLED is
          // off and validates it (typed 403) when on. Trimmed so a
          // stray space doesn't fail an otherwise-valid code.
          ...(account.betaCode.trim()
            ? { betaCode: account.betaCode.trim() }
            : {}),
        }),
      });

      if (!res.ok) {
        // Backend now emits a stable `code` field for every typed
        // error. We branch on the code first; the legacy `message`
        // string handling is preserved for OTP errors that pre-date
        // the typed contract.
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
        };
        const code = String(data.code ?? "");
        const message = String(data.message ?? "");

        if (code === "username_taken") {
          setFieldErrors({ username: t("register.error_username_taken") });
          setStep("form");
          return;
        }
        if (code === "email_taken") {
          setFieldErrors({ email: t("register.error_email_taken") });
          setStep("form");
          return;
        }
        if (code === "phone_taken") {
          setFieldErrors({ phone: t("register.error_phone_taken") });
          setStep("form");
          return;
        }
        if (code === "username_invalid") {
          setFieldErrors({ username: t("register.error_username_invalid") });
          setStep("form");
          return;
        }
        if (code === "password_too_short") {
          toast.show(t("register.error_password_short"), { tone: "error" });
          setStep("form");
          return;
        }

        // Closed Beta Gate denials (403). All four map to the invite-
        // code field so the user lands back on the form with inline
        // guidance. `beta_required` (gate on, no code, not
        // allowlisted) and `beta_code_invalid` are the common cases;
        // `beta_code_expired` / `beta_code_exhausted` are surfaced
        // distinctly so the user knows to ask for a fresh code rather
        // than re-typing the same one.
        if (
          code === "beta_required" ||
          code === "beta_code_invalid" ||
          code === "beta_code_expired" ||
          code === "beta_code_exhausted"
        ) {
          setFieldErrors({ betaCode: t(`register.error_${code}`) });
          setStep("form");
          return;
        }

        // Legacy OTP errors — the OTP path still uses
        // BadRequestException with `message` instead of the new
        // typed envelope. Keep handling them.
        if (message === "invalid_code" || message === "expired_code") {
          setOtpError(t("otp.invalid_code"));
          return;
        }
        throw new Error("register_failed");
      }

      const data = (await res.json()) as {
        accessToken: string;
        user: AuthUser;
      };

      setAuth({
        accessToken: data.accessToken,
        userId: data.user.id,
        user: data.user,
      });

      // Address save runs for both register and login paths. For an
      // existing user it's effectively "add another address"; for a new
      // user it's the first one. Failure is non-fatal — auth already
      // succeeded above.
      try {
        await fetch(`${API_BASE}/addresses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.accessToken}`,
          },
          body: JSON.stringify(
            buildAddressPayload(address.country, address.details, {
              isDefault: setDefault,
            }),
          ),
        });
      } catch (err) {
        console.error("[register] address save failed", err);
      }

      toast.show(t("register.success_toast"));
      router.push("/profile");
    } catch (err) {
      console.error("[register] /auth/register failed", err);
      toast.show(t("register.error_toast"), { tone: "error" });
    } finally {
      setOtpSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <section className="relative pt-8 pb-10">
        {/* Ambient supporting shapes — quiet washes that frame the hero.
            All pointer-events-none and behind content (-z-10). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px]"
        >
          {/* Large violet wash — anchors the opposite corner from the hero */}
          <div
            className="qift-float-a absolute"
            style={{
              top: "-80px",
              right: "-130px",
              width: "320px",
              height: "320px",
              background:
                "radial-gradient(closest-side, color-mix(in srgb, var(--primary) 50%, transparent) 0%, rgba(0,0,0,0) 75%)",
              filter: "blur(10px)",
            }}
          />

          {/* Pink warmth — overlays the violet */}
          <div
            className="qift-float-c absolute"
            style={{
              top: "20px",
              right: "-40px",
              width: "200px",
              height: "200px",
              background:
                "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 32%, transparent) 0%, rgba(0,0,0,0) 75%)",
              filter: "blur(8px)",
              animationDelay: "-3s",
            }}
          />

          {/* Indigo wash — lower-left, frames the form bottom */}
          <div
            className="qift-float-c absolute"
            style={{
              top: "480px",
              left: "-90px",
              width: "280px",
              height: "280px",
              background:
                "radial-gradient(closest-side, rgba(96, 132, 255, 0.40) 0%, rgba(0,0,0,0) 75%)",
              filter: "blur(10px)",
              animationDelay: "-11s",
            }}
          />
        </div>

        {step === "form" && (
          <>
            <div className="qift-fade-in">
              <PageHeading
                badge={<Badge>{t("register.badge")}</Badge>}
                line1={t("register.title_1")}
                gradient={t("register.title_2")}
                subtitle={t("register.subtitle")}
                size="sm"
              />
            </div>

            <form
              onSubmit={onFormSubmit}
              className="qift-fade-in relative mt-10 flex flex-col gap-6 rounded-[2rem] border p-6 sm:p-8"
              style={{
                animationDelay: "60ms",
                borderColor: "var(--hairline)",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--surface) 72%, transparent) 0%, color-mix(in srgb, var(--surface-2) 55%, transparent) 100%)",
                backdropFilter: "blur(32px) saturate(140%)",
                WebkitBackdropFilter: "blur(32px) saturate(140%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.03), 0 0 0 1px color-mix(in srgb, var(--primary) 14%, transparent), 0 50px 120px -40px color-mix(in srgb, var(--primary) 75%, transparent), 0 22px 60px -22px rgba(0,0,0,0.65)",
              }}
            >
              <div
                className="qift-fade-in flex flex-col gap-4"
                style={{ animationDelay: "80ms" }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--primary), var(--accent-2))",
                      boxShadow:
                        "0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent)",
                    }}
                  />
                  <span
                    className="text-[0.65rem] font-semibold tracking-[0.35em]"
                    style={{ color: "var(--muted-2)" }}
                  >
                    {t("register.account_section")}
                  </span>
                </div>

                <Field
                  label={t("register.fullname_label")}
                  placeholder={t("register.fullname_placeholder")}
                  value={account.fullname}
                  onChange={update("fullname")}
                  autoComplete="name"
                  requiredMark
                />
                <Field
                  label={t("register.username_label")}
                  placeholder={t("register.username_placeholder")}
                  value={account.username}
                  onChange={(e) => {
                    update("username")(e);
                    if (fieldErrors.username) {
                      setFieldErrors((s) => ({ ...s, username: undefined }));
                    }
                  }}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  dirOverride="ltr"
                  requiredMark
                  error={fieldErrors.username}
                />
                {/* Phone field with dial-code picker. The picker is a
                    plain native <select> so RTL/LTR layouts don't fight
                    the Field component's prefix wiring. The local input
                    only carries national-format digits — composeE164()
                    prepends the chosen dial code on submit. */}
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
                      borderColor: fieldErrors.phone
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
                      // Country-aware placeholder: shows the local
                      // shape the user is expected to type AFTER the
                      // dial-code picker. For Saudi this is
                      // `5XXXXXXXX` — never `05XXXXXXXX`, because the
                      // sanitizer below drops a typed leading 0
                      // immediately, and showing it as a hint trained
                      // users to type a digit we'd then throw away.
                      placeholder={dialCountry.mobileExample}
                      value={account.phone}
                      onChange={(e) => {
                        // Live sanitize: strip the dial code on
                        // paste of `+966…` / `00966…` / `966…`,
                        // strip a leading 0 typed in local format,
                        // strip any non-digit characters. The user
                        // sees only the canonical local digits;
                        // submit-time composeE164 produces the same
                        // result regardless because it calls the
                        // exact same sanitizer.
                        const cleaned = sanitizeLocalDigits(
                          dialCountry.dial,
                          e.target.value,
                        );
                        setAccount((s) => ({ ...s, phone: cleaned }));
                        if (fieldErrors.phone) {
                          setFieldErrors((s) => ({
                            ...s,
                            phone: undefined,
                          }));
                        }
                      }}
                      dir="ltr"
                      className="w-full bg-transparent px-3 py-3 text-base font-medium focus:outline-none"
                      style={{ color: "var(--text)" }}
                    />
                  </div>
                  {fieldErrors.phone && (
                    <p
                      className="mt-1.5 text-[0.72rem] font-medium"
                      style={{ color: "#B83A50" }}
                    >
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>
                <Field
                  label={t("register.email_label")}
                  placeholder={t("register.email_placeholder")}
                  value={account.email}
                  onChange={(e) => {
                    update("email")(e);
                    if (fieldErrors.email) {
                      setFieldErrors((s) => ({ ...s, email: undefined }));
                    }
                  }}
                  error={fieldErrors.email}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  dirOverride="ltr"
                  requiredMark
                />

                {/* Closed Beta invite code. Presentation follows the
                    public gate probe (PR 8): hidden when the gate is
                    off, required + invite-only banner when on, and
                    the historical optional field when the probe is
                    unanswered. The backend stays authoritative — a
                    missing/invalid code surfaces as a typed 403
                    mapped to this field below. Uppercased on input
                    to match the stored QIFT-XXXX-XXXX format.
                    requiredMark stays advisory even when the gate is
                    on: an allowlisted email/phone registers without
                    a code, which the helper copy explains. */}
                {gateEnabled !== false && (
                  <div>
                    {gateEnabled === true && (
                      <div
                        className="mb-2 rounded-xl border px-3 py-2 text-[0.72rem] leading-relaxed"
                        style={{
                          borderColor:
                            'color-mix(in srgb, var(--primary) 30%, var(--border))',
                          background:
                            'color-mix(in srgb, var(--primary) 8%, var(--card))',
                          color: 'var(--text-soft)',
                        }}
                      >
                        {t("register.beta_gate_banner")}
                      </div>
                    )}
                    <Field
                      label={t("register.beta_code_label")}
                      placeholder={t("register.beta_code_placeholder")}
                      value={account.betaCode}
                      onChange={(e) => {
                        setAccount((s) => ({
                          ...s,
                          betaCode: e.target.value.toUpperCase(),
                        }));
                        if (fieldErrors.betaCode) {
                          setFieldErrors((s) => ({
                            ...s,
                            betaCode: undefined,
                          }));
                        }
                      }}
                      autoCapitalize="characters"
                      spellCheck={false}
                      dirOverride="ltr"
                      requiredMark={gateEnabled === true}
                      helper={
                        gateEnabled === true
                          ? t("register.beta_code_hint_required")
                          : t("register.beta_code_hint")
                      }
                      error={fieldErrors.betaCode}
                    />
                  </div>
                )}

                {/* OTP channel selector. Two pill-buttons; the picked
                    channel drives /otp/send (target=phone vs email,
                    type=phone vs email) AND /auth/register (channel
                    field tells the backend which Otp row to verify
                    against). Defaults to email because Taqnyat SMS
                    is not fully provisioned yet — if the user picks
                    SMS and the backend returns sms_unavailable, the
                    request handler falls back to email automatically.
                    Each button is a real <button type="button"> so
                    Enter inside the form doesn't accidentally trigger
                    a channel change before submit. */}
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
                          onClick={() => setChannel(opt.id)}
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
                    {t("otp.channel_hint")}
                  </p>
                </div>
                <Field
                  label={t("register.password_label")}
                  placeholder={t("register.password_placeholder")}
                  value={account.password}
                  onChange={update("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dirOverride="ltr"
                  requiredMark
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-[0.7rem] font-medium transition-colors"
                      style={{ color: "var(--primary)" }}
                    >
                      {showPassword ? t("login.hide") : t("login.show")}
                    </button>
                  }
                />
                <Field
                  label={t("register.confirm_label")}
                  value={account.confirm}
                  onChange={update("confirm")}
                  onBlur={() => setConfirmTouched(true)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dirOverride="ltr"
                  requiredMark
                  error={
                    confirmTouched && passMismatch
                      ? t("register.password_mismatch")
                      : undefined
                  }
                />
              </div>

              <div
                className="qift-fade-in -mx-6 border-y px-6 py-6 sm:-mx-8 sm:px-8"
                style={{
                  animationDelay: "160ms",
                  borderColor: "var(--hairline)",
                  background:
                    "color-mix(in srgb, var(--bg-base) 35%, transparent)",
                }}
              >
                <AddressForm value={address} onChange={setAddress} />
              </div>

              <label
                className="qift-fade-in flex items-center gap-2.5 text-sm"
                style={{ animationDelay: "240ms" }}
              >
                <input
                  type="checkbox"
                  checked={setDefault}
                  onChange={(e) => setSetDefault(e.target.checked)}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: "var(--primary)" }}
                />
                <span style={{ color: "var(--text-soft)" }}>
                  {t("register.set_default")}
                </span>
              </label>

              <label
                className="qift-fade-in flex items-start gap-2.5 text-sm leading-relaxed"
                style={{ animationDelay: "280ms" }}
              >
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded"
                  style={{ accentColor: "var(--primary)" }}
                />
                <span style={{ color: "var(--text-soft)" }}>
                  {t("register.terms_prefix")}{" "}
                  <Link
                    href="/terms"
                    className="font-medium underline-offset-4 hover:underline"
                    style={{ color: "var(--ink)" }}
                  >
                    {t("register.terms_link")}
                  </Link>{" "}
                  {t("register.terms_and")}{" "}
                  <Link
                    href="/privacy"
                    className="font-medium underline-offset-4 hover:underline"
                    style={{ color: "var(--ink)" }}
                  >
                    {t("register.privacy_link")}
                  </Link>
                </span>
              </label>

              <div
                className="qift-fade-in flex flex-col gap-2"
                style={{ animationDelay: "320ms" }}
              >
                <div className="relative">
                  {canSubmit && !submitting && (
                    <span
                      aria-hidden
                      className="qift-pulse-ring pointer-events-none absolute inset-0 rounded-2xl"
                    />
                  )}
                  <PrimaryButton
                    type="submit"
                    disabled={!canSubmit}
                    loading={submitting}
                  >
                    {t("register.submit")}
                  </PrimaryButton>
                </div>
                {!canSubmit && !submitting && (
                  <p
                    className="text-center text-[0.7rem]"
                    style={{ color: "var(--muted-2)" }}
                  >
                    {t("register.submit_hint_incomplete")}
                  </p>
                )}
              </div>
            </form>

            <p
              className="mt-6 text-center text-[0.8rem]"
              style={{ color: "var(--muted)" }}
            >
              {t("register.have_account")}{" "}
              <Link
                href="/login"
                className="font-medium underline-offset-4 transition-colors hover:underline"
                style={{ color: "var(--ink)" }}
              >
                {t("register.login_link")}
              </Link>
            </p>
          </>
        )}

        {step === "otp" && (
          <div className="qift-slide-up">
            <PageHeading
              badge={<Badge>{t("otp.badge")}</Badge>}
              line1={t("otp.title_1")}
              gradient={t("otp.title_2")}
              subtitle={
                <span>
                  {channel === "email"
                    ? t("otp.subtitle_email")
                    : t("otp.subtitle")}{" "}
                  <span
                    dir="ltr"
                    className="font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {channel === "email"
                      ? account.email.trim()
                      : `${dialCountry.dial} ${account.phone.trim()}`}
                  </span>
                </span>
              }
              size="sm"
            />

            <div
              className="relative mt-10 flex flex-col gap-5 rounded-[2rem] border p-6 sm:p-8"
              style={{
                borderColor: "var(--hairline)",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--surface) 72%, transparent) 0%, color-mix(in srgb, var(--surface-2) 55%, transparent) 100%)",
                backdropFilter: "blur(32px) saturate(140%)",
                WebkitBackdropFilter: "blur(32px) saturate(140%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.03), 0 0 0 1px color-mix(in srgb, var(--primary) 14%, transparent), 0 50px 120px -40px color-mix(in srgb, var(--primary) 75%, transparent), 0 22px 60px -22px rgba(0,0,0,0.65)",
              }}
            >
              <OtpInput
                length={OTP_LENGTH}
                value={otpCode}
                onChange={(next) => {
                  setOtpCode(next);
                  if (otpError) setOtpError(null);
                }}
                onComplete={(code) => {
                  setOtpCode(code);
                  void verifyOtp();
                }}
                autoFocus
                error={!!otpError}
              />

              {otpError && (
                <p
                  className="text-center text-[0.8rem] font-medium"
                  style={{ color: "#D55B6E" }}
                >
                  {otpError}
                </p>
              )}

              <PrimaryButton
                onClick={verifyOtp}
                disabled={otpCode.length !== OTP_LENGTH || otpSubmitting}
                loading={otpSubmitting}
              >
                {t("otp.verify_button")}
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
                    onClick={onResend}
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
                  setStep("form");
                  setOtpCode("");
                  setOtpError(null);
                }}
              >
                {t("otp.back")}
              </SecondaryButton>
            </div>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
