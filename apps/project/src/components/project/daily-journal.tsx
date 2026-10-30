import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { BedIcon, SunriseIcon } from "lucide-react"
import { Line, LineChart, YAxis } from "recharts"

import { RainbowEdge } from "@/components/project/rainbow-edge"
import { SaveLine } from "@/components/project/save-line"
import { PanelHeading } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { markMySleep, rateMyDay, saveJournalWords, type DailyCard } from "@/lib/api/project/daily-card"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { DAILY_LIMITS, hoursAndMinutes, type DayPart, type JournalField } from "@/lib/project/daily-card"
import { addDays, clockIn, dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useSaveLine } from "@/lib/project/use-save-line"
import { cn } from "@/lib/utils"

const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

function reloadDashboard(router: ReturnType<typeof useRouter>) {
  return router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID })
}

/**
 * The site admin's journal on the Daily card, theirs alone: Up and the
 * morning's intention; at night tomorrow at a glance and the morning's
 * intention read back. The rest of the night sits behind Rate your day.
 */
export function DailyJournal({ daily, part }: { daily: DailyCard; part: DayPart }) {
  const admin = daily.admin
  if (!admin) return null
  const day = daily.cardDay
  if (part === "morning") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <SleepLine daily={daily} />
        <JournalBox
          day={day}
          field="intention"
          label="Today I want to..."
          value={admin.today.intention}
          max={DAILY_LIMITS.intention}
        />
        {admin.onThisDay ? (
          <p className="text-sm text-muted-foreground">
            A year ago today you wrote: <span className="text-foreground">{admin.onThisDay.text}</span>
          </p>
        ) : null}
      </div>
    )
  }
  if (part === "afternoon") {
    return admin.today.intention ? (
      <p className="text-sm text-muted-foreground">
        Today you want to: <span className="text-foreground">{admin.today.intention}</span>
      </p>
    ) : null
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <TomorrowAtAGlance daily={daily} />
      {admin.today.intention ? (
        <p className="text-sm text-muted-foreground">
          This morning you wanted to: <span className="text-foreground">{admin.today.intention}</span>
        </p>
      ) : null}
    </div>
  )
}

/**
 * At night, beside Look back: "Rate your day" in a moving rainbow, which
 * opens the evening's journal (Tyler, 29 Oct 2026: "all these should be in a
 * dropdown in a button"): the rating with a note, the win, tonight's
 * question, tomorrow's intention, Going to bed and the last 30 days.
 */
export function RateYourDayButton({ daily }: { daily: DailyCard }) {
  const admin = daily.admin
  if (!admin) return null
  const day = daily.cardDay
  return (
    <Popover>
      <RainbowEdge className="min-w-0 flex-1 rounded-lg">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            // Inset, so the ring isn't cut off by the rainbow's edge.
            className="relative w-full border-transparent bg-background hover:bg-muted focus-visible:ring-inset dark:bg-background dark:hover:bg-muted"
          >
            Rate your day
          </Button>
        </PopoverTrigger>
      </RainbowEdge>
      <PopoverContent
        align="end"
        className="grid max-h-[var(--radix-popover-content-available-height)] w-80 grid-cols-[minmax(0,1fr)] gap-3 overflow-y-auto"
      >
        <RateYourDay day={day} rating={admin.today.rating} />
        <JournalBox day={day} field="note" label="A note about today" value={admin.today.note} max={DAILY_LIMITS.note} />
        <JournalBox day={day} field="win" label="Win of the day" value={admin.today.win} max={DAILY_LIMITS.win} />
        {admin.question ? (
          <JournalBox
            day={day}
            field="answer"
            label={admin.question}
            question={admin.question}
            value={admin.today.answer}
            max={DAILY_LIMITS.answer}
          />
        ) : null}
        <JournalBox
          day={addDays(day, 1)}
          field="intention"
          label="Tomorrow I want to..."
          value={admin.tomorrowIntention}
          max={DAILY_LIMITS.intention}
        />
        <SleepButton kind="bed" done={Boolean(admin.today.bedAt)} at={admin.today.bedAt} zone={daily.zone} />
        <RatingTrend trend={admin.trend} />
      </PopoverContent>
    </Popover>
  )
}

/** A journal box that saves itself when left: Saving…, then Saved or Not saved. */
function JournalBox({
  day,
  field,
  label,
  value,
  max,
  question,
}: {
  day: string
  field: JournalField
  label: string
  value: string
  max: number
  question?: string
}) {
  const id = React.useId()
  const [draft, setDraft] = useSyncedDraft(value)
  const [state, track] = useSaveLine()
  const router = useRouter()
  // Reloaded after a save, so a box opened again in the Rate your day window shows it.
  async function save() {
    const text = draft.trim()
    if (text === value) return
    if (await track(() => saveJournalWords({ day, field, text, question }))) await reloadDashboard(router)
  }
  // The window can close before the box is left, so a draft still unsaved then goes too.
  const unsaved = React.useRef({ draft, value })
  React.useEffect(() => {
    unsaved.current = { draft, value }
  }, [draft, value])
  React.useEffect(
    () => () => {
      const text = unsaved.current.draft.trim()
      if (text === unsaved.current.value) return
      saveJournalWords({ day, field, text, question }).then(
        () => reloadDashboard(router),
        (error: unknown) => showErrorToast(getProjectErrorMessage(error))
      )
    },
    [day, field, question, router]
  )
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <SaveLine state={state} />
      </div>
      <Textarea
        id={id}
        rows={1}
        value={draft}
        maxLength={max}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
      />
    </div>
  )
}

function RateYourDay({ day, rating }: { day: string; rating: number | null }) {
  const router = useRouter()
  const [shown, setShown] = useSyncedDraft(rating)
  const [state, track] = useSaveLine()
  async function rate(next: number) {
    const value = next === shown ? null : next
    setShown(value)
    if (await track(() => rateMyDay({ day, rating: value }))) {
      await reloadDashboard(router)
    } else setShown(rating)
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium" id="daily-rate-label">
          Rate your day
        </span>
        <SaveLine state={state} />
      </div>
      <div role="group" aria-labelledby="daily-rate-label" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={shown === value ? "default" : "outline"}
            aria-pressed={shown === value}
            aria-label={`${value} out of 5`}
            className="flex-1"
            onClick={() => void rate(value)}
          >
            {value}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** "You slept 7h 20m" once Up is pressed, and Up until then. */
function SleepLine({ daily }: { daily: DailyCard }) {
  const admin = daily.admin!
  if (admin.today.upAt) {
    return (
      <p className="text-sm">
        {admin.sleptMinutes ? `You slept ${hoursAndMinutes(admin.sleptMinutes)}.` : `Up at ${clockIn(admin.today.upAt, daily.zone)}.`}
      </p>
    )
  }
  return <SleepButton kind="up" done={false} at={null} zone={daily.zone} />
}

function SleepButton({ kind, done, at, zone }: { kind: "bed" | "up"; done: boolean; at: string | null; zone: string }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  async function press() {
    if (await run(() => markMySleep(kind))) {
      await reloadDashboard(router)
    }
  }
  if (done && at) {
    return (
      <p className="text-sm text-muted-foreground">
        Going to bed at {clockIn(at, zone)}.{" "}
        <button type="button" className="cursor-pointer underline" onClick={() => void press()} disabled={busy}>
          Not yet? Press again later.
        </button>
      </p>
    )
  }
  const Icon = kind === "bed" ? BedIcon : SunriseIcon
  return (
    <Button type="button" variant="outline" className="w-full" onClick={() => void press()} disabled={busy}>
      <Icon className="size-4" />
      {kind === "bed" ? "Going to bed" : "Up"}
    </Button>
  )
}

/** Tomorrow's meetings, due dates and who's off, across every team. */
function TomorrowAtAGlance({ daily }: { daily: DailyCard }) {
  const tomorrow = daily.admin!.tomorrow
  const nothing = !tomorrow.meetings.length && !tomorrow.due.length && !tomorrow.away.length && !tomorrow.holidays.length
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <PanelHeading>Tomorrow</PanelHeading>
      {nothing ? (
        <p className="text-sm text-muted-foreground">No meetings, due dates or days off tomorrow.</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {tomorrow.meetings.map((meeting) => (
            <li key={`${meeting.meetingId}:${meeting.startsAt}`}>
              Meeting: {clockIn(meeting.startsAt, daily.zone)} {meeting.title}
              <span className="text-muted-foreground"> · {meeting.teamName}</span>
            </li>
          ))}
          {tomorrow.due.map((task) => (
            <li key={task.taskId}>
              Due: {task.title}
              <span className="text-muted-foreground"> · {task.projectName}</span>
            </li>
          ))}
          {tomorrow.moreDue ? <li className="text-muted-foreground">and {tomorrow.moreDue} more due</li> : null}
          {tomorrow.away.map((person) => (
            <li key={`${person.name}:${person.teamName}`}>
              Off: {person.name}
              <span className="text-muted-foreground"> · {person.teamName}</span>
            </li>
          ))}
          {tomorrow.holidays.map((holiday) => (
            <li key={`${holiday.name}:${holiday.teamName}`}>
              Holiday: {holiday.name}
              <span className="text-muted-foreground"> · {holiday.teamName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const TREND_CONFIG = { rating: { label: "Rating", color: "var(--chart-1)" } } satisfies ChartConfig

/** The last 30 days of ratings as a small line, drawn with the shared chart pieces. */
function RatingTrend({ trend }: { trend: { day: string; rating: number | null }[] }) {
  const rated = trend.filter((point) => point.rating !== null)
  if (rated.length < 2) return null
  return (
    <div className="grid gap-1">
      <PanelHeading>Last 30 days</PanelHeading>
      <ChartContainer config={TREND_CONFIG} className={cn("aspect-auto h-14 w-full")}>
        <LineChart data={trend} margin={{ top: 4, right: 4, bottom: 4, left: 4 }} accessibilityLayer>
          <YAxis domain={[1, 5]} hide />
          <Line dataKey="rating" type="monotone" stroke="var(--color-rating)" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        {rated.length} days rated since {dayLabel(trend[0].day)}.
      </p>
    </div>
  )
}
