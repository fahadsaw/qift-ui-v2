// Single source of truth for the backend API base URL.
//
// Reads NEXT_PUBLIC_API_URL at build time and falls back to localhost:4000
// for local dev so a missing/empty env var doesn't silently degrade to a
// relative URL (which would resolve against the Next dev origin on
// localhost:3000 and 404 every API call).
//
// `||` (not `??`) is intentional — an explicit empty string is also
// invalid for an API base, and we want to fall back in that case too.
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
