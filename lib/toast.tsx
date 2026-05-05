'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

type ToastTone = 'success' | 'info' | 'error'

type Toast = {
  id: number
  message: string
  tone: ToastTone
  leaving?: boolean
}

type ToastValue = {
  show: (message: string, opts?: { tone?: ToastTone; durationMs?: number }) => void
}

const ToastContext = createContext<ToastValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const startLeave = useCallback(
    (id: number) => {
      setToasts((list) =>
        list.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      )
      const timer = setTimeout(() => remove(id), 220)
      timersRef.current.set(id, timer)
    },
    [remove],
  )

  const show = useCallback<ToastValue['show']>(
    (message, opts) => {
      const id = ++idRef.current
      const tone = opts?.tone ?? 'success'
      const durationMs = opts?.durationMs ?? 2400
      setToasts((list) => [...list, { id, message, tone }])
      const timer = setTimeout(() => startLeave(id), durationMs)
      timersRef.current.set(id, timer)
    },
    [startLeave],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  const value = useMemo<ToastValue>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={startLeave} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      show: () => {
        // No-op when provider missing (e.g. during build snapshots)
      },
    }
  }
  return ctx
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: number) => void
}) {
  const tone = toast.tone
  const accent =
    tone === 'error'
      ? '#D55B6E'
      : tone === 'info'
      ? 'var(--text-soft)'
      : 'var(--primary)'
  return (
    <button
      type="button"
      onClick={() => onDismiss(toast.id)}
      className={`pointer-events-auto flex max-w-[20rem] items-center gap-2.5 rounded-full border px-4 py-2.5 backdrop-blur-xl transition-transform ${
        toast.leaving ? 'qift-toast-out' : 'qift-toast-in'
      }`}
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
        style={{
          background:
            tone === 'success'
              ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
              : accent,
        }}
      >
        {tone === 'error' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span
        className="truncate text-sm font-semibold"
        style={{ color: 'var(--ink)' }}
      >
        {toast.message}
      </span>
    </button>
  )
}
