import Link from 'next/link'

export default function Brand({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <Link
      href="/"
      aria-label="Qift"
      className="inline-flex items-center transition-opacity hover:opacity-80"
      style={{
        color: 'var(--ink)',
        fontWeight: 700,
        letterSpacing: '0.55em',
        paddingInlineStart: '0.1em',
        fontSize: size === 'lg' ? '1.1rem' : '0.95rem',
      }}
    >
      QIFT
    </Link>
  )
}
