# Phase 1B — Identity change flow + admin controls

**Status:** spec — accompanies the backend branch `backend/identity-and-admin-controls` (already pushed; commits C1 + C2) and the frontend branch `frontend/identity-change-flow-and-admin-controls` (this branch).
**Scope:** the remaining work the user approved in the identity + admin audit. C1 (phone self-heal on login) and C2 (admin disable/restore endpoints) shipped in the backend PR. The work below covers C3 (change-phone), C4 (change-email), and the frontend wiring for everything from C1 → C4 plus the admin UI for role / disable / restore.

This doc is the canonical reference so the next code-bearing PR can be reviewed against an agreed contract rather than as a code-only diff.

---

## 1. What's already shipped

### Backend — `backend/identity-and-admin-controls` (pushed)

**Commit C1 — `fix(auth): self-heal pre-normalize phones on password login`**
After `bcrypt.compare()` passes in `auth.service.login`, the service runs `normalizePhone(user.phone)` and atomically rewrites `User.phone` if the stored value isn't canonical E.164. Closes the "OLD accounts (registered 2026-05-05..05-07) are invisible to exact-match phone search" gap. P2002 collisions are caught so a duplicate doesn't block login.

**Commit C2 — `feat(admin): user disable/restore endpoints + soft-delete-aware listing`**
- `PATCH /admin/users/:id/disable` — gated by `user.suspend` (super_admin + trust_safety)
- `PATCH /admin/users/:id/restore` — gated by NEW `user.restore` permission (super_admin + trust_safety)
- `GET /admin/users?includeDisabled=1` — surfaces soft-deleted rows for restore candidates
- `ADMIN_USER_SELECT` extended with `deletedAt` so the frontend can render a Disabled chip
- Audit calls staged behind `recordAuditTODO()` — swap to `AuditService.record()` once the audit-module branch merges to `main`

### Frontend — `frontend/discoverability-self-check` (shipped 2 PRs ago)

- `<AccountIdentityCard>` on `/settings` — first card showing phone + email + verification chips
- `<DiscoverabilityCheck>` — masked view of "what others would see"
- Non-2xx error toasts on `/search`
- Self-exclusion hint in the search empty state

---

## 2. C3 — Change phone (backend)

The user picked **"OTP to NEW + password re-prompt"** as the security model.

### 2.1 Endpoints

```
POST /auth/change-phone/start
  body: { currentPassword: string, newPhone: string }
  auth: JwtAuthGuard (req.user.userId is the actor)

  → 200 { ok: true, otpChannel: 'sms', newPhoneE164: string }
  → 400 invalid_password
  → 400 invalid_phone          (normalizePhone returned null)
  → 409 phone_taken            (User.phone already holds this E.164,
                                 anywhere on the platform)
  → 429 too_many_attempts      (per-viewer rate limit)
```

Implementation outline:
1. Look up `req.user.userId`. Reject if `deletedAt != null`.
2. `bcrypt.compare(currentPassword, user.passwordHash)`. Reject `invalid_password` if no match.
3. `newPhoneE164 = normalizePhone(newPhone)` — reject `invalid_phone` if null.
4. Idempotency guard — if `newPhoneE164 === user.phone`, return 400 `phone_unchanged`.
5. Uniqueness probe across `User.phone`. Reject `phone_taken` if hit (any other account).
6. Generate OTP via `OtpService.send(newPhoneE164, 'phone')`. This reuses the existing send-rate-limit (1 / 60s) and the existing OTP TTL (5 minutes).
7. Return `{ ok: true, otpChannel: 'sms', newPhoneE164 }` — the frontend uses the echoed E.164 to show "we sent a code to +966…4567".

```
POST /auth/change-phone/verify
  body: { code: string, newPhone: string }
  auth: JwtAuthGuard

  → 200 { ok: true, user: SanitisedUser }
  → 400 invalid_code | expired_code
  → 400 invalid_phone | phone_unchanged
  → 409 phone_taken (TOCTOU — another account claimed it after start)
```

Implementation outline:
1. Re-derive `newPhoneE164 = normalizePhone(newPhone)`.
2. Find the OTP via `OtpService.verify(newPhoneE164, code, 'phone')` — single-use, expiry-checked, brute-force-locked.
3. Re-check uniqueness against `User.phone` (TOCTOU window).
4. Atomic update:
   - `phone = newPhoneE164`
   - `phoneVerifiedAt = now()`
   - `allowPhoneDiscovery` UNCHANGED (the user's existing preference is preserved)
5. `recordAuditTODO({ action: 'user.phone_changed', actorUserId, targetType: 'user', targetId: userId, metadata: { /* never the values themselves */ } })`.
6. Return the sanitised user envelope.

### 2.2 Privacy invariants

| Rule | Enforcement |
|---|---|
| Old phone never appears in the response | Sanitiser drops it from the user payload as it already does |
| New phone visible only on the owner's `/users/me` thereafter | Same SAFE_USER_SELECT projection |
| Audit metadata never contains phone values | `recordAuditTODO()` metadata uses opaque keys (`{ direction: 'change' }`); no `before/after` strings |
| OTP send is rate-limited per viewer + per destination | Inherited from `OtpService.send()` (1/60s per target) |
| Verify path is brute-force locked | Inherited from `OtpService.verify()` (Week-1 F1 hardening) |

### 2.3 What this does NOT do

- **Does not let the user log in with the old phone after the change.** Login lookup is keyed on the new `User.phone`. Pre-existing JWT remains valid until expiry — the access token isn't tied to a specific phone value, only to `sub` = userId.
- **Does not invalidate sessions on other devices.** Adding a server-side token-revocation list is a follow-up — for closed beta, JWT lifetime is short enough that this is acceptable.
- **Does not retire the legacy `PATCH /users/me/email` (see C4 §3.5).**

---

## 3. C4 — Change email (backend)

Same shape as change-phone with three differences:
- Channel is `email` (uses `MailService.send` via `OtpService.send`).
- Email may currently be NULL on the row (no email set). In that case "change" is really "add and verify".
- The legacy unverified `PATCH /users/me/email` path must be deprecated.

### 3.1 Endpoints

```
POST /auth/change-email/start
  body: { currentPassword: string, newEmail: string }
  auth: JwtAuthGuard

  → 200 { ok: true, otpChannel: 'email', newEmailNormalized: string }
  → 400 invalid_password
  → 400 invalid_email          (shape check failed)
  → 400 email_unchanged
  → 409 email_taken
  → 429 too_many_attempts

POST /auth/change-email/verify
  body: { code: string, newEmail: string }
  auth: JwtAuthGuard

  → 200 { ok: true, user: SanitisedUser }
  → 400 invalid_code | expired_code | invalid_email | email_unchanged
  → 409 email_taken
```

### 3.2 Verify-path update

On verify success:
- `email = lower(newEmail)`
- `emailVerifiedAt = now()`
- `allowEmailDiscovery` UNCHANGED (the user's existing preference is preserved — default-deny if never set)

### 3.3 Deprecation — legacy `PATCH /users/me/email`

The current endpoint allows unverified email edit (resets `emailVerifiedAt = null` and writes the new value). It must be:
- Hard-blocked (returns `410 use_change_email_flow`) once C4 ships, OR
- Kept for backwards compatibility with the existing `/social-accounts` UI for a deprecation window

Recommendation: **keep one release window** so the frontend can migrate, then remove. Add a comment + `console.warn` at the call site.

### 3.4 Email channel reuse

The user could already register via email-OTP (`channel: 'email'` on `/auth/register`). The OTP infrastructure is identical between register and change-email — the dispatch helper (`OtpService.send(target, 'email')`) and the verify helper (`OtpService.verify(target, code, 'email')`) handle both.

### 3.5 Frontend implication

The Settings `<AccountIdentityCard>` row currently routes "Manage email" to `/social-accounts`, which today exposes the legacy unverified PATCH. Once C4 ships, both surfaces should call the new OTP-bound flow. The `/social-accounts` page is the better home for the modal — it's already the "linked accounts" hub.

---

## 4. C5 — Frontend wiring

### 4.1 New components

```
components/ChangePhoneModal.tsx
components/ChangeEmailModal.tsx
```

Both are two-step modals:

**Step 1 — Password + new value**
- Title: "Change phone number" / "Change email"
- Body:
  - Current password field (`type="password"`, autocomplete="current-password")
  - New phone input (with dial picker — reuses `<DialPicker>` from `/register`) / new email input
  - Calm hint: "We'll send a one-time code to confirm this is yours"
- CTAs: Cancel · Send code (disabled until shape valid)
- Submit → `POST /auth/change-phone/start` or `/change-email/start`
- On 200: advance to Step 2
- On 400 `invalid_password`: inline error under the password field
- On 409 `phone_taken` / `email_taken`: inline error under the new-value field
- On 429: toast `search.rate_limited`-style message

**Step 2 — OTP code**
- Title: "Enter the code we sent"
- Hint: "Sent to <masked new value> · expires in 5 minutes"
- 6-digit code input (reuses `<OtpInput>` from `/register`)
- CTAs: Back · Verify
- Submit → `POST /auth/change-phone/verify` or `/change-email/verify`
- On 200: close modal, refresh `/users/me`, toast "Phone updated"
- On 400 `invalid_code` / `expired_code`: inline error
- Resend CTA → calls `/start` again

### 4.2 AccountIdentityCard integration

The card's "Manage in Linked accounts" link is replaced with a "Change" button per row that opens the corresponding modal in-place. Falls back to the link when the modal can't render (e.g. accessToken absent).

### 4.3 Admin UI — user action menu

`/admin#users` rows get a kebab-menu trailing action with:
- **Change role** — opens an existing role picker (already present)
- **Disable** (when `deletedAt == null`) — opens a confirmation modal:
  - "Disable this account?"
  - Subtext lists the visible effects (search removal, login block, public profile hidden)
  - Confirm CTA labeled "Yes, disable" with a 1-second delay so muscle-memory clicks don't fire
  - `PATCH /admin/users/:id/disable`
- **Restore** (when `deletedAt != null`) — confirmation modal, same shape
  - `PATCH /admin/users/:id/restore`

Plus a toggle at the top of the user list: **"Show disabled accounts"** → toggles `?includeDisabled=1`.

### 4.4 Translations

Approx 30 new keys (AR + EN):
- `change_phone.title`, `_subtitle`, `_password_label`, `_new_phone_label`, `_send_code`, `_otp_title`, `_otp_subtitle`, `_verify`, `_resend`, `_success_toast`, `_error_*`
- Mirror set for `change_email.*`
- `admin.user_action.disable`, `_restore`, `_change_role`, `_confirm_disable_title`, `_confirm_disable_body`, `_confirm_restore_*`, `_show_disabled_toggle`

### 4.5 RBAC permission frontend mirror

The C2 backend commit added `user.restore` to `ops-roles.ts` + `permissions.ts`. The frontend mirror at `qift-ui-v2/lib/rbac/permissions.ts` must add the same identifier to satisfy the CI parity check documented at the top of the file.

---

## 5. Why this is split into a follow-up PR (not bundled with C1/C2)

The "small focused commits" guideline and the closed-beta safety constraint argue for shipping C1 + C2 first (low-risk, no auth surface) and reviewing them before introducing change-phone/change-email — those flows touch `auth.service` and need both their own backend test suite AND a careful frontend modal UX pass.

The split also lets the user's WIP on `backend/week2-admin-perms-and-anon-notif` merge cleanly. Once it does:
- The AuditService injection swap (`recordAuditTODO()` → `audit.record()`) becomes a 3-line change
- The change-phone/change-email PR can include the audit calls from day one

---

## 6. Open questions before C3/C4 implementation

| # | Question | Default |
|---|---|---|
| OQ-1 | Should the change-phone OTP also re-stamp `phoneVerifiedAt` when the NEW phone === OLD phone (i.e. "re-verify same number")? | Reject as `phone_unchanged`. Re-verifying is a future flow; if needed, separate endpoint `/auth/reverify-phone`. |
| OQ-2 | When email is currently NULL, should `change-email/start` be allowed (i.e. "add an email")? | YES. The password re-prompt is sufficient proof-of-account-ownership; the OTP is sufficient proof-of-channel-ownership. |
| OQ-3 | Should the legacy `PATCH /users/me/email` be deprecated immediately or kept for one release? | One release. Frontend migrates the `/social-accounts` email-edit form to the new flow; then remove. |
| OQ-4 | Cap on change-phone attempts per day? | 3 attempts / 24 hours per viewer (a 4th attempt 429s with `change_phone_daily_limit`). Same shape for email. |
| OQ-5 | Should disabled accounts get a notification when restored? | NO. The user already lost access at disable time; signalling restore would require a verified channel they may have forgotten. Frontend just lets them log in again. |

---

## 7. Migration / repair recommendation (recap from audit)

**Phone normalisation backfill:** Self-heal on login (Option B) is the safest. Shipped in C1. Old phones get canonicalised the next time their owner logs in. Dormant accounts stay malformed until they log in OR an admin runs a per-row repair (Option C — `PATCH /admin/users/:id/repair-phone` is a possible future surface, scoped to super_admin + tagged with the same `recordAuditTODO` so the operation is logged).

**Email discoverability default-deny on old rows:** No action needed in code. The Settings UI already surfaces the toggle; users who want email discoverability can opt in.

---

## 8. Definition-of-done for the C3/C4/C5 follow-up PR

- [ ] Backend: change-phone start + verify endpoints with tests
- [ ] Backend: change-email start + verify endpoints with tests
- [ ] Backend: legacy `PATCH /users/me/email` gets `console.warn` deprecation notice
- [ ] Frontend: `<ChangePhoneModal>` + `<ChangeEmailModal>` + integration into `<AccountIdentityCard>`
- [ ] Frontend: admin user-action menu (Change role / Disable / Restore) + confirmation modals
- [ ] Frontend: `lib/rbac/permissions.ts` adds `user.restore` (parity with backend)
- [ ] Translations: ~30 new keys AR + EN
- [ ] Verification: tsc + eslint + next build (frontend) + tsc + jest (backend)
- [ ] No backend audit-write swaps in this PR — they land alongside the audit-module merge
