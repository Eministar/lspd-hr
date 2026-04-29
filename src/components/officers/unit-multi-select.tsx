'use client'

import { Checkbox } from '@/components/ui/checkbox'

interface UnitOption {
  key: string
  name: string
}

interface UnitMultiSelectProps {
  label?: string
  value: string[]
  units: UnitOption[] | undefined
  onChange: (value: string[]) => void
}

export function UnitMultiSelect({ label = 'Units', value, units, onChange }: UnitMultiSelectProps) {
  const selected = new Set(value)

  const toggle = (key: string, checked: boolean) => {
    if (checked) {
      onChange(Array.from(new Set([...value, key])))
      return
    }
    onChange(value.filter((item) => item !== key))
  }

  return (
    <div>
      <p className="block text-[12.5px] font-medium text-[#9fb0c4] mb-2">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-[10px] border border-[#18385f]/60 bg-[#0a1a33]/35 p-3">
        {(units ?? []).map((unit) => (
          <Checkbox
            key={unit.key}
            checked={selected.has(unit.key)}
            onCheckedChange={(checked) => toggle(unit.key, checked)}
            label={unit.name}
          />
        ))}
        {(!units || units.length === 0) && (
          <p className="text-[12.5px] text-[#4a6585]">Keine aktiven Units vorhanden</p>
        )}
      </div>
    </div>
  )
}
