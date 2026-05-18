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
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 text-[#6b8299]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-[#d4af37]/15 blur-xl animate-pulse" aria-hidden />
          <Spinner size="lg" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#8ea4bd] uppercase">Lädt</p>
          <p className="text-[11px] text-[#4a6585]">Einen Moment bitte…</p>
        </div>
      </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse" style={{ animationDelay: `${i * 75}ms` }}>
              {Array.from({ length: cols }).map((_, j) => (
                  <div key={j} className="h-9 bg-gradient-to-r from-[#0a2240]/60 to-[#102542]/40 rounded-[8px] flex-1" />
              ))}
            </div>
        ))}
      </div>
  )
}