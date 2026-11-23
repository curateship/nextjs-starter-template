import type * as React from "react"

import { addDays } from "@/lib/project/days"
import { monthGrid } from "@/lib/project/meetings"
import { WEEK_DAYS } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * The month grid every Project calendar draws: the Team dashboard's check-ins
 * and meetings, and a project's Calendar tab of due dates. Weeks start on
 * Monday, the way the team's work days are listed. Each screen draws its own
 * day squares, since one is a button and the other a place to drop a task.
 */
export function MonthGrid({
  month,
  children,
}: {
  /** "YYYY-MM". */
  month: string
  /** One day square, given its date and whether it is in this month. */
  children: (day: { date: string; inMonth: boolean }) => React.ReactNode
}) {
  const grid = monthGrid(month)
  return (
    <div className="grid grid-cols-7 gap-1.5 p-3">
      {WEEK_DAYS.map(({ day, short }) => (
        // Small capitals at each square's left, as Tyler drew the Team calendar on 14 Oct 2026.
        <div key={day} aria-hidden className="px-2 pb-1 text-left text-xs tracking-wide text-muted-foreground uppercase">
          {short}
        </div>
      ))}
      {Array.from({ length: grid.cells }, (_, index) => {
        const date = addDays(grid.start, index)
        return children({ date, inMonth: date.startsWith(month) })
      })}
    </div>
  )
}

/** The date in a square's corner, filled in for today. */
export function DayNumber({ date, today }: { date: string; today: string }) {
  return (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full text-sm",
        date === today && "bg-primary font-semibold text-primary-foreground"
      )}
    >
      {Number(date.slice(8))}
    </span>
  )
}
