'use client'

import { useSyncExternalStore } from 'react'

export type AuthUser = {
  id: string
  fullName?: string | null
  qiftUsername?: string
  phone?: string
  email?: string | null
  defaultAddress?: string | null
  // Backend role discriminator. 'store' users own at least one Store
  // row and get the merchant fulfilment dashboard surfaced in
  // /settings. Authoritative authorization is still server-side via
  // StoreGuard — this field is only a UI hint, never a security
  // boundary.
  role?: 'user' | 'store'
}

export type AuthSnapshot = {
  accessToken: string | null
  userId: string | null
  user: AuthUser | null
}

const TOKEN_KEY = 'accessToken'
const USER_ID_KEY = 'userId'
const USER_KEY = 'qiftUser'
const EVENT = 'qift:auth-changed'

const EMPTY: AuthSnapshot = { accessToken: null, userId: null, user: null }

function read(): AuthSnapshot {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = localStorage.getItem(USER_KEY)
    return {
      accessToken: localStorage.getItem(TOKEN_KEY),
      userId: localStorage.getItem(USER_ID_KEY),
      user: raw ? (JSON.parse(raw) as AuthUser) : null,
    }
  } catch {
    return EMPTY
  }
}

// Module-level snapshot kept stable so useSyncExternalStore doesn't loop.
let snapshot: AuthSnapshot = typeof window === 'undefined' ? EMPTY : read()
const listeners = new Set<() => void>()

function refresh() {
  snapshot = read()
  listeners.forEach((cb) => cb())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (
      e.key === null ||
      e.key === TOKEN_KEY ||
      e.key === USER_ID_KEY ||
      e.key === USER_KEY
    ) {
      refresh()
    }
  })
  window.addEventListener(EVENT, refresh)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): AuthSnapshot {
  return snapshot
}
function getServerSnapshot(): AuthSnapshot {
  return EMPTY
}

export function getAuth(): AuthSnapshot {
  return read()
}

export function setAuth(opts: {
  accessToken: string
  userId: string
  user?: AuthUser | null
}) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKEN_KEY, opts.accessToken)
    localStorage.setItem(USER_ID_KEY, opts.userId)
    if (opts.user) {
      // Strip sensitive fields defensively before persisting.
      const safe = { ...opts.user } as Record<string, unknown>
      delete safe.passwordHash
      localStorage.setItem(USER_KEY, JSON.stringify(safe))
    }
  } catch {
    // private mode / quota — non-fatal
  }
  window.dispatchEvent(new Event(EVENT))
}

export function clearAuth() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    // non-fatal
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useAuth() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    accessToken: s.accessToken,
    userId: s.userId,
    user: s.user,
    isAuthenticated: !!s.accessToken && !!s.userId,
    setAuth,
    clearAuth,
  }
}
