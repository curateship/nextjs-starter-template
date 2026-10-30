import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ChevronDown, Loader2Icon, PauseIcon, PencilIcon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { burstConfetti } from "@/components/project/confetti"
import { DailyHabits } from "@/components/project/daily-habits"
import { DailyJournal, RateYourDayButton, StartDayButton } from "@/components/project/daily-journal"
import { DailySection } from "@/components/project/daily-section"
import { DailySettingsDialog } from "@/components/project/daily-settings-dialog"
import { DailySky } from "@/components/project/daily-sky"
import { GraphMorphIcon } from "@/components/project/inbox-morph-icon"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { pauseTaskClock, startTaskClock } from "@/lib/api/project/clock"
import { loadMyWeather, milestoneShown, type DailyCard as DailyCardData, type DailyWeather } from "@/lib/api/project/daily-card"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import {
  DAY_RATING_TOP,
  greetingOf,
  hoursAndMinutes,
  isAfterMidnight,
  partOfDay,
  skyPhase,
  weatherWords,
  type DailySection as DailySectionName,
  type DayPart,
} from "@/lib/project/daily-card"
import { clockIn, fullDayLabel, localNow } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import type { TaskCard } from "@/lib/api/project/tasks"
import { cn } from "@/lib/utils"

/** The route whose data loads again after a change on the card. */
const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

/** How often the card looks at the clock, so the sky and greeting turn over on time. */
const TICK_MS = 30_000

/** The clock, part of the day, sky and weather, worked out once for the sky behind the panel and the card in it. */
export type DailyNow = {
  nowMs: number
  local: { day: string; time: string }
  part: DayPart
  phase: ReturnType<typeof skyPhase>
  weather: DailyWeather | null
}

export function useDailyNow(daily: DailyCardData): DailyNow {
  const nowMs = useNow(daily.loadedAt)
  const weather = useWeather(daily.settings.city)
  const local = localNow(new Date(nowMs), daily.zone)
  return { nowMs, local, part: partOfDay(local.time, daily.settings.hours), phase: skyPhase(local.time, daily.settings.hours), weather }
}

/**
 * The sky lies faintly behind the left panel's header and its top, and fades
 * into the panel, the way a project's banner does (Tyler, 30 Oct 2026: "I
 * dont want this daily card in a card but more of a permanent fixture like
 * how we built project avatar and background"). The panel holding it is
 * `relative`, and its header goes see-through at the foot.
 */
export function DailySkyBanner({ daily, now }: { daily: DailyCardData; now: DailyNow }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      <div className="absolute inset-0 opacity-45">
        <DailySky
          phase={now.phase}
          part={now.part}
          weather={now.weather?.kind ?? null}
          sky={daily.admin ? daily.settings.sky : "drawn"}
          ownPhoto={daily.settings.ownSkies[now.part]}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
    </div>
  )
}

/**
 * The graph in the site admin's panel header, before the pencil (Tyler, 30
 * Oct 2026: "Add another icon here with the graph icon that will open up the
 * look back modal"). It swaps the panel's cards for Look back and back again,
 * the way the inbox does ("put it inline in the left panel like inbox").
 */
export function DailyLookBackButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={open ? "Back to my cards" : "Look back"}
          aria-pressed={open}
          className={cn(open && "bg-muted")}
          onClick={onToggle}
        >
          <GraphMorphIcon open={open} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{open ? "Back to my cards" : "Look back"}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The pencil in the left panel's header, before the inbox and the cog
 * (Tyler, 30 Oct 2026: "put pen icon here"). It opens the Daily card's
 * window: the hours, and the site admin's habits, reminders, sky and lines.
 */
export function DailyEditButton({ daily }: { daily: DailyCardData }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Edit the Daily card" onClick={() => setOpen(true)}>
            <PencilIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Edit the Daily card</TooltipContent>
      </Tooltip>
      <DailySettingsDialog daily={daily} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The Daily card at the top of My dashboard (task "Daily card/01", Tyler,
 * 29 Oct 2026: "like a personal assistent"). Everyone has one: a greeting
 * that follows their own hours, today's deep work with Start, the next
 * meeting, the afternoon's progress, and a wind-down at night. The site
 * admin's adds their routines, streaks and journal, which nobody else sees,
 * and shows none of it until they press Start day. It sits straight in the
 * panel, under the sky drawn by DailySkyBanner. How it works is in
 * `workspace/docs/daily-card.md`.
 */
export function DailyCard({
  daily,
  now,
  deepWork,
  picks,
  checkin,
  onCheckIn,
  onCheckOut,
  onOpenTask,
}: {
  daily: DailyCardData
  now: DailyNow
  /** What to work on today: an employee's check-in picks, the site admin's three most urgent tasks. */
  deepWork: TaskCard[]
  /** An employee's picks done of picked, for the afternoon's progress; null for the site admin. */
  picks: { done: number; total: number } | null
  /** An employee's check-in today; null for the site admin, who has none. */
  checkin: { checkedIn: boolean; checkedOut: boolean } | null
  onCheckIn?: () => void
  onCheckOut?: () => void
  onOpenTask: (taskId: string) => void
}) {
  const { nowMs, local, part, weather } = now
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard("project-daily-card"))
  const cardRef = React.useRef<HTMLElement>(null)
  const greeting = greetingOf(daily.firstName, part, daily.cardDay, isAfterMidnight(local.time, daily.settings.hours))
  useMilestone(daily.admin?.milestone ?? null, cardRef)
  // The day's own parts wait for Start day; an employee's card has no such button.
  const started = !daily.admin || Boolean(daily.admin.today.upAt)

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section ref={cardRef} aria-label="Daily card" className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.75">
        {/* Down in the sky's lower half, where the fade has made it quiet enough to read on. */}
        <div className="group/greeting mt-6 flex items-start gap-2">
          {/* The greeting is the button that folds and opens the card, like a
              panel card's heading (Tyler, 30 Oct 2026: "clicking on the text
              area should uncollpase it"); the arrow is the same press. */}
          <h2 className="min-w-0 flex-1 text-base leading-tight font-semibold">
            <CollapsibleTrigger asChild>
              <button type="button" className={cn("grid w-full cursor-pointer gap-0.5 rounded-md text-left", focusRingInset)}>
                <span>{greeting}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {fullDayLabel(local.day)}
                  {weather ? ` · ${weather.temperature}°, ${weatherWords(weather.kind)} in ${weather.city.split(",")[0]}` : null}
                </span>
              </button>
            </CollapsibleTrigger>
          </h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                tabIndex={-1}
                aria-hidden
                onClick={() => setOpen(!open)}
                // Plain, open or folded, like a panel card's arrow. Shown only while
                // the greeting is pointed at or has the keyboard's focus (Tyler, 30 Oct
                // 2026); always on a screen with no pointer.
                className="opacity-0 transition-opacity group-hover/greeting:opacity-100 group-has-[:focus-visible]/greeting:opacity-100 aria-expanded:bg-transparent aria-expanded:text-foreground dark:aria-expanded:bg-transparent [@media(hover:none)]:opacity-100"
              >
                <ChevronDown className={cn("size-4 transition-transform duration-200", !open && "-rotate-90")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{open ? "Fold it to the greeting" : "Open it again"}</TooltipContent>
          </Tooltip>
        </div>
        <CollapsibleContent data-collapse-key={noFlashKey}>
          {/* minmax(0, 1fr): a long task title truncates instead of widening the panel.
              15px apart, the same gutter as the panel's cards below and its edges. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3.75">
            {started ? (
              <>
                {daily.admin?.lookBack ? <SundayLookBack daily={daily} /> : null}
                {daily.admin?.monthly ? <MonthlyReview daily={daily} /> : null}
                {checkin && !checkin.checkedIn && part !== "night" && !daily.dayOff ? (
                  <Button type="button" className="w-full" onClick={onCheckIn}>
                    Check in to plan your day
                  </Button>
                ) : null}
                {/* In the site admin's own order, dragged in the pencil window (Tyler, 30 Oct
                    2026: "whats the point of dragging the cards in the modal if its not
                    reflected in the panel?"); an employee's card keeps the card's own. */}
                {daily.settings.sections.map((name) => (
                    <DaySection
                      key={name}
                      name={name}
                      daily={daily}
                      part={part}
                      nowMs={nowMs}
                      deepWork={deepWork}
                      picks={picks}
                      checkin={checkin}
                      onCheckOut={onCheckOut}
                      onOpenTask={onOpenTask}
                    />
                ))}
              </>
            ) : null}
            {/* Look back lives in the panel's header (Tyler, 30 Oct 2026: "remove the look back button"). */}
            {daily.admin ? !started ? <StartDayButton /> : part === "night" ? <RateYourDayButton daily={daily} /> : null : null}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/** The moment the card draws: the load's own moment first, then the browser's, every 30 seconds. */
function useNow(loadedAt: string) {
  const [now, setNow] = React.useState(() => Date.parse(loadedAt))
  React.useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])
  return now
}

/** The weather in the person's city, loaded after the card so the page never waits for it. */
function useWeather(city: string | null) {
  const [weather, setWeather] = React.useState<{ city: string; value: DailyWeather | null } | null>(null)
  React.useEffect(() => {
    if (!city) return
    let live = true
    // Quietly: without an answer the sky just follows the clock.
    loadMyWeather().then(
      (value) => live && setWeather({ city, value }),
      () => live && setWeather({ city, value: null })
    )
    return () => {
      live = false
    }
  }, [city])
  return city && weather?.city === city ? weather.value : null
}

/** A streak milestone's confetti, once: shown, then remembered so it never shows again. */
function useMilestone(milestone: string | null, cardRef: React.RefObject<HTMLElement | null>) {
  const shown = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!milestone || shown.current === milestone || !cardRef.current) return
    shown.current = milestone
    burstConfetti(cardRef.current)
    const days = milestone.split(":").pop()
    toast.success(`${days} days in a row.`)
    void milestoneShown(milestone).catch(() => undefined)
  }, [milestone, cardRef])
}

/** The part of the card that follows the time of day for everyone. */
/**
 * One of the card's sections, or nothing when it has nothing to show at this
 * part of the day. On a day off, deep work's place says so and the other
 * work sections stay away; the routine and journal still show.
 */
function DaySection({
  name,
  daily,
  part,
  nowMs,
  deepWork,
  picks,
  checkin,
  onCheckOut,
  onOpenTask,
}: {
  name: DailySectionName
  daily: DailyCardData
  part: DayPart
  nowMs: number
  deepWork: TaskCard[]
  picks: { done: number; total: number } | null
  checkin: { checkedIn: boolean; checkedOut: boolean } | null
  onCheckOut?: () => void
  onOpenTask: (taskId: string) => void
}) {
  const work = !daily.dayOff
  switch (name) {
    case "line":
      return daily.admin?.line && part === "morning" ? <p className="text-sm text-muted-foreground italic">{daily.admin.line}</p> : null
    case "progress": {
      if (!work || part !== "afternoon") return null
      const clockedSeconds =
        daily.clock.seconds + (daily.clock.running ? Math.max(0, Math.floor((nowMs - Date.parse(daily.loadedAt)) / 1000)) : 0)
      return <Progress picks={picks} finished={daily.finishedToday.length} clockedSeconds={clockedSeconds} />
    }
    case "deepWork":
      if (!work) return <p className="text-sm">{daily.dayOff}. Nothing here needs you today.</p>
      return part !== "night" ? <DeepWork tasks={deepWork} onOpenTask={onOpenTask} /> : null
    case "meeting":
      return work ? <NextMeeting daily={daily} nowMs={nowMs} /> : null
    case "windDown":
      return work && part === "night" ? <WindDown daily={daily} checkin={checkin} onCheckOut={onCheckOut} onOpenTask={onOpenTask} /> : null
    case "routine":
      return <DailyHabits daily={daily} />
    case "journal":
      return <DailyJournal daily={daily} part={part} />
  }
}

/** "2 of 3 done, 3h 10m clocked today"; nothing while there is nothing to count. */
function Progress({ picks, finished, clockedSeconds }: { picks: { done: number; total: number } | null; finished: number; clockedSeconds: number }) {
  const parts = [
    picks ? `${picks.done} of ${picks.total} done` : finished ? `${finished} done today` : null,
    clockedSeconds >= 60 ? `${hoursAndMinutes(Math.floor(clockedSeconds / 60))} clocked today` : null,
  ].filter(Boolean)
  return parts.length ? (
    <DailySection>
      <p className="text-sm">{parts.join(", ")}</p>
    </DailySection>
  ) : null
}

function DeepWork({ tasks, onOpenTask }: { tasks: TaskCard[]; onOpenTask: (taskId: string) => void }) {
  const router = useRouter()
  const [run] = useAsyncAction(getProjectErrorMessage)
  const [starting, setStarting] = React.useState<string | null>(null)
  if (tasks.length === 0) return null
  async function start(task: TaskCard) {
    setStarting(task.id)
    let paused: string | null = null
    const ok = await run(async () => {
      paused = (await startTaskClock(task.id)).pausedTitle
    })
    setStarting(null)
    if (!ok) return
    toast.success(paused ? `Started "${task.title}" and paused "${paused}".` : `Started "${task.title}".`)
    await router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID })
  }
  return (
    <DailySection title="Deep work" foldId="deep-work">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {tasks.map((task) => {
          const running = Boolean(task.clock.runningSince)
          return (
            <li key={task.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className={cn("min-w-0 flex-1 cursor-pointer truncate rounded-md text-left text-sm hover:underline", focusRingInset)}
              >
                {task.title}
              </button>
              {running ? (
                <span className="text-xs text-muted-foreground">Doing</span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void start(task)}
                  aria-label={`Start ${task.title}`}
                >
                  {starting === task.id ? <Loader2Icon className="size-3 animate-spin" /> : <PlayIcon className="size-3" />}
                  Start
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </DailySection>
  )
}

/** "Standup in 25 minutes", "Standup now", or "Standup at 3:00 PM"; nothing once the day's meetings are over. */
function NextMeeting({ daily, nowMs }: { daily: DailyCardData; nowMs: number }) {
  const next = daily.meetings.find((meeting) => Date.parse(meeting.endsAt) > nowMs)
  if (!next) return null
  const minutes = Math.ceil((Date.parse(next.startsAt) - nowMs) / 60_000)
  const when =
    minutes <= 0 ? "now" : minutes < 60 ? `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : `at ${clockIn(next.startsAt, daily.zone)}`
  return (
    <DailySection title="Next meeting" foldId="next-meeting">
      <p className="text-sm">
        <span className="font-medium">{next.title}</span> {when}
      </p>
    </DailySection>
  )
}

/** At night: what got finished, a clock still running, and an employee's check-out. */
function WindDown({
  daily,
  checkin,
  onCheckOut,
  onOpenTask,
}: {
  daily: DailyCardData
  checkin: { checkedIn: boolean; checkedOut: boolean } | null
  onCheckOut?: () => void
  onOpenTask: (taskId: string) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const running = daily.clock.running
  async function pause() {
    if (!running) return
    if (await run(() => pauseTaskClock(running.taskId), `Paused "${running.title}".`)) {
      await router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID })
    }
  }
  return (
    <DailySection title="Done today" foldId="done-today">
      {daily.finishedToday.length ? (
        <ul className="grid gap-1">
          {daily.finishedToday.map((task) => (
            <li key={task.taskId}>
              <button
                type="button"
                onClick={() => onOpenTask(task.taskId)}
                className={cn("w-full cursor-pointer truncate rounded-md text-left text-sm hover:underline", focusRingInset)}
              >
                {task.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing marked Done today. Tomorrow is a fresh start.</p>
      )}
      {running ? (
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            Your clock is still running on <span className="font-medium">{running.title}</span>.
          </span>
          <Button type="button" variant="outline" size="xs" onClick={() => void pause()} disabled={busy}>
            <PauseIcon className="size-3" />
            Pause
          </Button>
        </div>
      ) : null}
      {checkin?.checkedIn && !checkin.checkedOut && onCheckOut ? (
        <Button type="button" variant="outline" className="w-full" onClick={onCheckOut}>
          Check out and plan tomorrow
        </Button>
      ) : null}
    </DailySection>
  )
}

/** All of Sunday: the week's ratings and wins together, above the usual card. */
function SundayLookBack({ daily }: { daily: DailyCardData }) {
  const days = daily.admin?.lookBack ?? []
  const rated = days.filter((day) => day.rating)
  const wins = days.filter((day) => day.win)
  return (
    <DailySection title="Your week" foldId="your-week">
      <ol className="grid grid-cols-7 gap-1 text-center text-xs" aria-label="This week's ratings">
        {days.map((day) => (
          <li key={day.day} className="grid gap-1">
            <span className="text-muted-foreground">{new Date(`${day.day}T12:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span>
            <span className="font-medium">{day.rating ?? ""}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        {rated.length ? `You rated ${rated.length} of 7 days.` : "No days rated this week."}
      </p>
      {wins.length ? (
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          {wins.map((day) => (
            <li key={day.day}>{day.win}</li>
          ))}
        </ul>
      ) : null}
    </DailySection>
  )
}

/** The first of the month: last month's best habit, typical rating and top wins. */
function MonthlyReview({ daily }: { daily: DailyCardData }) {
  const review = daily.admin?.monthly
  if (!review) return null
  const month = new Date(`${review.month}-15T12:00:00Z`).toLocaleDateString("en", { month: "long", timeZone: "UTC" })
  return (
    <DailySection title={`${month} in review`} foldId="month-in-review">
      <ul className="grid gap-1 text-sm">
        <li>
          {review.bestHabit
            ? `Best habit: ${review.bestHabit.name}, ${review.bestHabit.done} of ${review.bestHabit.of} days.`
            : "No habits were set last month."}
        </li>
        <li>{review.typicalRating ? `A typical day: ${review.typicalRating} out of ${DAY_RATING_TOP}.` : "No days were rated."}</li>
        {review.wins.map((win) => (
          <li key={win}>Win: {win}</li>
        ))}
      </ul>
    </DailySection>
  )
}
