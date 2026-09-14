import { cn } from '@/lib/utils'

export function RankNumberBadge({
  number,
  className,
}: {
  number: number | null | undefined
  className?: string
}) {
  if (number == null) return null

  return (
    <span
      title={`Interne Rangnummer ${number}`}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full bg-white/[0.07] px-2 text-[11.5px] font-medium tabular-nums text-label-2',
        className,
      )}
    >
      Rang {number}
    </span>
  )
}
