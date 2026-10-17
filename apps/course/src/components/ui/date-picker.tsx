import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * The standard date field: a button showing the chosen date (or a placeholder)
 * that opens a calendar in a popover. Use this instead of a native
 * `<input type="date">` so the picker looks the same in every browser.
 *
 * `defaultOpen` opens the calendar on first draw, and `onOpenChange` hears
 * every open and close, so a caller can tell a close without a pick.
 */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  disabled,
  className,
  defaultOpen = false,
  onOpenChange,
  "aria-invalid": ariaInvalid,
}: {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  "aria-invalid"?: boolean
}) {
  const [open, setOpenState] = React.useState(defaultOpen)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
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
          className={cn(
            "w-full justify-start px-2.5 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {value ? format(value, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          autoFocus
          selected={value}
          onSelect={(date) => {
            onChange(date)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
