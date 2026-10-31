import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { DailySection } from "@/components/project/daily-section"
import { HabitIconGlyph } from "@/components/project/habit-icons"
import { TintChip } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { countHabit, type DailyCard, type DailyHabit } from "@/lib/api/project/daily-card"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { DAY_PART_LABEL, DAY_PARTS, type DayPart } from "@/lib/project/daily-card"
import { clockLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

/**
 * The site admin's habits for today (Tyler, 29 Oct 2026: "Add a habit
 * tracker or routine to morning, afternoon and night"): every habit set for
 * today, morning's first, then afternoon's and night's, whatever the time
 * of day (Tyler, 30 Oct 2026: "show all habits and not just morning or
 * afternoon"), each with its tick or count and a streak chip. Only today
 * can be ticked ("remove the going back to yesterday to check off habit
 * feature"). Afternoon's and night's start under their own small label;
 * morning's, at the top, needs none (Tyler, 31 Oct 2026: "Add afternoon and
 * night label to separate them ... dont need morning"). The section is named
 * after its first part instead of "Today's habits", and each name carries the
 * hour that part starts in Your hours, "Morning - 5:00 AM" (the same day:
 * "Change the "Today's habit" to "Morning" and also put the time beside the
 * labels", then "the your hour should replace the hour beside the labels").
 */
export function DailyHabits({ daily }: { daily: DailyCard }) {
  const admin = daily.admin
  if (!admin) return null
  const day = daily.cardDay
  const habits = admin.habits
    .filter((habit) => habit.setToday)
    .sort(
      (a, b) =>
        DAY_PARTS.indexOf(a.part) - DAY_PARTS.indexOf(b.part) ||
        (a.atTime ?? "99").localeCompare(b.atTime ?? "99") ||
        a.position - b.position
    )

  // Each part's name with the hour it starts in Your hours.
  const partName = (part: DayPart) => `${DAY_PART_LABEL[part]} - ${clockLabel(daily.settings.hours[part])}`

  return (
    <DailySection title={habits.length ? partName(habits[0].part) : "Today's habits"} foldId="routine" plainTitle={habits.length > 0}>
      {admin.habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add your morning, afternoon and night habits with the pencil above.</p>
      ) : habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits set for today.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {habits.map((habit, index) => (
            <React.Fragment key={habit.id}>
              {index > 0 && habit.part !== habits[index - 1].part ? (
                <li className="pt-1 text-xs font-medium text-muted-foreground">{partName(habit.part)}</li>
              ) : null}
              <HabitRow habit={habit} day={day} count={habit.count} />
            </React.Fragment>
          ))}
        </ul>
      )}
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
        {/* Every habit has a tick; on a counted one it fills the whole count, or
            empties it (Tyler, 31 Oct 2026: "Add a checkbox even for habit with
            amounts ... if I check the box then it checks all the whole amount").
            Plus counts up; there is no minus ("remove this"), the tick empties it. */}
        <Checkbox id={id} checked={done} onCheckedChange={(checked) => void save(checked === true ? habit.target : 0)} />
        <label
          htmlFor={id}
          className={cn("min-w-0 flex-1 cursor-pointer truncate text-sm", done && "text-muted-foreground", done && habit.target === 1 && "line-through")}
        >
          {habit.name}
          {habit.atTime ? <span className="text-muted-foreground"> · {clockLabel(habit.atTime)}</span> : null}
        </label>
        {habit.target === 1 ? null : (
          <>
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
