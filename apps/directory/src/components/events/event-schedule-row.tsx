import * as React from "react"

import { PickMenuRow } from "@/components/shared/notes/pick-rows"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { getEventErrorMessage, setEventSchedule, type SiteEvent } from "@/lib/api/events/events"
import { formatEventClock, formatEventShortDay } from "@/lib/events/event-time"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUSES, type ScheduleStatus } from "@/lib/events/schedule-status"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/**
 * The Schedule row in the event's ⋮ (task events/27): Scheduled, Postponed or
 * Cancelled. Picking one asks first, in the shared confirm window, and says
 * who will be emailed. Only after the confirm does it save, through its own
 * door, so a change never rides along with the record's own save.
 *
 * Going back to Scheduled asks for the day and time it goes ahead on, filled
 * in with the ones it had. A new day or time moves the event, keeping its
 * length, and shows "Rescheduled from" on its page; the same ones put it back
 * on. The main
 * event of a repeat goes back on its own day only, because its day anchors
 * the repeat.
 */
export function EventScheduleRow({
  event,
  status,
  repeats,
  signedUp,
  waiting,
  onChanged,
}: {
  event: { id: string; title: string; startDate: string; startTime: string }
  status: ScheduleStatus
  /** The main event of a repeat: its day can't be moved from here. */
  repeats: boolean
  /** How many hold a seat, and how many wait for one: who will be emailed. */
  signedUp: number
  waiting: number
  onChanged: (saved: SiteEvent) => void
}) {
  const [asked, setAsked] = React.useState<ScheduleStatus | null>(null)
  const [day, setDay] = React.useState(event.startDate)
  const [time, setTime] = React.useState(event.startTime)
  const [run, busy] = useAsyncAction(getEventErrorMessage)

  const moved = asked === "scheduled" && (day !== event.startDate || time !== event.startTime)
  const name = event.title.trim() || "this event"
  const who = [
    signedUp ? `${signedUp} ${plural(signedUp, "person", "people")} signed up` : null,
    waiting ? `${waiting} on the waiting list` : null,
  ].filter(Boolean)
  const told =
    who.length === 0
      ? "Nobody is signed up, so no email goes out."
      : `The ${who.join(" and the ")} ${signedUp + waiting === 1 ? "gets" : "get"} an email within a minute or two.`

  const words =
    asked === "cancelled"
      ? {
          title: `Cancel ${name}?`,
          description: `The page says it is cancelled, sign-ups close, and Google is told. It stays on the Events page with a Cancelled label. ${told}`,
          confirm: "Cancel the event",
        }
      : asked === "postponed"
        ? {
            title: `Postpone ${name}?`,
            description: `The page says it is postponed with no new date yet, and sign-ups close. ${told} When there is a new date, pick Scheduled here to set it.`,
            confirm: "Postpone",
          }
        : {
            title: status === "postponed" ? "Set the new date" : `Put ${name} back on?`,
            description: `Sign-ups open again.${repeats ? "" : ` A new day or time shows "Rescheduled from ${formatEventShortDay(event.startDate)}, ${formatEventClock(event.startTime)}" on the page.`} ${told}`,
            confirm: moved ? "Reschedule" : "Put it back on",
          }

  return (
    <>
      <PickMenuRow
        label="Schedule"
        value={SCHEDULE_STATUS_LABELS[status]}
        options={SCHEDULE_STATUSES.map((each) => ({ value: each, label: SCHEDULE_STATUS_LABELS[each] }))}
        selected={status}
        onPick={(next) => {
          // Fresh every time it opens, from the day the event has now.
          setDay(event.startDate)
          setTime(event.startTime)
          setAsked(next as ScheduleStatus)
        }}
      />
      <ConfirmDialog
        open={asked !== null}
        onOpenChange={(open) => {
          if (!open) setAsked(null)
        }}
        title={words.title}
        description={words.description}
        confirmLabel={words.confirm}
        // Never "Cancel" here: beside Postpone it reads as cancelling the event.
        cancelLabel={asked === "cancelled" ? "Keep it" : "Not now"}
        destructive={asked === "cancelled"}
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!asked) return
            if (asked === "scheduled" && !repeats && (!day || !time)) {
              throw new Error("Pick the day and the start time it goes ahead on.")
            }
            const saved = await setEventSchedule({
              id: event.id,
              status: asked,
              ...(asked === "scheduled" && !repeats ? { when: { startDate: day, startTime: time } } : {}),
            })
            setAsked(null)
            onChanged(saved)
          })
        }
      >
        {asked === "scheduled" && !repeats ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel htmlFor="event-schedule-day">Day</FieldLabel>
              <DatePicker id="event-schedule-day" value={dayForPicker(day)} onChange={(date) => setDay(dayFromPicker(date))} />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="event-schedule-time">Start time</FieldLabel>
              <Input id="event-schedule-time" type="time" value={time} onChange={(change) => setTime(change.target.value)} />
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
