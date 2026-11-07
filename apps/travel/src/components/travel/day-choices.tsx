import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { isoToLocalDate, localDateToIso } from "@/lib/travel/dates"

/**
 * A day row's insides, copied from Project's `DayChoices`
 * (`apps/project/src/components/project/due-day-picker.tsx`) for the Admin 3
 * panel design: the month grid, opening straight from the row, and with
 * `clearLabel` a button under it that empties the day. Project's quick days
 * (Today, Next Monday) read a team's working days, which a trip doesn't have,
 * so they are left out. Days are "YYYY-MM-DD" both ways.
 */
export function DayChoices({
  value,
  onPick,
  clearLabel,
}: {
  value: string | null
  onPick: (day: string | null) => void
  clearLabel?: string
}) {
  const selected = isoToLocalDate(value)
  return (
    <>
      <Calendar mode="single" autoFocus selected={selected} defaultMonth={selected} onSelect={(date) => onPick(localDateToIso(date))} />
      {clearLabel && value ? (
        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal text-muted-foreground"
            onClick={() => onPick(null)}
          >
            <XIcon className="size-4" />
            {clearLabel}
          </Button>
        </div>
      ) : null}
    </>
  )
}
