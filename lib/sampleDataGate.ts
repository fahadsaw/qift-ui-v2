// Sample-data gate — single source of truth for whether the UI is
// allowed to render the sample storefront / explore feed / sample
// social graph from `lib/sampleData.ts`.
//
// HISTORY
// -------
// The previous design used `NEXT_PUBLIC_HIDE_SAMPLE_STORES=1` as an
// opt-OUT flag. Default behaviour was "show sample data" — meaning a
// production deploy without the flag set would expose a fictional
// storefront to real users. That's exactly the failure mode flagged
// in the pre-Stage-7 audit.
//
// CURRENT DESIGN
// --------------
// 1. The flag is now opt-IN: `NEXT_PUBLIC_SHOW_SAMPLE_DATA=1` enables
//    sample data. Any other value (including unset) keeps it OFF.
// 2. In production builds (NODE_ENV=production), the flag is FORCED
//    OFF regardless of value — fictional data must never ship to
//    production users, full stop. A loud console.error is emitted
//    when this override fires so a misconfigured deploy is noisy
//    rather than silent.
// 3. The legacy `NEXT_PUBLIC_HIDE_SAMPLE_STORES` is no longer
//    consulted. Old deploys that relied on it will resolve to
//    "no sample data", which is the safe default.
//
// USAGE
// -----
// Import `samplesEnabled()` (or the convenience constant
// `SAMPLES_ENABLED` — evaluated once at module load) wherever you'd
// otherwise gate on the env var directly. Do NOT read
// `process.env.NEXT_PUBLIC_SHOW_SAMPLE_DATA` from page code; the
// production guard lives here and bypassing it defeats the gate.

// Evaluate the gate exactly once. The result is stable for the
// lifetime of the runtime; Next.js inlines NEXT_PUBLIC_* env vars at
// build time, so re-reading on every render would be wasted work.
function evaluate(): boolean {
  const flag = process.env.NEXT_PUBLIC_SHOW_SAMPLE_DATA === '1'
  const isProd = process.env.NODE_ENV === 'production'

  if (flag && isProd) {
    // Loud, but never throws — a soft failure here keeps the app
    // bootable while making the misconfiguration impossible to miss
    // in production logs / browser consoles.
    console.error(
      '[sampleDataGate] NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 detected in a ' +
        'production build. Sample data is FORCED OFF in production ' +
        'regardless of this flag. Remove the env var from the ' +
        'production environment to silence this message.',
    )
    return false
  }

  return flag
}

export const SAMPLES_ENABLED: boolean = evaluate()

// Functional form for callers that prefer it. Same value as the
// constant above; provided for symmetry with the rest of the gate
// helpers in this codebase.
export function samplesEnabled(): boolean {
  return SAMPLES_ENABLED
}
