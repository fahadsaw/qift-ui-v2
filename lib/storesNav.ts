// Shared helpers for the /stores funnel restore behaviour.
//
// /stores/[id] writes its full URL (`pathname + search`) to
// `qift.stores.lastDetailHref` on mount. Whenever the user re-enters
// /stores via bottom-nav or a direct deep-link (no query params), the
// /stores page reads that value and `router.replace`s to it, so the
// browsing state is "sticky" across profile detours.
//
// To avoid getting stuck in the funnel, three call sites must clear the
// breadcrumb before navigating to /stores:
//   1. The "← back to all stores" button on the detail page.
//   2. The "Send gift" button in the followers/following modal — that
//      click is "I want to start a NEW gift funnel for @user".
//   3. The "Send gift" button on the public profile — same reasoning.
//
// Centralising the key here means a future rename ripples through every
// caller. The function is intentionally trivial; it exists for the
// type-safe import, not the body.

const SS_KEY_LAST_DETAIL_HREF = 'qift.stores.lastDetailHref'

export function clearStoresLastDetailHref(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(SS_KEY_LAST_DETAIL_HREF)
  } catch {
    /* ignore — private mode / blocked storage just means no restore */
  }
}
