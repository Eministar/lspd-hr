'use client'

import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { type Locale, format, parse, isValid } from 'date-fns'
import { de } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldClass, fieldErrorClass, fieldLabelClass } from '@/components/ui/input'
import 'react-day-picker/style.css'

export interface DateFieldProps {
  label?: string
  error?: string
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  className?: string
  /** Label im Trigger, wenn kein valides Datum gesetzt (z. B. nach Löschen) */
  emptyLabel?: string
  locale?: Locale
  /** Wenn false, kein Löschen-Button (z. B. Pflichtfeld) */
  allowClear?: boolean
}

const parseIsoDate = (s: string): Date | undefined => {
  if (!s || !s.trim()) return undefined
  const d = parse(s, 'yyyy-MM-dd', new Date())
  return isValid(d) ? d : undefined
}

export function DateField({
  label,
  error,
  id,
  value,
  onChange,
  disabled,
  required,
  className,
  emptyLabel = 'Datum wählen',
  locale = de,
  allowClear = true,
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false)
  const genId = React.useId()
  const fieldId = id ?? genId
  const errorId = error ? `${fieldId}-error` : undefined
  const selected = parseIsoDate(value)
  const display = selected != null ? format(selected, 'dd.MM.yyyy', { locale }) : emptyLabel

  const applyDate = (d: Date) => {
    onChange(format(d, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && (
        <label htmlFor={fieldId} className={fieldLabelClass}>
          {label}
        </label>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            id={fieldId}
            disabled={disabled}
            aria-describedby={errorId}
            data-invalid={error ? '' : undefined}
            data-required={required ? '' : undefined}
            className={cn(
              fieldClass,
              'flex h-[34px] items-center justify-between gap-2 px-3 text-left',
              'data-[state=open]:border-gold/80 data-[state=open]:ring-[3px] data-[state=open]:ring-gold/25',
              'disabled:cursor-not-allowed disabled:opacity-50',
              !selected && 'text-label-4',
              error && fieldErrorClass
            )}
          >
            <span className="min-w-0 flex-1 truncate tabular-nums">{display}</span>
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-label-3" strokeWidth={2} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={5}
            align="start"
            className="lspd-popover z-[200] w-auto min-w-[280px] rounded-[12px] p-0 outline-none data-[state=open]:animate-[lspd-pop-in_160ms_var(--ease-apple)]"
          >
            <div
              className="lspd-rdp p-2 text-label [&_.rdp-weekday]:text-label-3 [&_.rdp-outside]:text-label-4 [&_.rdp-today]:text-gold-bright [&_button.rdp-day_button]:text-label [&_button.rdp-day_button:hover]:bg-white/[0.08]"
              style={
                {
                  ['--rdp-accent-color' as string]: 'var(--color-gold)',
                  ['--rdp-accent-background-color' as string]: 'rgb(212 175 55 / 0.2)',
                } as React.CSSProperties
              }
            >
              <DayPicker
                mode="single"
                required={false}
                selected={selected}
                onSelect={(d) => d && applyDate(d)}
                defaultMonth={selected ?? new Date()}
                weekStartsOn={1}
                locale={locale}
                classNames={{
                  root: 'w-full',
                  months: 'relative',
                  // Liegt unter der Nav-Toolbar; Caption nur Text — keine Klicks abfangen
                  month_caption: 'mb-1 flex h-9 items-center justify-center text-[13.5px] font-semibold text-label pointer-events-none',
                  caption_label: 'capitalize',
                  // In v9 sitzt die Monats-Navigation in diesem <nav> (nicht in der Caption-Zeile);
                  // ohne z-index liegt der darunterliegende Monats-Block oben drüber und fängt alle Klicks ab
                  nav: 'absolute left-0 right-0 top-0 z-20 flex w-full items-center justify-between px-0.5 pointer-events-auto',
                  button_previous:
                    'relative z-20 inline-flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-white/[0.08] hover:text-label',
                  button_next:
                    'relative z-20 inline-flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-white/[0.08] hover:text-label',
                  month: 'relative z-0 space-y-2 p-0.5',
                  weekdays: 'flex',
                  weekday: 'w-9 text-[11px] font-medium',
                  week: 'mt-0.5 flex w-full',
                  day: 'h-9 w-9 p-0 text-center text-[13px] text-label',
                  day_button:
                    'mx-auto h-8 w-8 rounded-full text-label tabular-nums hover:bg-white/[0.08] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-gold/45',
                  selected: 'bg-gold rounded-full text-ink font-semibold !opacity-100',
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
              {allowClear ? (
                <button
                  type="button"
                  className="rounded-[6px] px-2 py-1 text-[12.5px] text-label-2 hover:bg-white/[0.06] hover:text-label"
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  disabled={disabled}
                >
                  Löschen
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="rounded-[6px] px-2 py-1 text-[12.5px] font-medium text-gold-bright hover:bg-white/[0.06]"
                onClick={() => applyDate(new Date())}
                disabled={disabled}
              >
                Heute
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {error && <p id={errorId} className="text-[12px] text-red">{error}</p>}
    </div>
  )
}
