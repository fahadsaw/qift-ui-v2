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
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { setAuth, type AuthUser } from "@/lib/auth";
import { buildAddressPayload, schemaFor } from "@/lib/addresses";

type Step = "form" | "otp";

const API_URL = "http://localhost:4000";
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
  });

  const [address, setAddress] = useState<AddressValue>({
    country: "SA",
    details: {},
  });

  const [setDefault, setSetDefault] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<Step>("form");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

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
    !submitting;

  const requestOtp = async () => {
    try {
      const res = await fetch(`${API_URL}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: account.phone.trim() }),
      });

      if (!res.ok) throw new Error();

      setSecondsLeft(OTP_RESEND_SECONDS);
      setStep("otp");
      toast.show("تم إرسال رمز التحقق");
    } catch {
      toast.show("فشل إرسال الكود", { tone: "error" });
    }
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await requestOtp();
    setSubmitting(false);
  };

  const doRegister = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: account.fullname,
          qiftUsername: account.username,
          phone: account.phone,
          email: account.email,
          password: account.password,
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();

      setAuth({
        accessToken: data.accessToken,
        userId: data.user.id,
        user: data.user,
      });

      // 🔥 حفظ العنوان مباشرة
      await fetch(`${API_URL}/addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.accessToken}`,
        },
        body: JSON.stringify(
          buildAddressPayload(address.country, address.details, {
            isDefault: true,
          }),
        ),
      });

      router.push("/profile");
    } catch {
      toast.show("فشل التسجيل", { tone: "error" });
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length !== OTP_LENGTH) return;

    setOtpSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: account.phone.trim(),
          code: otpCode,
        }),
      });

      if (!res.ok) throw new Error();

      await doRegister();
    } catch {
      setOtpError("رمز غير صحيح");
    }

    setOtpSubmitting(false);
  };

  return (
    <PageContainer>
      <section className="pt-5">
        {step === "form" && (
          <>
            <PageHeading
              badge={<Badge>تسجيل</Badge>}
              line1="إنشاء"
              gradient="حساب جديد"
              subtitle="ابدأ رحلتك مع قفت"
              size="sm"
            />

            <form onSubmit={onFormSubmit} className="mt-6 flex flex-col gap-6">
              <Field
                label="الاسم"
                value={account.fullname}
                onChange={update("fullname")}
              />
              <Field
                label="اسم المستخدم"
                value={account.username}
                onChange={update("username")}
              />
              <Field
                label="رقم الجوال"
                value={account.phone}
                onChange={update("phone")}
              />
              <Field
                label="الإيميل"
                value={account.email}
                onChange={update("email")}
              />
              <Field
                label="كلمة المرور"
                value={account.password}
                onChange={update("password")}
              />
              <Field
                label="تأكيد كلمة المرور"
                value={account.confirm}
                onChange={update("confirm")}
              />

              <AddressForm value={address} onChange={setAddress} />

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                أوافق على الشروط
              </label>

              <PrimaryButton
                type="submit"
                disabled={!canSubmit}
                loading={submitting}
              >
                إنشاء الحساب
              </PrimaryButton>
            </form>
          </>
        )}

        {step === "otp" && (
          <div className="mt-6 text-center">
            <h2>أدخل رمز التحقق</h2>

            <OtpInput
              length={OTP_LENGTH}
              value={otpCode}
              onChange={setOtpCode}
            />

            {otpError && <p>{otpError}</p>}

            <PrimaryButton onClick={verifyOtp} loading={otpSubmitting}>
              تحقق
            </PrimaryButton>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
