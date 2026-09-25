import { Link } from "@tanstack/react-router"
import { CalendarPlusIcon, ClockIcon, MapPinIcon } from "lucide-react"

import { FeaturedBadge } from "@/components/directory/public/featured-badge"
import { CategoryPill } from "@/components/shared/card-chips"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { ListedEvent } from "@/lib/api/events/public"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import { eventCardTimesText, eventDateChip } from "@/lib/events/event-time"
import { publicCardHover } from "@/lib/layout/card-hover"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { cn } from "@/lib/utils"

/**
 * The card grid every public list of events uses: the Events page, a day's
 * list, a category page and a home page row. One component so the four cannot
 * drift apart, the same way `ListingGrid` holds the one listing card.
 *
 * Days and times are printed as stored, so the server and the browser draw the
 * same card and the page never redraws itself after loading.
 */
export function EventCardGrid({
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
    <ul
      className="grid sm:grid-cols-2 lg:grid-cols-3"
      // The site's own gutter from Settings → Styling, the same as every other
      // public grid.
      style={{ gap: pageGutter }}
    >
      {events.map((event) => (
        <li key={event.id}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  )
}

/** The month over the day, in a block at the top-left of the photo. */
function DateBlock({ date }: { date: string }) {
  const { month, day } = eventDateChip(date)
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 flex-col overflow-hidden rounded-lg bg-background text-center"
    >
      <span className="bg-foreground px-2.5 py-0.5 text-xs font-semibold tracking-wide text-background">
        {month}
      </span>
      <span className="px-2.5 py-1 text-xl leading-tight font-semibold text-foreground">
        {day}
      </span>
    </span>
  )
}

export function EventCard({ event }: { event: ListedEvent }) {
  // Only while the list is narrowed to a distance, like "2.3 km away".
  const distance = formatDirectoryDistance(event.distanceKm)
  const where = [event.placeName, distance].filter(Boolean).join(" · ")

  return (
    <Card
      className={cn(
        `relative w-full ${publicCardHover}`,
        // The card only drops its top padding for a bare `<img>` first child,
        // and the blocks over the photo need a box to sit in.
        event.coverImage && "pt-0"
      )}
    >
      {event.coverImage ? (
        <div className="relative overflow-hidden">
          <img
            src={event.coverImage}
            srcSet={mediaImageSrcSet(event.coverImage)}
            sizes="(min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            className="aspect-[3/2] w-full object-cover"
          />
          {/* One row across the top, so a long category name is cut short by
              the date rather than running under it. Inset by the card's own
              content padding, so the date lines up with the title beneath it. */}
          <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
            <DateBlock date={event.startDate} />
            {event.category ? (
              <CategoryPill name={event.category.name} />
            ) : null}
          </div>
        </div>
      ) : null}
      <CardContent className="grid gap-1">
        {/* A card with no photo has nowhere for the two blocks over it, so the
            date and the category go here instead of vanishing. */}
        {!event.coverImage || event.featured || event.ended ? (
          <div className="flex flex-wrap items-center gap-2">
            {event.coverImage ? null : <DateBlock date={event.startDate} />}
            {!event.coverImage && event.category ? (
              <CategoryPill name={event.category.name} tone="plain" />
            ) : null}
            {event.featured ? <FeaturedBadge /> : null}
            {event.ended ? <Badge variant="outline">Ended</Badge> : null}
          </div>
        ) : null}
        <h2 className="text-lg leading-snug font-semibold">
          {/* The whole card is the link, the same as a listing card. */}
          <Link
            to="/events/$slug"
            params={{ slug: event.slug }}
            className={`after:absolute after:inset-0 ${focusRing}`}
          >
            {event.title}
          </Link>
        </h2>
        {event.summary ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {event.summary}
          </p>
        ) : null}
        <p className="flex items-start gap-2 pt-1 text-sm">
          <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{eventCardTimesText(event)}</span>
        </p>
        {where ? (
          <p className="flex items-start gap-2 text-sm">
            <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{where}</span>
          </p>
        ) : null}
      </CardContent>
      {event.takesSignUps ? (
        <CardFooter className="justify-between gap-2 bg-transparent">
          {/* Nothing where the count goes until somebody has signed up. "0
              going" on an event nobody has found yet argues against itself. */}
          <p className="text-sm text-muted-foreground">
            {event.going === 0
              ? ""
              : event.going === 1
                ? "1 going"
                : `${event.going} going`}
          </p>
          {/* Above the card-wide click layer, so the button is the thing the
              pointer lands on. It goes to the same page either way; the button
              is there to say sign-ups are open. */}
          <Button asChild className="relative z-10">
            <Link to="/events/$slug" params={{ slug: event.slug }}>
              <CalendarPlusIcon aria-hidden="true" />
              RSVP
            </Link>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
