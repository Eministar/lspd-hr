import { cn } from '@/lib/utils'

export function Spinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' }
  const px = { sm: 16, md: 20, lg: 24 }[size]
  return (
    <svg
      className={cn('animate-spin text-[#d4af37]', sizes[size], className)}
      viewBox="0 0 24 24"
      width={px}
      height={px}
      style={{
        width: px,
        height: px,
        maxWidth: px,
        maxHeight: px,
        display: 'block',
        color: '#d4af37',
        animation: 'spin 1s linear infinite',
      }}
      aria-hidden
    >
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 12 12"
        to="360 12 12"
        dur="1s"
        repeatCount="indefinite"
      />
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function PageLoader() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[400px] gap-3"
      style={{
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: '#061426',
        color: '#6b8299',
      }}
    >
      <Spinner size="lg" />
      <p
        className="text-[12px] text-[#6b8299] animate-pulse"
        style={{ margin: 0, fontSize: 12, lineHeight: '16px', color: '#6b8299' }}
      >
        Laden...
      </p>
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse" style={{ animationDelay: `${i * 75}ms` }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-8 bg-[#102542]/60 rounded-lg flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
