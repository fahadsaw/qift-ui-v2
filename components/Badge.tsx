export default function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--primary)' }}
      />
      {children}
    </div>
  )
}
