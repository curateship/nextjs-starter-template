import * as React from "react"
import { MapPinIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  googleMapsDirectionsUrl,
  LISTING_WEEKDAYS,
  LISTING_WEEKDAY_LABELS,
  listingHoursStatus,
  formatListingTime,
  type ListingCoordinates,
  type ListingHours,
  type ListingWeekday,
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

export function ListingHoursAndLocation({
  hours,
  coordinates,
}: {
  hours: ListingHours
  coordinates: ListingCoordinates | null
}) {
  const openDays = LISTING_WEEKDAYS.filter((day) => hours[day])
  const [now, setNow] = React.useState<Date | null>(null)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setNow(new Date()), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const today = now ? LISTING_WEEKDAYS[(now.getDay() + 6) % 7]! : null

  if (!openDays.length && !coordinates) return null

  return (
    <div className="grid gap-4">
      {openDays.length ? (
        <section className="grid gap-2" aria-labelledby="listing-hours-title">
          <div className="grid gap-1">
            <h2 id="listing-hours-title" className="text-lg font-semibold">
              Opening hours
            </h2>
            {now ? (
              <p className="text-sm text-muted-foreground">
                {listingHoursStatus(hours, now)}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {LISTING_WEEKDAYS.map((day) => (
                  <HoursRow
                    key={day}
                    day={day}
                    hours={hours[day]}
                    today={day === today}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {coordinates ? (
        <section
          className="grid gap-2"
          aria-labelledby="listing-location-title"
        >
          <h2 id="listing-location-title" className="text-lg font-semibold">
            Location
          </h2>
          <div>
            <Button asChild variant="outline">
              <a
                href={googleMapsDirectionsUrl(coordinates)}
                target="_blank"
                rel="noreferrer"
              >
                <MapPinIcon aria-hidden="true" /> Get directions
              </a>
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function HoursRow({
  day,
  hours,
  today,
}: {
  day: ListingWeekday
  hours: ListingHours[ListingWeekday]
  today: boolean
}) {
  return (
    <tr
      className={cn(
        "border-b last:border-b-0",
        today && "bg-muted font-medium"
      )}
    >
      <th scope="row" className="font-inherit px-3 py-2 text-left">
        {LISTING_WEEKDAY_LABELS[day]}
        {today ? " (Today)" : ""}
      </th>
      <td className="px-3 py-2 text-right text-muted-foreground">
        {hours
          ? `${formatListingTime(hours.open)}–${formatListingTime(hours.close)}`
          : "Closed"}
      </td>
    </tr>
  )
}
