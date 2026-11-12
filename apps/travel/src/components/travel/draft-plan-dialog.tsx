import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { forgetDraftOnArrival, wantsDraftOnArrival } from "@/components/travel/draft-on-arrival"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { createPlan, draftPlan, fillDay, fillGaps, type DraftItem, type TripDraft } from "@/lib/api/travel/trip-draft"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import type { ActivityType } from "@/lib/travel/activity-types"
import { formatMinutes } from "@/lib/travel/board"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

type Row = DraftItem & { key: string; ticked: boolean }

// The plan asked for on arrival from New trip, kept until the window closes. The trip page can
// draw twice as it arrives, and the second draw takes this answer rather than asking the AI again.
let arrival: { tripId: string; plan: Promise<TripDraft> } | null = null

function arrivalPlan(tripId: string) {
  if (arrival?.tripId !== tripId) arrival = { tripId, plan: draftPlan(tripId) }
  return arrival.plan
}

/** "Days 2 and 4", "Day 3", "Days 1, 2 and 5". */
function daysText(days: number[]) {
  if (days.length === 1) return `Day ${days[0]}`
  return `Days ${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`
}

const activities = (count: number) => (count === 1 ? "1 activity" : `${count} activities`)

/**
 * Draft a plan (Travel features part 7; Tyler, 3 Nov 2026: "Sights and food,
 * timed", from "Both" New trip and "+ Add"). Opening it asks the AI at once
 * for 3 to 5 timed sights and meals on each empty day. The plan shows here,
 * day by day, to untick, rename or retime; nothing is saved until Create.
 *
 * With `day` set it is Fill this day (More Travel features part 6: "Timed, in
 * the gaps"): the AI fills that one day's free time around what it holds, and
 * what is added can be undone from the bar at the bottom. With `gaps` it is
 * Fill every gap (Travel features 4, part 10: "+ Add, part-planned days"): the
 * same for every day that already has plans, with Undo too.
 */
export function DraftPlanDialog({
  open,
  tripId,
  startDate,
  types,
  day = null,
  gaps = false,
  onClose,
  onMade,
}: {
  open: boolean
  tripId: string
  startDate: string | null
  types: readonly ActivityType[]
  /** Fill this one day's free time, rather than drafting every empty day. */
  day?: number | null
  /** Fill the free time on every day that already has plans. */
  gaps?: boolean
  onClose: () => void
  /** The plan was made; the trip reloads, then the window closes. */
  onMade: () => Promise<void>
}) {
  const [draft, setDraft] = React.useState<{ ask: number; plan: TripDraft } | null>(null)
  const [failed, setFailed] = React.useState<{ ask: number; reason: string } | null>(null)
  const [rows, setRows] = React.useState<Row[]>([])
  const [edited, setEdited] = React.useState(false)
  // Which ask the window is on. A window that starts open, as it does on a trip just made with a
  // first plan asked for, asks at once.
  const [ask, setAsk] = React.useState(open ? 1 : 0)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const typesById = React.useMemo(() => new Map(types.map((type) => [type.id, type])), [types])

  // Each opening asks again, from nothing.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(null)
      setFailed(null)
      setRows([])
      setEdited(false)
      setAsk((was) => was + 1)
    }
  }

  // The AI's answer is the outside world's, so it lands from the request's callback.
  React.useEffect(() => {
    if (!open || ask === 0) return
    let alive = true
    const asking =
      day !== null
        ? fillDay(tripId, day)
        : gaps
          ? fillGaps(tripId)
          : ask === 1 && wantsDraftOnArrival(tripId)
            ? arrivalPlan(tripId)
            : draftPlan(tripId)
    asking
      .then((plan) => {
        if (!alive) return
        setDraft({ ask, plan })
        setRows(plan.items.map((item, index) => ({ ...item, key: `${ask}-${index}`, ticked: true })))
      })
      .catch((error: unknown) => {
        if (alive) setFailed({ ask, reason: getTravelErrorMessage(error) })
      })
    return () => {
      alive = false
    }
  }, [ask, day, gaps, open, tripId])

  // Closing ends the arrival's plan too, so coming back to the trip doesn't open it again.
  const close = () => {
    forgetDraftOnArrival()
    arrival = null
    onClose()
  }

  const plan = draft?.ask === ask ? draft.plan : null
  const reason = failed?.ask === ask ? failed.reason : null
  const reading = open && !plan && !reason
  const ticked = rows.filter((row) => row.ticked)
  const change = (key: string, patch: Partial<Row>) => {
    setEdited(true)
    setRows((was) => was.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  async function create() {
    if (ticked.length === 0) {
      showErrorToast("Tick at least one activity to add.")
      return
    }
    if (ticked.some((row) => !row.title.trim())) {
      showErrorToast("Give every ticked activity a name, or untick it.")
      return
    }
    const ok = await run(async () => {
      await createPlan(
        tripId,
        ticked.map(({ day, title, typeId, startTime, durationMinutes }) => ({
          day,
          title: title.trim(),
          typeId,
          startTime,
          durationMinutes,
        }))
      )
      await onMade()
    })
    if (!ok) return
    close()
  }

  const byDay = new Map<number, Row[]>()
  for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row])

  return (
    <FormDialog open={open} dirty={edited} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{day !== null ? `Fill Day ${day}` : gaps ? "Fill every gap" : "Draft a plan"}</DialogTitle>
            <DialogDescription>
              {day !== null
                ? `AI suggests sights and meals for the free time on Day ${day}, around what's planned. Untick or change any before adding them.`
                : gaps
                  ? "AI suggests sights and meals for the free time on each day that already has plans. Untick or change any before adding them."
                  : "AI suggests sights and meals for each day with nothing planned. Untick or change any before adding them."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {reading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" aria-live="polite">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                {day !== null
                  ? `Filling Day ${day}. This takes up to a minute.`
                  : gaps
                    ? "Filling the free time. This takes up to a minute."
                    : "Drafting the days. This takes up to a minute."}
              </p>
            ) : reason ? (
              <div className="grid justify-items-start gap-3 py-2">
                <p className="text-sm text-destructive">{reason}</p>
                <Button type="button" variant="outline" onClick={() => setAsk((was) => was + 1)}>
                  Try again
                </Button>
              </div>
            ) : plan ? (
              <div className="grid gap-6">
                {plan.skipped.length || plan.later ? (
                  <p className="text-sm text-muted-foreground">
                    {plan.skipped.length
                      ? gaps
                        ? `${daysText(plan.skipped)} ${plan.skipped.length === 1 ? "has" : "have"} no free time left, so ${plan.skipped.length === 1 ? "it is" : "they are"} left as ${plan.skipped.length === 1 ? "it is" : "they are"}. `
                        : `${daysText(plan.skipped)} already ${plan.skipped.length === 1 ? "has" : "have"} plans, so ${plan.skipped.length === 1 ? "it is" : "they are"} left as ${plan.skipped.length === 1 ? "it is" : "they are"}. `
                      : ""}
                    {plan.later
                      ? gaps
                        ? `${plan.later} more ${plan.later === 1 ? "day has" : "days have"} free time: fill again after adding these.`
                        : `${plan.later} more empty ${plan.later === 1 ? "day is" : "days are"} left: draft again after adding these.`
                      : ""}
                  </p>
                ) : null}
                {[...byDay.entries()].map(([day, dayRows]) => (
                  <Card key={day} size="sm">
                    <CardHeader>
                      <CardTitle>{dayLabel(day, startDate)}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                      {dayRows.map((row) => (
                        <div key={row.key} className="flex min-w-0 items-center gap-2">
                          <Checkbox
                            checked={row.ticked}
                            onCheckedChange={(on) => change(row.key, { ticked: on === true })}
                            aria-label={`Add ${row.title || "this activity"}`}
                          />
                          <ActivityTypeIcon type={row.typeId ? typesById.get(row.typeId) : null} />
                          <Input
                            aria-label="Name"
                            value={row.title}
                            maxLength={200}
                            disabled={!row.ticked}
                            className="min-w-0 flex-1"
                            onChange={(event) => change(row.key, { title: event.target.value })}
                          />
                          <Input
                            aria-label={`Start time of ${row.title || "this activity"}`}
                            type="time"
                            value={row.startTime ?? ""}
                            disabled={!row.ticked}
                            className="w-28 shrink-0"
                            onChange={(event) => change(row.key, { startTime: event.target.value || null })}
                          />
                          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                            {row.durationMinutes ? formatMinutes(row.durationMinutes) : ""}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            {plan ? (
              <Button type="button" disabled={busy} onClick={() => void create()}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
                Create {activities(ticked.length)}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
