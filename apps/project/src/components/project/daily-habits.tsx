import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { MinusIcon, PlusIcon } from "lucide-react"

import { DailySection } from "@/components/project/daily-section"
import { HabitIconGlyph } from "@/components/project/habit-icons"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { countHabit, type DailyCard, type DailyHabit, type DailyWeather } from "@/lib/api/project/daily-card"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { DAY_PART_LABEL, DAY_PARTS, type DayPart, type WeatherKind } from "@/lib/project/daily-card"
import { clockLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

/** Today's habits, in the card's order: morning's first, then by time and place. */
function todaysHabits(daily: DailyCard) {
  return (daily.admin?.habits ?? [])
    .filter((habit) => habit.setToday)
    .sort(
      (a, b) =>
        DAY_PARTS.indexOf(a.part) - DAY_PARTS.indexOf(b.part) ||
        (a.atTime ?? "99").localeCompare(b.atTime ?? "99") ||
        a.position - b.position
    )
}

/** The weather as the sub greeting says it, "23°C with clear blue sky"; `night` for the dark hours. */
const SKY_WORDS: Record<WeatherKind, (night: boolean) => string> = {
  clear: (night) => (night ? "clear night sky" : "clear blue sky"),
  "partly-cloudy": () => "a few clouds",
  cloudy: () => "cloudy skies",
  fog: () => "fog",
  drizzle: () => "light drizzle",
  rain: () => "rain",
  snow: () => "snow",
  storm: () => "thunderstorms",
}

const SALUTATION: Record<DayPart, string> = { morning: "Good morning", afternoon: "Good afternoon", night: "Good evening" }

/**
 * The top of the site admin's Daily habits block, from Tyler's drawing of
 * 12 Nov 2026 ("revamp daily card ui"): "Good morning, Admin" and a ring of
 * today's habits done with "0/4" in it, a dot at the ring's leading end.
 */
export function DailyHeader({
  daily,
  part,
  afterMidnight,
  weather,
}: {
  daily: DailyCard
  part: DayPart
  afterMidnight: boolean
  /** The weather in their city, once it has loaded; null without a city. */
  weather: DailyWeather | null
}) {
  const habits = todaysHabits(daily)
  const done = habits.filter((habit) => habit.count >= habit.target).length
  const name = daily.firstName ? `, ${daily.firstName}` : ""
  const hello = afterMidnight ? `Still up${name}?` : `${SALUTATION[part]}${name}`
  return (
    <div className="flex items-center gap-3 pb-1">
      {/* 14px, 30% under the drawing's 20px, with no "4 habits left" line under it
          (Tyler, 12 Nov 2026: "reduce the greeting text font by 30%. Remove "4 habits
          left for Thursday""); the ring says how many are done. */}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-sm leading-tight font-semibold break-words">{hello}</p>
        {/* The weather in words under it (Tyler, 12 Nov 2026: "Add a sub greeting here
            that discribe the weather like "23°C with clear blue sky""). Nothing without
            a city in My settings → General. */}
        {weather ? (
          <p className="text-xs text-muted-foreground">
            {weather.temperature}°C with {SKY_WORDS[weather.kind](part === "night" || afterMidnight)}
          </p>
        ) : null}
      </div>
      {habits.length ? <HabitRing done={done} total={habits.length} /> : null}
    </div>
  )
}

/** A ring filling as habits are done, "2/4" inside and a dot at the filled end. */
function HabitRing({ done, total }: { done: number; total: number }) {
  const radius = 21
  const around = 2 * Math.PI * radius
  const share = total ? done / total : 0
  // Where the filled part ends, clockwise from the top.
  const angle = share * 2 * Math.PI - Math.PI / 2
  return (
    <div className="relative size-14 shrink-0" role="img" aria-label={`${done} of ${total} habits done`}>
      <svg viewBox="0 0 56 56" className="size-full" aria-hidden>
        <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="5" className="stroke-muted" />
        {share > 0 ? (
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${share * around} ${around}`}
            transform="rotate(-90 28 28)"
            className="stroke-foreground"
          />
        ) : null}
        <circle cx={28 + radius * Math.cos(angle)} cy={28 + radius * Math.sin(angle)} r="2.5" className="fill-foreground" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xs tabular-nums">
        {done}/{total}
      </span>
    </div>
  )
}

/**
 * The site admin's habits for today (Tyler, 29 Oct 2026: "Add a habit
 * tracker or routine to morning, afternoon and night"), every habit set for
 * today whatever the time of day, morning's first. Drawn from Tyler's
 * drawing of 12 Nov 2026 ("revamp daily card ui"): each part under its
 * name in small capitals with the hour it starts in Your hours on the right,
 * and each habit a row with its icon on a grey tile, its name, its streak
 * under it, and its tick on the right. A counted habit has a row of dashes
 * filling with "0/4" under its name and − and + on the right instead.
 * Only today can be ticked.
 */
export function DailyHabits({ daily }: { daily: DailyCard }) {
  const admin = daily.admin
  if (!admin) return null
  const day = daily.cardDay
  const habits = todaysHabits(daily)

  return (
    <DailySection>
      {admin.habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add your morning, afternoon and night habits in My settings → Daily card.</p>
      ) : habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits set for today.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {habits.map((habit, index) => (
            <React.Fragment key={habit.id}>
              {index === 0 || habit.part !== habits[index - 1].part ? (
                <li className={cn("flex items-center justify-between gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase", index > 0 && "pt-3")}>
                  <span>{DAY_PART_LABEL[habit.part]}</span>
                  <span className="font-mono normal-case tabular-nums">{clockLabel(daily.settings.hours[habit.part])}</span>
                </li>
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
  const counted = habit.target > 1
  const streak = habit.streak.current
  return (
    <li className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <HabitIconGlyph icon={habit.icon} className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <label
          htmlFor={counted ? undefined : id}
          className={cn("truncate text-sm", !counted && "cursor-pointer", done && "text-muted-foreground", done && !counted && "line-through")}
        >
          {habit.name}
        </label>
        {counted ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 gap-1" aria-hidden>
              {Array.from({ length: Math.min(habit.target, 10) }, (_, step) => (
                <span key={step} className={cn("h-1 w-4 shrink rounded-full", step < shown ? "bg-foreground" : "bg-muted")} />
              ))}
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {shown}/{habit.target}
            </span>
          </div>
        ) : (
          <span className="truncate text-xs text-muted-foreground">
            {streak ? `${streak}-day streak` : "Start a streak today"}
            {habit.atTime ? ` · ${clockLabel(habit.atTime)}` : null}
          </span>
        )}
      </div>
      {counted ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label={`One less ${habit.name}`}
            // Never greyed out: at 0 it does nothing (the mock draws it whole).
            onClick={() => (shown > 0 ? void save(shown - 1) : undefined)}
          >
            <MinusIcon />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            aria-label={`One more ${habit.name}`}
            onClick={() => (done ? undefined : void save(shown + 1))}
          >
            <PlusIcon />
          </Button>
        </span>
      ) : (
        <Checkbox
          id={id}
          className="size-6 shrink-0 rounded-md"
          checked={done}
          onCheckedChange={(checked) => void save(checked === true ? habit.target : 0)}
        />
      )}
    </li>
  )
}
