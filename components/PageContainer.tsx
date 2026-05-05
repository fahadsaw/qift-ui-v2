import type { ReactNode } from 'react'

export default function PageContainer({
  children,
  size = 'sm',
}: {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const max =
    size === 'lg' ? 'max-w-3xl' : size === 'md' ? 'max-w-xl' : 'max-w-md'
  return (
    <div className={`mx-auto w-full ${max} px-5 pt-3 pb-6 sm:max-w-lg sm:px-6`}>
      {children}
    </div>
  )
}
