import * as React from "react"
import { format } from "date-fns"
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { DAY_MS } from "@/lib/free-tools/what-if"

/**
 * A date between two days, picked from a calendar with month and year lists.
 *
 * The shared `DatePicker` moves one month per click, which is fine for next
 * week and painful for a day six years ago. This is the same button, popover
 * and calendar with the month and year as lists, and every day outside the
 * limits switched off. Days are epoch days in UTC, the day a daily candle
 * opens on, so a visitor in Sydney and one in Toronto pick the same close.
 */
export function PastDateField({
  id,
  label,
  hint,
  day,
  firstDay,
  lastDay,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  day: number
  firstDay: number
  lastDay: number
  onChange: (day: number) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selected = asLocalDate(day)

  return (
    <div className="grid min-w-0 gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-start px-2.5 font-normal"
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            {format(selected, "d MMM yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            autoFocus
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected}
            startMonth={asLocalDate(firstDay)}
            endMonth={asLocalDate(lastDay)}
            disabled={[
              { before: asLocalDate(firstDay) },
              { after: asLocalDate(lastDay) },
            ]}
            classNames={{
              dropdowns: "flex items-center gap-1.5 text-sm font-medium",
              dropdown_root:
                "relative rounded-md border border-input has-focus:border-ring has-focus:ring-3 has-focus:ring-ring/50",
              dropdown: "absolute inset-0 cursor-pointer opacity-0",
              caption_label:
                "flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-sm font-medium [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? (
                  <ChevronLeftIcon className="size-4" />
                ) : orientation === "right" ? (
                  <ChevronRightIcon className="size-4" />
                ) : (
                  <ChevronDownIcon className="size-4" />
                ),
            }}
            onSelect={(date) => {
              if (!date) return
              onChange(asEpochDay(date))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** The calendar draws local dates; an epoch day becomes that date at local midnight. */
function asLocalDate(day: number): Date {
  const utc = new Date(day * DAY_MS)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

function asEpochDay(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
  )
}
