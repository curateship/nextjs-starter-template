import { Link } from "@tanstack/react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ListedEvent } from "@/lib/api/events/public"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import {
  eventListDay,
  eventListMonth,
  eventListTimesText,
  formatEventShortDay,
} from "@/lib/events/event-time"
import { SCHEDULE_STATUS_LABELS } from "@/lib/events/schedule-status"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The Events page's list, as Tyler drew it on 25 Nov 2026: the events under a
 * heading for each month, one row each, with the weekday and the day at the
 * left, the title and one line of times, place and category in the middle,
 * and RSVP at the right. It replaced the card grid on this page only; a home
 * page row and a category page still draw `EventCardGrid`.
 *
 * The list arrives in order (soonest first, or newest first on Past), so a
 * month is every run of rows that start in it. A page that starts partway
 * through a month repeats that month's heading, so no row is ever without
 * one.
 *
 * Days and times are printed as stored, so the server and the browser draw the
 * same rows and the page never redraws itself after loading.
 */
export function EventList({
  events,
  emptyMessage,
  byMonths = true,
}: {
  events: ListedEvent[]
  emptyMessage: string
  /** Off for one day's list, whose own heading already names the day. */
  byMonths?: boolean
}) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!byMonths) {
    return (
      <ul className="divide-y border-t">
        {events.map((event) => (
          <li key={event.id}>
            <EventRow event={event} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {byMonth(events).map((month) => (
        <section key={month.key}>
          <h2 className="border-b pb-3 font-sans text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            {month.label}
          </h2>
          <ul className="divide-y">
            {month.events.map((event) => (
              <li key={event.id}>
                <EventRow event={event} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * Runs of events that start in the same month, in the order they came. The
 * featured events the server pins to the top of the upcoming list come first
 * under "Featured", because a December festival over November's rows would
 * otherwise put December before November.
 */
function byMonth(events: ListedEvent[]) {
  const months: { key: string; label: string; events: ListedEvent[] }[] = []
  let pinned = true
  for (const event of events) {
    pinned = pinned && Boolean(event.featured)
    const key = pinned ? "featured" : event.startDate.slice(0, 7)
    const last = months.at(-1)
    if (last?.key === key) last.events.push(event)
    else
      months.push({
        key,
        label: pinned ? "Featured" : eventListMonth(event.startDate),
        events: [event],
      })
  }
  return months
}

function EventRow({ event }: { event: ListedEvent }) {
  const { weekday, day } = eventListDay(event.startDate)
  // Only while the list is narrowed to a distance, like "2.3 km away".
  const distance = formatDirectoryDistance(event.distanceKm)
  const facts = [
    eventListTimesText(event),
    event.placeName,
    event.category?.name,
    distance,
  ].filter(Boolean)
  // Cancelled or postponed stays listed with its label (task events/27).
  const off =
    event.scheduleStatus === "scheduled"
      ? null
      : SCHEDULE_STATUS_LABELS[event.scheduleStatus]

  return (
    <div className="group relative grid grid-cols-[3.875rem_minmax(0,1fr)_auto] items-center gap-x-4 py-5 sm:gap-x-5">
      {/* The day is said again, hidden, beside the times for a screen reader,
          so this block is only for the eye. */}
      <div aria-hidden="true" className="flex flex-col self-start">
        <span className="text-xs font-medium tracking-wider text-muted-foreground">
          {weekday}
        </span>
        <span className="font-heading text-4xl leading-tight">{day}</span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-heading text-2xl leading-snug wrap-anywhere">
            {/* The whole row is the link, the same as a card. */}
            <Link
              to="/events/$slug"
              params={{ slug: event.slug }}
              className={`rounded-sm after:absolute after:inset-0 group-hover:underline ${focusRing}`}
            >
              {event.title}
            </Link>
          </h3>
          {off ? (
            <Badge variant="outline">{off}</Badge>
          ) : event.ended ? (
            <Badge variant="outline">Ended</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="sr-only">{formatEventShortDay(event.startDate)}, </span>
          {facts.map((fact, index) => (
            <span key={index}>
              {/* The dot holds on to the words after it, so a line that wraps
                  starts with one rather than ending on one. */}
              {index ? <span aria-hidden="true"> ·{"\u00a0"}</span> : null}
              {fact}
            </span>
          ))}
        </p>
        {event.summary ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {event.summary}
          </p>
        ) : null}
      </div>

      {/* A cancelled or postponed event has no RSVP: its label says so, and
          RSVP and the going count mean nothing while it is off. */}
      {event.takesSignUps && !off ? (
        <div className="relative z-10 flex items-center gap-3">
          {/* Nothing until somebody has signed up. "0 going" on an event
              nobody has found yet argues against itself. */}
          {event.going ? (
            <span className="text-sm text-muted-foreground">
              {event.going === 1 ? "1 going" : `${event.going} going`}
            </span>
          ) : null}
          {/* A full event says so in place of the button (task events/37,
              Part 12). The row still opens the page, where the waiting list
              is. */}
          {event.full ? (
            <span className="flex h-8 items-center text-sm font-medium">Full</span>
          ) : (
            <Button asChild variant="outline" className="px-4">
              <Link to="/events/$slug" params={{ slug: event.slug }}>
                RSVP
              </Link>
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
