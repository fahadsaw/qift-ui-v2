"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Field from "@/components/Field";
import PageContainer from "@/components/PageContainer";
import PageHeading from "@/components/PageHeading";
import PrimaryButton from "@/components/PrimaryButton";
import { API_BASE } from "@/lib/apiBase";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { setAuth, type AuthUser } from "@/lib/auth";
import { homeForRole } from "@/lib/roleHome";

export default function LoginPage() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?next= return path (audit Q1): deep links like /business →
  // "start your company profile" → /org → login must land BACK on
  // /org, not on the consumer default. Internal paths only — a
  // value not starting with a single '/' is ignored (open-redirect
  // guard).
  const rawNext = searchParams.get("next");
  const nextPath =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : null;

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    identifier.trim().length >= 3 && password.length >= 4 && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) return;

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      });

      if (!res.ok) throw new Error("login_failed");

      const data = (await res.json()) as {
        accessToken?: string;
        user?: AuthUser & { passwordHash?: string };
      };

      if (!data.accessToken || !data.user?.id) {
        throw new Error("login_failed");
      }

      setAuth({
        accessToken: data.accessToken,
        userId: data.user.id,
        user: data.user,
      });

      // Role-aware post-login destination. Merchants land on the
      // store dashboard (their operational hub), admins on the
      // control center, regular users continue to land on /send
      // (the existing gift-sender funnel — the most common
      // post-login intent for a normal user).
      router.push(
        nextPath ??
          (data.user.role === 'store' || data.user.role === 'admin'
            ? homeForRole(data.user.role)
            : "/send"),
      );
    } catch {
      toast.show(t("login.error_invalid"), { tone: "error" });
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          line1={t("login.title_1")}
          gradient={t("login.title_2")}
          subtitle={t("login.subtitle")}
        />

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3.5">
          <Field
            label={t("login.identifier_label")}
            placeholder={t("login.identifier_placeholder")}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />

          <Field
            label={t("login.password_label")}
            placeholder={t("login.password_placeholder")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            trailing={
              <Link
                href="/forgot-password"
                className="text-[0.7rem] font-normal transition-colors"
                style={{ color: "var(--muted-2)" }}
              >
                {t("login.forgot")}
              </Link>
            }
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
            disabled={!canSubmit}
            loading={submitting}
          >
            {t("login.submit")}
          </PrimaryButton>
        </form>

        <p
          className="mt-5 text-center text-[0.8rem]"
          style={{ color: "var(--muted)" }}
        >
          {t("login.no_account")}{" "}
          <Link
            href="/register"
            className="font-medium underline-offset-4 transition-colors hover:underline"
            style={{ color: "var(--ink)" }}
          >
            {t("login.signup")}
          </Link>
        </p>

        <div
          className="mt-10 rounded-3xl border p-5 backdrop-blur-sm"
          style={{
            borderColor: "var(--hairline)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface) 55%, transparent) 0%, color-mix(in srgb, var(--bg-base) 35%, transparent) 100%)",
          }}
        >
          <div className="mb-4 flex items-center gap-3 px-1">
            <span
              className="h-px flex-1"
              style={{ background: "var(--border)" }}
            />
            <span
              className="text-[0.65rem] font-medium tracking-[0.35em]"
              style={{ color: "var(--muted-2)" }}
            >
              {t("login.merchant_header")}
            </span>
            <span
              className="h-px flex-1"
              style={{ background: "var(--border)" }}
            />
          </div>

          <Link
            href="/merchant"
            className="group flex items-center justify-between gap-4 rounded-2xl border p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: "var(--border)",
              background: "var(--card)",
            }}
          >
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface-2)",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  style={{ color: "var(--primary)" }}
                >
                  <path d="M3 9l1.5-4.5a1 1 0 011-.7h13a1 1 0 011 .7L21 9" />
                  <path d="M3 9h18" />
                  <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9" />
                  <path d="M9 14h6" />
                </svg>
              </span>

              <div className="flex flex-col">
                <span
                  className="text-[0.95rem] font-bold tracking-tight"
                  style={{ color: "var(--ink)" }}
                >
                  {t("login.merchant_title")}
                </span>
                <span
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  {t("login.merchant_subtitle")}
                </span>
              </div>
            </div>

            <span
              aria-hidden
              className="shrink-0 text-lg transition-all duration-300 group-hover:-translate-x-1"
              style={{ color: "var(--muted-2)" }}
            >
              ←
            </span>
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
