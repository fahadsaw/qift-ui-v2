# Phase 2 — Linked phone numbers (multi-phone identity)

**Status:** spec only — NO schema migration, NO endpoint, NO frontend writer ships with this document.
**Scope:** lets a user attach additional verified phone numbers to a single Qift account, beyond the one phone they registered with.
**Predecessors:**
- Phase 1 (this PR) — surfaces the existing primary phone + its verification + discoverability state in `/settings` via `<AccountIdentityCard>`.
- `frontend/discoverability-self-check` — adds `<DiscoverabilityCheck>` so the user can see how others would find them.

This doc is the canonical design reference for the next code-bearing PR. Once that PR lands, this file should be marked obsolete (or replaced with a `PHASE_2_LINKED_PHONES_CLOSURE.md`).

---

## 1. Problem

The current schema treats `User.phone` as a single, registration-bound contact field. That conflates three different concerns:

1. **Login identifier** — the phone the OTP was sent to during register; must be unique across accounts.
2. **Verified contact channel** — a number Qift can use to reach the user (gift-receipt SMS, address-confirmation reminders).
3. **Discoverability handle** — the value a sender can search to find this user.

A real-world user has more than one phone: a personal number, a work number, sometimes a second SIM. Today they can only attach ONE to Qift. Senders who know a different number than the one this user registered with cannot find them at all.

Phase 2 separates the three concerns. The registration phone stays as the login identifier (immutable except via a deliberate "change primary phone" flow with re-OTP). Additional phones become discoverable contact channels the user can add and remove freely.

---

## 2. Schema

### 2.1 New table — `LinkedPhone`

```prisma
model LinkedPhone {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Stored in E.164 canonical form (`+966501234567`). The same
  // normalizePhone() helper used at /auth/register canonicalises
  // the input before persistence — no per-row normalization drift.
  phone         String

  // Optional user-supplied label so the user can tell their
  // numbers apart in the linked-accounts surface ("Work", "iPad
  // eSIM", "Mom's spare"). Free text, max 40 chars, no privacy
  // implications — only the owner sees it.
  label         String?  @db.VarChar(40)

  // Verification state. Mirrors the User.phoneVerifiedAt shape so
  // a search query can union over (User.phone, LinkedPhone.phone)
  // with identical predicates. Null = unverified.
  verifiedAt    DateTime?

  // Per-number discoverability switch. Default-deny: a number is
  // only searchable once the user explicitly opts that number in
  // (mirrors the User.allowEmailDiscovery default-deny posture).
  // The User.allowPhoneDiscovery global is preserved unchanged —
  // it gates the PRIMARY phone exactly as today. Adding a global
  // "all my phones are searchable" switch would conflate primary
  // + secondary semantics, so each secondary phone carries its
  // own per-row flag.
  discoverable  Boolean  @default(false)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Same uniqueness invariant as User.phone: a given E.164 string
  // can appear on at most ONE Qift account, anywhere — primary
  // OR secondary. The validator at write time runs:
  //   1. SELECT id FROM "User" WHERE phone = $1
  //   2. SELECT id FROM "LinkedPhone" WHERE phone = $1
  // and rejects with `phone_taken` if either hits.
  @@unique([phone])
  // Index for the search-side phone lookup (per-user uniqueness
  // also gives us a cheap "is this number already on my account"
  // probe).
  @@unique([userId, phone])
  @@index([userId])
}
```

### 2.2 `User` model — no schema change

The existing columns stay exactly as they are:

```prisma
phone                String   @unique
phoneVerifiedAt      DateTime?
allowPhoneDiscovery  Boolean  @default(true)
```

`User.phone` remains the PRIMARY phone (login identifier + the row a non-discoverable account's recovery SMS targets). `LinkedPhone.phone` rows are strictly additive.

### 2.3 Backwards compatibility

The migration is **purely additive**:
- `LinkedPhone` is a new table; no existing row changes.
- No backfill required — every existing User has `phone` populated, and they remain searchable via the existing primary-phone path on day one.
- Removing `LinkedPhone` (rollback) restores the system to exactly today's behaviour. The migration is reversible.

---

## 3. API

### 3.1 Reads

| Method + path | Returns | Notes |
|---|---|---|
| `GET /users/me` | unchanged | Still returns the primary phone. Frontend gets secondaries via the new endpoint. |
| `GET /phones/me` | `LinkedPhone[]` (owner-only) | Owner's secondary numbers + their verification + discoverability state. Primary is NOT included — that lives on `/users/me`. |

`GET /phones/me` projection (matches what `<AccountIdentityCard>` would render):

```ts
{
  id: string
  phone: string          // E.164
  label: string | null
  verifiedAt: string | null
  discoverable: boolean
  createdAt: string
}
```

### 3.2 Writes — OTP-bound add flow

```
POST /phones/start        body: { phone, label? }
  → 200 { pendingPhoneId, otpChannel: 'sms' }
  → 409 phone_taken (already on this user OR another user)
  → 400 invalid_phone   (normalizePhone returned null)

POST /phones/:id/verify   body: { code }
  → 200 LinkedPhone (row promoted from pending → verified)
  → 400 invalid_code | expired_code
  → 410 verification_expired   (the start row TTL passed)
```

Implementation note: the "start" endpoint creates the `LinkedPhone` row immediately with `verifiedAt = null` AND mints an `Otp` row keyed by the same E.164 string. The `verify` endpoint runs the same `OtpService.verify()` used by `/auth/register` — single source of truth for OTP semantics (rate limit, expiry, single-use consumption).

A pending row (verifiedAt = null) is hidden from search by definition (search filters on `verifiedAt: { not: null }`). The user sees it on `/social-accounts` as "pending — verify your number" with a resend-OTP CTA.

### 3.3 Writes — manage existing

```
PATCH /phones/:id          body: { label?, discoverable? }
  → 200 LinkedPhone
DELETE /phones/:id
  → 204
POST /phones/:id/resend-otp
  → 200 { otpChannel: 'sms' }
  → only allowed when verifiedAt = null
```

`PATCH` only accepts metadata mutations (label, discoverable). Changing the actual phone number requires `DELETE` + `POST /phones/start` — keeps verification semantics intact.

### 3.4 Primary phone rotation (out of scope here)

Rotating `User.phone` is a separate auth-level operation (re-OTP, single-step flow on `/auth/change-phone`). Phase 2 does NOT touch it. The primary phone stays bound to the login identifier; users who want a different "main" number can add it as a secondary with `discoverable=true` — both will resolve in search.

---

## 4. Search integration

The current `users.service.searchUsers` phone branch:

```ts
phone: e164,
allowPhoneDiscovery: true,
profileVisibility: { not: 'private' },
```

Phase 2 widens this to a union over the two phone sources:

```ts
const e164 = resolvePhoneE164(term, dial);
if (!e164) return [];

const rows = await this.prisma.user.findMany({
  where: {
    deletedAt: null,
    id: { not: viewerUserId, ...(excludedFilter ?? {}) },
    profileVisibility: { not: 'private' },
    OR: [
      // Primary phone — existing path, unchanged.
      { phone: e164, allowPhoneDiscovery: true },
      // Secondary phone — must be VERIFIED (verifiedAt set) AND
      // explicitly discoverable. Default-deny on both gates.
      {
        linkedPhones: {
          some: {
            phone: e164,
            verifiedAt: { not: null },
            discoverable: true,
          },
        },
      },
    ],
  },
  select: PUBLIC_PROJECTION,
  take: 1,
});
```

The `take: 1` cap stays — phone uniqueness across both tables guarantees at most one hit. The `matchedField: 'phone'` projection stays as today (we never reveal which of the user's numbers matched — same privacy posture as social: don't echo the searched value back).

### 4.1 Eligibility predicate symmetry

The matcher conceptually treats `User.phone` as if it were a `LinkedPhone` row with `verifiedAt = phoneVerifiedAt` and `discoverable = allowPhoneDiscovery`. A future schema cleanup could unify them by moving the primary into a `LinkedPhone(isPrimary: true)` row — but that's a bigger migration with login-flow risks. The union-of-two-tables approach lands the user-visible feature without touching auth.

---

## 5. Privacy invariants

The Phase 2 widening MUST preserve every existing invariant. Restated:

1. **No public exposure.** Linked phones never appear on a public profile (`/u/:username`) or in `/users/@/:username`. They're owner-only.
2. **Search returns the Qift profile, not the phone.** `matchedValue` stays empty — we don't echo a phone back to a searcher under any condition.
3. **Default-deny.** Secondary phones default to `discoverable: false`. The user must explicitly opt each one in.
4. **Verification mandatory for search.** A pending (unverified) phone is invisible to search regardless of the discoverable flag.
5. **Private profile shields all phones.** `profileVisibility = 'private'` hides every phone, primary and secondary alike, from contact-channel search. Same posture today.
6. **Block list bidirectional.** The existing `blocks.listExcludedIds` filter applies to the new path identically.
7. **Self-exclusion preserved.** Searchers never find their own profile via any of their phones.
8. **Uniqueness across tables.** A given E.164 string can appear on at most one account anywhere. Stops a malicious user from "claiming" an existing user's number.

---

## 6. UI changes (Phase 2 frontend PR)

### 6.1 `/social-accounts` — rename + extend

Today: "Linked social accounts" — surfaces primary phone (read-only), primary email, plus 8 social platforms.

Phase 2: "Linked accounts" — same shape, but the phone section grows from a single read-only row to a list:

```
┌─ Linked phones ─────────────────────────────────┐
│ +966501234567   [Primary] [Verified] [Findable] │  ← User.phone
│ +966555512345   [Work]    [Verified] [Findable] │  ← LinkedPhone
│ +9710501234567  [Pending — verify]              │  ← unverified LinkedPhone
│                                                  │
│ [+ Add another phone number]                     │
└──────────────────────────────────────────────────┘
```

Each row gets:
- Chip strip (Primary / verification / discoverability)
- Inline label edit
- Discoverability toggle (per row — except Primary, which still flows through `allowPhoneDiscovery`)
- Remove (Primary cannot be removed — link grays out with a hint)

### 6.2 `<AccountIdentityCard>` (Phase 1)

Already ships in this PR with a "manage in Linked accounts" link. Phase 2 reuses the same component verbatim — only the `Manage` link's destination becomes more capable.

### 6.3 `<DiscoverabilityCheck>` extension

The per-channel verdict list grows from a single "Phone" row to one row per phone:

```
Phone — +966 •••• 4567 (Primary)     [Findable]
Phone — +966 •••• 5234 (Work)        [Findable]
Phone — +971 •••• 4567 (UAE)         [Hidden — discoverability OFF]
```

Each row carries its label so the user can see WHICH number is hidden.

---

## 7. Migration plan

| Step | Repo | Risk |
|---|---|---|
| 1 — Doc (this file) | qift-ui-v2 (Phase 1 PR) | 0 — read-only |
| 2 — Backend: Prisma migration + zod validators + new endpoints + spec tests | qift-platform/apps/api | Medium — DB migration. Reversible. |
| 3 — Backend: extend `searchUsers` phone branch with the OR clause | qift-platform/apps/api | Low — additive |
| 4 — Frontend: extend `/social-accounts` UI to manage `LinkedPhone[]` | qift-ui-v2 | Low |
| 5 — Frontend: extend `<DiscoverabilityCheck>` per-phone rows | qift-ui-v2 | Low |
| 6 — Backend: smoke-test against the existing search spec suite + add `users-search-phone.spec.ts` (currently missing) | qift-platform/apps/api | Low |

Each step is independently revertable. The frontend write surface (steps 4-5) does nothing useful until step 2 lands but degrades cleanly (the `+ Add` button shows a "coming soon" hint if the endpoint 404s).

---

## 8. Open questions (need product input before backend PR)

| # | Question | Why it matters |
|---|---|---|
| OQ-1 | Cap on number of linked phones per account? | A hard cap (e.g. 5) prevents abuse where one account hoards many numbers; absence of cap is friendlier for power users. Recommend cap = 5 with operational override for admin. |
| OQ-2 | What happens to LinkedPhone rows when a user soft-deletes their account? | Symmetric with primary phone: kept on the row (deletedAt is set on User; LinkedPhone Cascade-deletes today). A future "reclaim my number" flow would need to keep the row until purge. |
| OQ-3 | Can a secondary phone be used for OTP login? | NO in Phase 2 — only the primary is a login channel. Phase 3 could open this up but it widens the attack surface. |
| OQ-4 | Should the search response signal which phone matched (primary vs secondary)? | Argue NO — same privacy posture as social search. The sender knows the number they typed; revealing "this matched your secondary work number" leaks the existence of secondaries. |
| OQ-5 | Per-number SMS opt-in (gift-receipt notifications)? | Out of scope here; covered by the notification preferences orchestrator if/when SMS becomes a notification channel. |

---

## 9. What this doc does NOT propose

- Email-style multi-email (`LinkedEmail` table) — out of scope; the same shape could apply but the user report didn't ask for it.
- Verifying social handles via OAuth — separate document; the existing `verificationLevel` enum on `SocialAccount` is the placeholder.
- Phone-as-login for secondary numbers — see OQ-3.
- A unified contact-method table (phones + emails + socials in one schema) — too large a refactor for the value gained.
