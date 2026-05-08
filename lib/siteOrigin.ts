// Single source of truth for the frontend's own canonical origin.
//
// Used for:
//   - Share / invite links the user copies to the clipboard (needs
//     to resolve back to the live app, not localhost / Vercel
//     preview alias).
//   - Server-side metadata: app/layout.tsx (OG / canonical),
//     app/robots.ts, app/sitemap.ts.
//
// Reads NEXT_PUBLIC_SITE_ORIGIN at build time and falls back to the
// production domain so a missed env var still produces a usable
// link. Trailing slashes are stripped so callers can safely
// concatenate `${SITE_ORIGIN}/path`.
//
// One `NEXT_PUBLIC_*` env var so both server- and client-rendered
// code read the same value — the previous setup had a server-only
// SITE_ORIGIN and a client NEXT_PUBLIC_SITE_ORIGIN, which would
// drift the moment one was set and the other wasn't.
//
// NOTE: this is the public marketing origin (where users land when
// they tap a shared link). The API base lives in lib/apiBase.ts and
// is a separate value — they diverge on production (qift.net for
// the frontend, the Railway URL for the API).
export const SITE_ORIGIN: string = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://qift.net'
).replace(/\/+$/, '')
