import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import type { EventNeighbourRow } from "@/lib/api/events/public"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The two short lists at the foot of an event's page (task events/37):
 *
 * - **Also on**, the next dates of the same repeating event, so a visitor who
 *   cannot make this Tuesday finds next Tuesday. Shown on an ended date too.
 * - **Also at**, the place's next few events, with a link to all of them on
 *   the Events page. Only for a place that is a published listing.
 *
 * Each list is left out when it has nothing in it, so most events show
 * neither.
 */
export function EventNeighbours({
  otherDates,
  atPlace,
  placeName,
  placeListingSlug,
}: {
  otherDates: EventNeighbourRow[]
  atPlace: EventNeighbourRow[]
  placeName: string
  /** Null while the place is not a published listing open to visitors. */
  placeListingSlug: string | null
}) {
  const showAtPlace = Boolean(placeListingSlug && atPlace.length)
  if (!otherDates.length && !showAtPlace) return null

  return (
    <>
      {otherDates.length ? (
        <NeighbourList
          id="event-also-on"
          heading="Also on"
          rows={otherDates}
          // The same event, so the day and time are what tell rows apart.
          byTitle={false}
        />
      ) : null}
      {showAtPlace && placeListingSlug ? (
        <NeighbourList
          id="event-also-at"
          heading={`Also at ${placeName}`}
          rows={atPlace}
          byTitle
          more={
            <Link
              to="/events"
              search={{ place: placeListingSlug }}
              className={`w-fit rounded-sm text-sm font-medium hover:underline ${focusRing}`}
            >
              All events at {placeName}
            </Link>
          }
        />
      ) : null}
    </>
  )
}

function NeighbourList({
  id,
  heading,
  rows,
  byTitle,
  more,
}: {
  id: string
  heading: string
  rows: EventNeighbourRow[]
  /** Link each row by its title, with the day after it, or by its day. */
  byTitle: boolean
  more?: ReactNode
}) {
  return (
    // One line between two sections: straight after the sign-up box, whose
    // own bottom line is already there, this one draws none.
    <section
      aria-labelledby={id}
      className="-mx-4 grid gap-2 border-t px-4 pt-4 [section[aria-labelledby=event-sign-up-title]+&]:border-t-0 [section[aria-labelledby=event-sign-up-title]+&]:pt-0"
    >
      <h2 id={id} className="text-base font-semibold">
        {heading}
      </h2>
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Link
              to="/events/$slug"
              params={{ slug: row.slug }}
              className={`rounded-sm font-medium hover:underline ${focusRing}`}
            >
              {byTitle ? row.title : row.day}
            </Link>
            <span className="text-muted-foreground">
              {byTitle ? `${row.day}, ${row.time}` : row.time}
            </span>
          </li>
        ))}
      </ul>
      {more}
    </section>
  )
}
