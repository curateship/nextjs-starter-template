import { Link } from "@tanstack/react-router"
import { MapPinIcon } from "lucide-react"

import { FeaturedBadge } from "@/components/directory/public/featured-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ListedEvent } from "@/lib/api/events/public"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import { eventRowText, formatEventShortDay } from "@/lib/events/event-time"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The Events page's list: one row per event, with its day, times and place,
 * and how far away it is while the list is narrowed to a distance.
 * An event that is over says so, which only happens in one day's list; the
 * upcoming list never holds one. A featured event carries the same badge as a
 * featured listing, only on the Events page: other pages' events never say.
 *
 * Days and times are printed as stored, so the server and the browser draw the
 * same row and the page never redraws itself after loading.
 */
export function EventList({
  events,
  emptyMessage,
}: {
  events: ListedEvent[]
  emptyMessage: string
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

  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y">
        {events.map((event) => {
          const [weekday] = formatEventShortDay(event.startDate).split(",")
          // Only while the list is narrowed to a distance, like "2.3 km away".
          const distance = formatDirectoryDistance(event.distanceKm)
          const where = [event.placeName, distance].filter(Boolean).join(" · ")
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
                <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  {/* The whole row is the link, the same as a post card. */}
                  <Link
                    to="/events/$slug"
                    params={{ slug: event.slug }}
                    className={`truncate after:absolute after:inset-0 ${focusRing}`}
                  >
                    {event.title}
                  </Link>
                  {event.featured ? (
                    <span className="shrink-0">
                      <FeaturedBadge />
                    </span>
                  ) : null}
                  {event.ended ? (
                    <Badge variant="outline" className="shrink-0">
                      Ended
                    </Badge>
                  ) : null}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {eventRowText(event)}
                </p>
                {where ? (
                  <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPinIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{where}</span>
                  </p>
                ) : null}
              </div>

              {event.coverImage ? (
                <img
                  src={event.coverImage}
                  alt=""
                  loading="lazy"
                  className="hidden h-12 w-16 shrink-0 rounded-md object-cover sm:block"
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
