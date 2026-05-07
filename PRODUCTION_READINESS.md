# Qift — Production Readiness Checklist

A live audit of what's ready, what's required, and what blocks a
public launch. Owners marked with `(@frontend)` / `(@backend)` /
`(@ops)` so we can split the list across the team without dropping
items.

> **Status legend**
> ✅ Done · 🟡 In progress / partial · 🔴 Not started · ⚙️ Config / env only

Last reviewed: 2026-05-08.

---

## 1. Required integrations

| Item                                              | Status | Notes                                                                                             |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Cloudflare R2 (avatar / posts media)              | ⚙️     | Working in dev; production needs `R2_*` env vars + `R2_PUBLIC_BASE_URL` set on Railway.           |
| Push notifications (VAPID)                        | ⚙️     | Code path live; production needs `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`.      |
| SMS OTP (Taqnyat)                                 | ⚙️     | Falls back to console-log in dev. Production needs `TAQNYAT_BEARER_TOKEN` + `TAQNYAT_SENDER`.     |
| Email transport (transactional)                   | 🔴     | Email is stored as a contact channel but we don't send anything. Pick a provider (Resend / SES). |
| Payment gateways (mada / knet / qpay / Apple Pay) | 🟡     | All mocked via `MockGateway`. Real PSP integration is the biggest production lift.                |
| Sentry (or equivalent error tracking)             | 🔴     | `app/error.tsx` is the hook — wire `Sentry.captureException(error)` in the `useEffect`.           |
| Analytics                                         | 🔴     | No event pipeline yet. Decide PostHog / GA4 / both before launch.                                 |
| Cloudflare R2 custom domain                       | 🟡     | Using `pub-*.r2.dev` works. Custom domain (e.g. `media.qift.net`) is preferred for trust.         |

## 2. Legal pages

| Item                                | Status |
| ----------------------------------- | ------ |
| `/terms` content (AR + EN)          | ✅     |
| `/privacy` content (AR + EN)        | ✅     |
| Cookie / tracking policy            | 🔴     |
| KSA-specific PDPL alignment review  | 🔴     |
| Last-updated dates accurate         | 🟡     |
| Footer link to /terms + /privacy    | ✅     |
| Refund / cancellation policy        | 🔴     |
| Merchant agreement                  | 🔴     |

## 3. Security tasks

| Item                                                   | Status | Notes                                                                                  |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| HTTPS / HSTS                                           | ✅     | `Strict-Transport-Security: max-age=31536000` in `next.config.ts`. Vercel terminates.  |
| `X-Frame-Options: DENY`                                | ✅     |                                                                                        |
| `X-Content-Type-Options: nosniff`                      | ✅     |                                                                                        |
| `Referrer-Policy: strict-origin-when-cross-origin`     | ✅     |                                                                                        |
| `Permissions-Policy` (camera/mic on, geolocation off)  | ✅     |                                                                                        |
| Strict Content-Security-Policy                         | 🟡     | Not shipped — Tailwind + Next inline styles. Needs nonce strategy. Tracked.            |
| HSTS preload submission                                | 🔴     | Wait until app has been on HTTPS-only for 4+ weeks before submitting (one-way door).    |
| Rate limits on sensitive endpoints                     | 🟡     | OTP send (5/5min), follow (30/min), contact-search (30/5min). Per-process — see notes. |
| Multi-replica rate limit (Redis)                       | 🔴     | Current limiter is in-memory; OK at single replica, leaky at N replicas.                |
| Auth tokens are JWT (HS256) with rotation plan         | 🟡     | `JWT_SECRET` rotation invalidates everything — fine for now, document for ops.          |
| Soft-delete on User                                    | ✅     | `deletedAt` filter applied across user lookups + search.                                |
| Phone OTP rate limit                                   | ✅     | 5 sends per 5 minutes (in-memory).                                                      |
| Admin route guard reads role from DB                   | ✅     | `AdminGuard` re-loads `User.role` per request; doesn't trust JWT.                       |
| Recipient address never leaves merchant scope          | ✅     | `applyAddressPrivacy` strips it for senders + admin gift list.                          |
| First-admin SQL bootstrap documented                   | ✅     | See `apps/api/PRIVATE_TESTING.md`.                                                       |
| Secret rotation runbook                                | 🔴     | Document the process for rotating `JWT_SECRET`, R2 keys, VAPID, Taqnyat.                |
| 2FA for admin accounts                                 | 🔴     | Currently no 2FA. Required before public launch.                                        |
| Audit log on admin mutations                           | 🔴     | `AdminGuard` ready; service methods take `viewerUserId` for logging — wire it.          |

## 4. Notifications

| Item                                                            | Status |
| --------------------------------------------------------------- | ------ |
| In-app bell + unread count                                      | ✅     |
| Web Push delivery                                               | ✅     |
| Deep-link to specific gift on every gift-flow notification      | ✅     |
| iOS Safari push — verified on real device                       | 🔴     |
| Email fallback when push is disabled                            | 🔴     |
| SMS for high-stakes notifications (recipient-no-address retry)  | 🔴     |
| Notification preferences UI on `/settings`                      | 🟡     |
| Notification rate-limit / coalescing                            | 🔴     |
| "Mark all as read" UX                                           | ✅     |

## 5. Payments

| Item                                                | Status |
| --------------------------------------------------- | ------ |
| Mock gateway works for every provider               | ✅     |
| mada (real)                                         | 🔴     |
| Apple Pay (real)                                    | 🔴     |
| Visa / Mastercard (real)                            | 🔴     |
| KNET / QPAY / Benefit / OmanNet (real)              | 🔴     |
| Idempotent payment confirm (race-safe)              | ✅     |
| Failed-payment recording                            | ✅     |
| Refund flow (admin / support)                       | 🔴     |
| Refund flow (sender-side, restricted)               | 🔴     |
| Receipt / invoice email                             | 🔴     |
| Saudi VAT handling                                  | 🔴     |
| 3-D Secure flow (per-provider)                      | 🔴     |
| Per-currency rounding rules                         | 🟡     |

## 6. Merchant tasks

| Item                                                          | Status |
| ------------------------------------------------------------- | ------ |
| `/store-dashboard` fulfilment queue                           | ✅     |
| Status transitions (preparing → shipped → delivered)          | ✅     |
| Idempotent transitions                                        | ✅     |
| Tracking number / carrier per shipment                        | ✅     |
| Merchant API keys (placeholder card visible in `/admin`)      | 🟡     |
| Webhook signing key on `Store`                                | ✅     |
| Real merchant onboarding flow                                 | 🔴     |
| Merchant agreement / KYC                                      | 🔴     |
| Per-store payouts / settlement                                | 🔴     |
| Real shipping integrations (SMSA / Aramex / J&T)              | 🔴     |
| Store approval workflow (admin can approve/reject/suspend)    | ✅     |

## 7. Analytics & monitoring

| Item                                       | Status |
| ------------------------------------------ | ------ |
| Server logs (Railway → log drain)          | ⚙️     |
| Frontend error reporting (Sentry / etc.)   | 🔴     |
| Backend error reporting                    | 🔴     |
| Uptime monitoring                          | 🔴     |
| Database backup schedule                   | ⚙️     |
| Funnel analytics (sender → checkout → win) | 🔴     |
| Notification delivery dashboard            | 🔴     |

## 8. App store preparation

| Item                                  | Status |
| ------------------------------------- | ------ |
| PWA manifest + installable            | 🟡     |
| App icon / splash assets              | 🟡     |
| iOS Capacitor / native shell          | 🔴     |
| Android Capacitor / native shell      | 🔴     |
| Apple Developer account               | 🔴     |
| Google Play Console account           | 🔴     |
| App Store screenshots / copy          | 🔴     |
| Privacy nutrition label (Apple)       | 🔴     |
| Data safety section (Google Play)     | 🔴     |
| Account deletion flow (Apple req.)    | 🔴     |

## 9. Launch blockers

In strict priority order — these must each turn green before opening
Qift to the public.

1. **Real payment gateway integration** (at minimum mada + Apple
   Pay). Everything else is moot if money can't flow.
2. **Email transport wired** so receipt + auth emails can be sent.
3. **2FA for admin accounts** — admin can promote anyone to admin;
   compromising one admin compromises the whole app.
4. **Sentry (or equivalent)** wired in `app/error.tsx` and on the
   API. Today a render crash silently shows a banner; in prod we
   need the call stack in our inbox.
5. **Refund / cancellation policy + sender-facing wording** — once
   real money flows, we need a clear contract for "I changed my
   mind".
6. **PDPL + KSA legal review** of `/terms` + `/privacy`.
7. **Shipping integration** (or merchant-driven manual fulfilment
   with a stable courier handoff).
8. **Account deletion flow** (Apple App Store requires it).
9. **Multi-replica rate-limiter** (Redis) — current in-memory
   limiter leaks under autoscaling.
10. **HSTS preload submission** — only after the app has been on
    HTTPS-only for 4+ weeks (one-way door).

## 10. Post-launch priorities

- Wishlist gifting (recipient flags an item; senders can fulfil it).
- Group / pooled gifts (multiple senders, one gift).
- Public profile SEO (per-user pages indexable opt-in).
- Per-merchant landing pages with rich OG.
- Real wallet / saved cards.
- iOS / Android binaries.
- Push notification delivery analytics.
- Server-side OAuth verification for social platforms.
- Email verification (`emailVerifiedAt` is plumbed; the OTP flow
  itself isn't shipped).
- Admin audit log surface.
- Per-merchant API + webhook system.

---

## What this audit ALSO shipped

The following polish landed alongside this checklist (search for
the matching commit):

- `app/error.tsx` — root error boundary with Try-again + Go-home,
  premium styling, no i18n / auth dependencies (it has to render
  even when those crash).
- `app/loading.tsx` — instant route-level spinner using CSS-var
  tokens so theme switches keep working without JS.
- `next.config.ts` — security headers (`X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security`).
- `app/robots.ts` — disallow all authed routes; allow public
  marketing surfaces.
- `app/sitemap.ts` — static sitemap of public surfaces.
- Rich OG / Twitter metadata in `app/layout.tsx`. Theme-color and
  viewport in a separate `viewport` export per Next 16's deprecation.
- Cleaned a stale `PROFILE` import from `app/settings/page.tsx`
  (the lint warning that survived the `/settings` real-data
  rewrite).
