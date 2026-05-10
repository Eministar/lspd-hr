'use client'

import { cn, getUnitBadgeClass, getUnitLabel } from '@/lib/utils'
import { officerUnitKeys } from '@/lib/officer-units'

interface UnitInfo {
  key: string
  name: string
  color: string
}

interface OfficerUnits {
  unit: string | null
  units: string[] | null
}

interface UnitBadgesProps {
  officer: OfficerUnits
  units?: UnitInfo[]
  unitsByKey?: Map<string, UnitInfo>
  maxVisible?: number
  emptyClassName?: string
}

export function UnitBadges({ officer, units, unitsByKey, maxVisible, emptyClassName }: UnitBadgesProps) {
  const keys = officerUnitKeys(officer)
  if (keys.length === 0) return <span className={cn('text-[11px] text-[#4a6585]', emptyClassName)}>—</span>

  const map = unitsByKey ?? new Map((units ?? []).map((unit) => [unit.key, unit]))
  const visibleKeys = maxVisible ? keys.slice(0, maxVisible) : keys
  const overflow = maxVisible ? Math.max(0, keys.length - visibleKeys.length) : 0

  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
      {visibleKeys.map((unitKey) => {
        const unitInfo = map.get(unitKey)
        return (
          <span
            key={unitKey}
            title={unitInfo?.name ?? getUnitLabel(unitKey)}
            className={cn(
              'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-[7px] border px-2 py-[3px] text-[10.5px] font-semibold leading-none',
              unitInfo ? 'border-[#18385f]/70 bg-[#081a31]/80 text-[#d8e4f2]' : getUnitBadgeClass(unitKey)
            )}
            style={unitInfo ? { borderColor: `${unitInfo.color}70`, backgroundColor: `${unitInfo.color}14` } : undefined}
          >
            {unitInfo && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: unitInfo.color }}
              />
            )}
            <span className="min-w-0 truncate">{unitInfo?.name ?? getUnitLabel(unitKey)}</span>
          </span>
        )
      })}
      {overflow > 0 && (
        <span className="inline-flex rounded-[7px] border border-[#18385f]/70 bg-[#081a31]/80 px-2 py-[3px] text-[10.5px] font-semibold leading-none text-[#8ea4bd]">
          +{overflow}
        </span>
      )}
    </span>
  )
}
