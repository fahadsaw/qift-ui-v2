'use client'

// Root error boundary. Next.js App Router renders this when a server
// or client component throws during render — without it, an
// unexpected exception shows a blank white screen and the user has
// no recovery path. Keeping this lightweight is intentional: the
// component itself must not throw, so it does NOT call useI18n() (a
// runtime context dependency that could be the very thing failing)
// and ships English-only copy. The Try-again button calls Next's
// reset() to re-mount the route segment.

import Link from 'next/link'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Best-effort logging. We don't ship to a remote sink yet — when
    // we do (Sentry / equivalent), this is the single hook to wire.
    // The `digest` field is the server-generated id Next assigns to
    // each thrown error so support can correlate user reports with
    // server logs.
    console.error('[qift] route error', error)
  }, [error])

  return (
    <main
      className="flex min-h-[70vh] items-center justify-center px-6"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="w-full max-w-md rounded-3xl border p-6 text-center backdrop-blur-md"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </span>
        <h1
          className="mt-4 text-xl font-extrabold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          Something went wrong
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          We hit an unexpected error. Try again, or head back to the home page.
        </p>
        {error.digest && (
          <p
            className="mt-3 inline-flex rounded-full border px-2.5 py-0.5 text-[0.65rem] font-mono"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--muted)',
            }}
            dir="ltr"
          >
            ref: {error.digest}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  )
}
