import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CheckIcon, Loader2Icon, StarIcon } from "lucide-react"

import { burstConfetti } from "@/components/project/confetti"
import { DailySection } from "@/components/project/daily-section"
import { RainbowEdge } from "@/components/project/rainbow-edge"
import { SaveLine } from "@/components/project/save-line"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { markMySleep, rateMyDay, saveJournalWords, type DailyCard } from "@/lib/api/project/daily-card"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { DAILY_LIMITS, DAY_RATING_TOP, type JournalField } from "@/lib/project/daily-card"
import { clockIn } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useSaveLine } from "@/lib/project/use-save-line"

const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

function reloadDashboard(router: ReturnType<typeof useRouter>) {
  return router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID })
}

/**
 * Inside a RainbowEdge. Solid in every state, so only the edge shows the
 * rainbow, and the focus ring is inset so the edge doesn't cut it off.
 */
const RAINBOW_BUTTON =
  "relative w-full border-transparent bg-background hover:bg-muted focus-visible:ring-inset dark:bg-background dark:hover:bg-muted"

/**
 * Under the greeting until the site admin starts the day, and the only thing
 * on the card below it until then (Tyler, 30 Oct 2026: "There
 * should be a "Start day" button like a rate my day button"). It records the
 * time the day began; it says nothing about sleep ("Remove the slept
 * feature").
 */
export function StartDayButton() {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  async function press() {
    if (await run(() => markMySleep("up"))) await reloadDashboard(router)
  }
  return (
    <RainbowEdge className="min-w-0 flex-1 rounded-lg">
      <Button type="button" variant="outline" className={RAINBOW_BUTTON} disabled={busy} onClick={() => void press()}>
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Start day
      </Button>
    </RainbowEdge>
  )
}

/**
 * At night, at the foot of the card: "Rate your day" in a moving rainbow, which
 * opens the evening's journal (Tyler, 29 Oct 2026: "all these should be in a
 * dropdown in a button"): the rating with a note, the win, and Rate day at
 * the foot; no chart of the
 * last 30 days (Tyler, 30 Oct 2026: "remove").
 * Once the day is rated the button says so, plain, and still opens the
 * journal to change it.
 */
export function RateYourDayButton({ daily }: { daily: DailyCard }) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const admin = daily.admin
  if (!admin) return null
  const day = daily.cardDay
  const rated = Boolean(admin.today.bedAt && admin.today.rating)
  const trigger = (
    <PopoverTrigger asChild>
      <Button ref={triggerRef} type="button" variant="outline" className={rated ? "w-full" : RAINBOW_BUTTON}>
        {rated ? (
          <>
            <CheckIcon className="size-4" />
            Day rated {admin.today.rating} of {DAY_RATING_TOP}
          </>
        ) : (
          "Rate your day"
        )}
      </Button>
    </PopoverTrigger>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {rated ? <div className="min-w-0 flex-1">{trigger}</div> : <RainbowEdge className="min-w-0 flex-1 rounded-lg">{trigger}</RainbowEdge>}
      <PopoverContent
        align="end"
        className="grid max-h-[var(--radix-popover-content-available-height)] w-80 grid-cols-[minmax(0,1fr)] gap-3 overflow-y-auto"
      >
        <RateYourDay day={day} rating={admin.today.rating} />
        <JournalBox day={day} field="note" label="A note about today" value={admin.today.note} max={DAILY_LIMITS.note} />
        <JournalBox day={day} field="win" label="Win of the day" value={admin.today.win} max={DAILY_LIMITS.win} />
        <RateDay
          onRated={() => {
            setOpen(false)
            const card = triggerRef.current?.closest("section")
            if (card) burstConfetti(card)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** A journal box that saves itself when left: Saving…, then Saved or Not saved. */
export function JournalBox({
  day,
  field,
  label,
  value,
  max,
}: {
  day: string
  field: JournalField
  label: string
  value: string
  max: number
}) {
  const id = React.useId()
  const [draft, setDraft] = useSyncedDraft(value)
  const [state, track] = useSaveLine()
  const router = useRouter()
  // Reloaded after a save, so a box opened again in the Rate your day window shows it.
  async function save() {
    const text = draft.trim()
    if (text === value) return
    if (await track(() => saveJournalWords({ day, field, text }))) await reloadDashboard(router)
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
      saveJournalWords({ day, field, text }).then(
        () => reloadDashboard(router),
        (error: unknown) => showErrorToast(getProjectErrorMessage(error))
      )
    },
    [day, field, router]
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
        className="bg-background dark:bg-background"
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
        {Array.from({ length: DAY_RATING_TOP }, (_, index) => index + 1).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={shown === value ? "default" : "outline"}
            aria-pressed={shown === value}
            aria-label={`${value} out of ${DAY_RATING_TOP}`}
            className="min-w-0 flex-1 px-0"
            onClick={() => void rate(value)}
          >
            {value}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * The journal's last step (Tyler, 30 Oct 2026, of the Going to bed button:
 * "rename this button to "Rate day" and change the icon", and "Clicking on
 * rate my date also should have some action, it just does nothing but save
 * it"). It needs a rating first; then it closes the journal, sets off the
 * confetti and says good night, and the card's button reads Day rated. The
 * day then shows in the look back's Month tab.
 */
function RateDay({ onRated }: { onRated: () => void }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  async function press() {
    if (!(await run(() => markMySleep("bed")))) return
    onRated()
    await reloadDashboard(router)
  }
  return (
    <Button type="button" className="w-full" onClick={() => void press()} disabled={busy}>
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : <StarIcon className="size-4" />}
      Rate day
    </Button>
  )
}

/** At night, the site admin's tomorrow: meetings, due dates and who's off, across every team. */
export function TomorrowAtAGlance({ daily }: { daily: DailyCard }) {
  if (!daily.admin) return null
  const tomorrow = daily.admin.tomorrow
  const nothing = !tomorrow.meetings.length && !tomorrow.due.length && !tomorrow.away.length && !tomorrow.holidays.length
  return (
    <DailySection title="Tomorrow" foldId="tomorrow">
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
    </DailySection>
  )
}
