import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import {
  formatListingDayHours,
  LISTING_WEEKDAYS,
  LISTING_WEEKDAY_LABELS,
  listingHoursStatus,
  type ListingHours,
} from "@/lib/directory/listing-details"
import { cn } from "@/lib/utils"

export function ListingGallery({
  title,
  images,
}: {
  title: string
  images: string[]
}) {
  if (!images.length) return null
  return (
    <section
      aria-label={`${title} photo gallery`}
      className="grid grid-cols-2 gap-2 border-b p-2 md:grid-cols-3 md:gap-3 md:p-3"
    >
      {images.map((image, index) => (
        <a
          key={image}
          href={image}
          target="_blank"
          rel="noreferrer"
          className="overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={image}
            alt={`${title} photo ${index + 1}`}
            loading="lazy"
            decoding="async"
            className="aspect-video w-full object-cover"
          />
        </a>
      ))}
    </section>
  )
}

/**
 * The week, with today at the top.
 *
 * Today is pulled out of the week's order and drawn first in black, and the
 * other six stay in their usual order underneath in grey. Somebody checking
 * whether they can go *now* is asking about one day, and making them find
 * Thursday in a list of seven is the whole reason the old site does it this
 * way.
 *
 * Which day is today comes from the reader's own clock, which the server does
 * not have. So the card draws the plain week on the server and moves today to
 * the top once it is in the browser, rather than showing everybody the server's
 * idea of Thursday.
 */
export function ListingHoursCard({ hours }: { hours: ListingHours }) {
  const openDays = LISTING_WEEKDAYS.filter((day) => hours[day])
  const [now, setNow] = React.useState<Date | null>(null)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setNow(new Date()), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const today = now ? LISTING_WEEKDAYS[(now.getDay() + 6) % 7]! : null

  if (!openDays.length) return null

  const rest = LISTING_WEEKDAYS.filter((day) => day !== today)
  const ordered = today ? [today, ...rest] : [...LISTING_WEEKDAYS]

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Business hours</h2>
          {now ? (
            <p className="text-sm text-muted-foreground">
              {listingHoursStatus(hours, now)}
            </p>
          ) : null}
        </div>
        <dl className="grid gap-2.5">
          {ordered.map((day) => (
            <div
              key={day}
              className={cn(
                "flex items-baseline justify-between gap-4 text-sm text-muted-foreground",
                day === today && "font-semibold text-foreground"
              )}
            >
              <dt>{LISTING_WEEKDAY_LABELS[day]}</dt>
              <dd className="shrink-0 text-right">
                {hours[day] ? formatListingDayHours(hours[day]) : "Closed"}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
