import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { MinusIcon, PlusIcon } from "lucide-react"

import { DailySection } from "@/components/project/daily-section"
import { HabitIconGlyph } from "@/components/project/habit-icons"
import { TintChip } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { countHabit, type DailyCard, type DailyHabit } from "@/lib/api/project/daily-card"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { DAY_PART_LABEL, type DayPart } from "@/lib/project/daily-card"
import { addDays, clockLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

/**
 * The site admin's routine for this part of the day (Tyler, 29 Oct 2026:
 * "Add a habit tracker or routine to morning, afternoon and night"): each
 * habit set for today with its tick or count and a streak chip, with no
 * row of week dots (Tyler, 30 Oct 2026: "remove this"). "Tick yesterday" switches the list to yesterday's, and
 * no day before that can be changed.
 */
export function DailyHabits({ daily, part }: { daily: DailyCard; part: DayPart }) {
  const admin = daily.admin
  const [yesterday, setYesterday] = React.useState(false)
  if (!admin) return null
  const day = yesterday ? addDays(daily.cardDay, -1) : daily.cardDay
  const habits = admin.habits
    .filter((habit) => habit.part === part && (yesterday ? habit.yesterday.set : habit.setToday))
    .sort((a, b) => (a.atTime ?? "99").localeCompare(b.atTime ?? "99") || a.position - b.position)

  return (
    <DailySection
      title={yesterday ? `Yesterday's ${part}` : `${DAY_PART_LABEL[part]} routine`}
      foldId="routine"
      action={
        admin.habits.some((habit) => habit.part === part && habit.yesterday.set) ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => setYesterday((shown) => !shown)}>
            {yesterday ? "Back to today" : "Tick yesterday"}
          </Button>
        ) : null
      }
    >
      {admin.habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add your morning, afternoon and night habits with the pencil above.</p>
      ) : habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing set for this part of the day.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {habits.map((habit) => (
            <HabitRow key={`${habit.id}:${day}`} habit={habit} day={day} count={yesterday ? habit.yesterday.count : habit.count} />
          ))}
        </ul>
      )}
      {admin.finished.current || admin.finished.best ? (
        <p className="text-xs text-muted-foreground">
          Finished days: {admin.finished.current} in a row, best {admin.finished.best}.
        </p>
      ) : null}
    </DailySection>
  )
}

function HabitRow({ habit, day, count }: { habit: DailyHabit; day: string; count: number }) {
  const router = useRouter()
  // Shown at once, then put right by the reload that recounts the streaks.
  const [shown, setShown] = useSyncedDraft(count)
  const id = React.useId()
  async function save(next: number) {
    const value = Math.max(0, Math.min(habit.target, next))
    setShown(value)
    try {
      await countHabit({ habitId: habit.id, day, count: value })
      await router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID })
    } catch (error) {
      setShown(count)
      showErrorToast(getProjectErrorMessage(error))
    }
  }
  const done = shown >= habit.target
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <div className="flex items-center gap-2">
        <HabitIconGlyph icon={habit.icon} className="size-4 shrink-0 text-muted-foreground" />
        {habit.target === 1 ? (
          <>
            <Checkbox id={id} checked={done} onCheckedChange={(checked) => void save(checked === true ? 1 : 0)} />
            <label htmlFor={id} className={cn("min-w-0 flex-1 cursor-pointer truncate text-sm", done && "text-muted-foreground line-through")}>
              {habit.name}
              {habit.atTime ? <span className="text-muted-foreground"> · {clockLabel(habit.atTime)}</span> : null}
            </label>
          </>
        ) : (
          <>
            <span className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted-foreground")}>
              {habit.name}
              {habit.atTime ? <span className="text-muted-foreground"> · {clockLabel(habit.atTime)}</span> : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`One less ${habit.name}`}
              disabled={shown === 0}
              onClick={() => void save(shown - 1)}
            >
              <MinusIcon />
            </Button>
            <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">
              {shown} of {habit.target}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              aria-label={`One more ${habit.name}`}
              disabled={done}
              onClick={() => void save(shown + 1)}
            >
              <PlusIcon />
            </Button>
          </>
        )}
        {/* At the row's end as a chip (Tyler, 30 Oct 2026: "put the streak here and
            make it chip styling and call it like "2 days streak""). */}
        {habit.streak.current ? (
          <TintChip color="orange">
            {habit.streak.current} {habit.streak.current === 1 ? "day" : "days"} streak
          </TintChip>
        ) : null}
      </div>
    </li>
  )
}
