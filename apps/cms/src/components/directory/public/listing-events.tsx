import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import type { ListingEvents } from "@/lib/api/directory/public"
import { eventRowText, formatEventShortDay } from "@/lib/events/event-time"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * "What's on here": the next few events held at a listing, under its write-up
 * and above the related listings, with a link to the rest on the Events page.
 * Left out entirely when nothing is coming up, so a quiet bar has no empty box.
 *
 * Rows rather than cards, the same as the related listings, with the day in
 * the same small square the Events page's list uses.
 */
export function ListingEventsBox({
  whatsOn,
  listingSlug,
}: {
  whatsOn: ListingEvents | null
  listingSlug: string
}) {
  if (!whatsOn?.events.length) return null
  const more = whatsOn.total - whatsOn.events.length

  return (
    <Card>
      <CardContent className="grid gap-1">
        <h2 className="text-lg font-semibold">What's on here</h2>
        <p className="text-sm text-muted-foreground">
          All times are {whatsOn.zone}.
        </p>
      </CardContent>
      <ul className="divide-y border-t">
        {whatsOn.events.map((event) => {
          const [weekday] = formatEventShortDay(event.startDate).split(",")
          return (
            <li
              key={event.id}
              className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div
                aria-hidden="true"
                className="flex w-12 shrink-0 flex-col items-center rounded-md border py-1"
              >
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  {weekday}
                </span>
                <span className="text-lg leading-tight font-semibold">
                  {Number(event.startDate.slice(8))}
                </span>
              </div>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h3 className="min-w-0 text-sm font-medium">
                  {/* The whole row is the link, as on the Events page. */}
                  <Link
                    to="/events/$slug"
                    params={{ slug: event.slug }}
                    className={`block truncate after:absolute after:inset-0 ${focusRing}`}
                  >
                    {event.title}
                  </Link>
                </h3>
                <p className="text-sm text-muted-foreground">
                  {eventRowText(event)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      {more > 0 ? (
        <div className="border-t px-4 py-3">
          <Link
            to="/events"
            search={{ place: listingSlug }}
            className={`rounded-sm text-sm font-medium hover:underline ${focusRing}`}
          >
            See all {whatsOn.total} events here
          </Link>
        </div>
      ) : null}
    </Card>
  )
}
