'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldClass, fieldErrorClass, fieldLabelClass } from '@/components/ui/input'

/** Radix reserviert kein leeres value — wir mappen leere Auswahl intern. */
const EMPTY = '__lspd_select_empty__'

function toInternal(v: string | undefined) {
  if (v === undefined || v === '') return EMPTY
  return v
}
function fromInternal(v: string) {
  if (v === EMPTY) return ''
  return v
}

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
  value?: string
  defaultValue?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  onValueChange?: (value: string) => void
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  size?: 'default' | 'sm'
  required?: boolean
}

// macOS-Menü: Häkchen links, Hervorhebung in der Akzentfarbe.
const itemBase = cn(
  'relative flex cursor-default select-none items-center rounded-[6px] py-[5px] pl-7 pr-3',
  'text-[13.5px] text-label outline-none',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
  'data-[highlighted]:bg-gold data-[highlighted]:text-ink'
)

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    className,
    label,
    error,
    id,
    options,
    placeholder,
    value,
    defaultValue,
    onChange,
    onValueChange,
    disabled,
    name,
    size = 'default',
    required,
  },
  ref
) {
  const genId = React.useId()
  const triggerId = id ?? genId

  const handleChange = (v: string) => {
    const out = fromInternal(v)
    onValueChange?.(out)
    onChange?.({ target: { value: out } } as React.ChangeEvent<HTMLSelectElement>)
  }

  const hasEmptyOption = options.some((o) => o.value === '')
  const rootValue = React.useMemo(() => {
    if (value === undefined) return undefined
    // Controlled empty selection: return '' (Radix's controlled "no value" state
    // that shows the placeholder) — NOT undefined, which would flip the Root to
    // uncontrolled and trigger React's controlled/uncontrolled warning.
    if (value === '' && !hasEmptyOption) return ''
    return toInternal(value)
  }, [value, hasEmptyOption])
  const rootDefault = defaultValue === undefined ? undefined : toInternal(defaultValue)

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && (
        <label htmlFor={triggerId} className={fieldLabelClass}>
          {label}
        </label>
      )}
      <SelectPrimitive.Root
        name={name}
        value={value !== undefined ? rootValue : undefined}
        defaultValue={value === undefined ? rootDefault : undefined}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          ref={ref}
          id={triggerId}
          aria-required={required}
          aria-invalid={error ? true : undefined}
          className={cn(
            fieldClass,
            'flex min-w-0 cursor-default items-center justify-between gap-2 px-3 text-left',
            'data-[state=open]:border-gold/80 data-[state=open]:ring-[3px] data-[state=open]:ring-gold/25',
            'disabled:cursor-not-allowed disabled:opacity-50',
            size === 'default' && 'h-[34px]',
            size === 'sm' && 'h-7 rounded-[7px] text-[13px]',
            error && fieldErrorClass
          )}
        >
          <SelectPrimitive.Value
            placeholder={placeholder}
            className="min-w-0 flex-1 truncate text-left text-label data-[placeholder]:text-label-4"
          />
          <SelectPrimitive.Icon>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-label-3" strokeWidth={2} />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={5}
            className={cn(
              'lspd-popover z-[200] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden',
              'origin-[var(--radix-select-content-transform-origin)] data-[state=open]:animate-[lspd-pop-in_160ms_var(--ease-apple)]'
            )}
          >
            <SelectPrimitive.Viewport className="max-h-72 overflow-y-auto p-[5px]">
              {options.map((opt) => {
                const internal = toInternal(opt.value)
                return (
                  <SelectPrimitive.Item key={internal} value={internal} className={itemBase}>
                    <span className="absolute left-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center">
                      <SelectPrimitive.ItemIndicator>
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </SelectPrimitive.ItemIndicator>
                    </span>
                    <SelectPrimitive.ItemText className="block truncate text-left">
                      {opt.label}
                    </SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                )
              })}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {error && <p className="text-[12px] text-red">{error}</p>}
    </div>
  )
})
Select.displayName = 'Select'
