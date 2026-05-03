import { cn } from '@/lib/utils'

export function Spinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-7 w-7' }
  const px = { sm: 14, md: 20, lg: 28 }[size]

  return (
    <span
      className={cn('loading-spinner relative block shrink-0 rounded-full text-[#d4af37]', sizes[size], className)}
      style={{ width: px, height: px }}
      aria-hidden
    />
  )
}

export function PageLoader() {
  return (
    <div
      className="flex min-h-[400px] flex-col items-center justify-center gap-4 bg-[#061426] text-[#6b8299]"
      style={{
        minHeight: 400,
      }}
    >
      <Spinner size="lg" />
      <p
        className="text-[12px] font-medium tracking-[0.14em] text-[#6b8299]"
        style={{ margin: 0, fontSize: 12, lineHeight: '16px', color: '#6b8299' }}
      >
        LÄDT
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
