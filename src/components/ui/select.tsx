'use client'

import { forwardRef, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, placeholder, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-[12.5px] font-medium text-[#888] dark:text-[#777]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            'w-full h-[36px] px-3 rounded-[9px] text-[13.5px]',
            'bg-[#f5f5f5] dark:bg-[#1a1a1a]',
            'text-[#111] dark:text-[#eee]',
            'border border-transparent',
            'focus:outline-none focus:border-[#ddd] dark:focus:border-[#333]',
            'transition-colors duration-150 appearance-none cursor-pointer',
            'bg-[url("data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20fill=%27none%27%20viewBox=%270%200%2020%2020%27%3e%3cpath%20stroke=%27%23999%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%20stroke-width=%271.5%27%20d=%27M6%208l4%204%204-4%27/%3e%3c/svg%3e")] bg-[length:1rem_1rem] bg-[right_0.5rem_center] bg-no-repeat pr-8',
            error && 'border-red-300',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-[11.5px] text-red-500">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
