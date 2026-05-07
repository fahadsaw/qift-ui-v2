// App-level loading.tsx. Next.js shows this instantly on every
// route navigation while the target segment streams in — pairs
// with the per-page skeletons that already exist on individual
// routes (e.g. /gifts has its own GiftsSkeleton). This top-level
// fallback handles the brief gap before that page's skeleton
// component takes over.
//
// Kept dependency-free on purpose: pulling i18n / auth here would
// make a render of the loading shell wait on context that may
// itself be loading. Plain markup with CSS-var-driven colors so
// it matches the active theme without any JS.

export default function Loading() {
  return (
    <main
      className="flex min-h-[60vh] items-center justify-center px-6"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        aria-label="Loading"
        role="status"
        className="qift-spin h-10 w-10 rounded-full border-4"
        style={{
          borderColor:
            'color-mix(in srgb, var(--primary) 25%, transparent)',
          borderTopColor: 'var(--primary)',
        }}
      />
    </main>
  )
}
