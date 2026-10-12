import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { dayLabel, longDayLabel } from "@/lib/project/days"
import { useQuickDays } from "@/lib/project/use-quick-days"
import { cn } from "@/lib/utils"

/**
 * A task's day picker: Today, Tomorrow, Next Monday and In a week as buttons
 * above the month grid, so setting a date is one click. Tomorrow and Next
 * Monday skip the team's days off (`src/lib/project/quick-days.ts`). Days are
 * "YYYY-MM-DD" both ways. It looks like the shell's `DatePicker`, which can't
 * carry the buttons without changing a shell file.
 */
export function DueDayPicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  defaultOpen = false,
  onOpenChange,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: string | null
  onChange: (day: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  "aria-invalid"?: boolean
}) {
  const [open, setOpenState] = React.useState(defaultOpen)
  const quick = useQuickDays(open)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  function pick(day: string | null) {
    onChange(day)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={ariaInvalid || undefined}
          className={cn("w-full justify-start px-2.5 font-normal", !value && "text-muted-foreground", className)}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {value ? format(dateFromKey(value)!, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {quick ? (
          <div className="grid grid-cols-2 gap-1 border-b p-2">
            {quick.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant={option.day === value ? "secondary" : "ghost"}
                size="sm"
                className="justify-between gap-2 font-normal"
                aria-label={`${option.label}, ${longDayLabel(option.day)}`}
                onClick={() => pick(option.day)}
              >
                {option.label}
                <span className="text-xs text-muted-foreground">{dayLabel(option.day)}</span>
              </Button>
            ))}
          </div>
        ) : null}
        <Calendar
          mode="single"
          autoFocus
          selected={dateFromKey(value)}
          defaultMonth={dateFromKey(value)}
          onSelect={(date) => pick(keyFromDate(date))}
        />
      </PopoverContent>
    </Popover>
  )
}
