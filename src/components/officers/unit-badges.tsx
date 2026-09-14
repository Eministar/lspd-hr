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
  if (keys.length === 0) return <span className={cn('text-[11px] text-label-4', emptyClassName)}>—</span>

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
              'inline-flex h-5 min-w-0 max-w-full items-center rounded-full px-2 text-[11.5px] font-medium leading-none',
              !unitInfo && getUnitBadgeClass(unitKey)
            )}
            style={unitInfo ? { color: unitInfo.color, backgroundColor: `color-mix(in srgb, ${unitInfo.color} 16%, transparent)` } : undefined}
          >
            <span className="min-w-0 truncate">{unitInfo?.name ?? getUnitLabel(unitKey)}</span>
          </span>
        )
      })}
      {overflow > 0 && (
        <span className="inline-flex h-5 items-center rounded-full bg-white/[0.07] px-2 text-[11.5px] font-medium leading-none tabular-nums text-label-2">
          +{overflow}
        </span>
      )}
    </span>
  )
}
