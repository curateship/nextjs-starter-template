import { Link } from "@tanstack/react-router"

import { PinMap } from "@/components/directory/public/pin-map"
import { Card, CardContent } from "@/components/ui/card"
import type { EventPin } from "@/lib/api/events/public"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The Events page's Map view (task events/37, Part 11): the upcoming list's
 * events as pins, with the same filters, and a small card behind each pin.
 * It is the directory's own map underneath (`PinMap`), so the two behave
 * alike: no paging, a cap said out loud, and no grey square for nothing.
 *
 * Events with no place on the map are counted under it rather than dropped
 * without a word.
 */
export function EventMap({
  apiKey,
  pins,
  total,
  unplaced,
}: {
  /** Null when the site has no Google Maps key, and then there is no map. */
  apiKey: string | null
  pins: EventPin[]
  /** Matching events with a place on the map, before the cap. */
  total: number
  /** Matching events with no place on the map. */
  unplaced: number
}) {
  const missing =
    unplaced === 0
      ? null
      : unplaced === 1
        ? "1 event has no place on the map."
        : `${unplaced} events have no place on the map.`

  if (!apiKey) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            This site has no map set up yet. Switch back to the list to see
            every event.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <PinMap
        apiKey={apiKey}
        pins={pins}
        notice={
          total > pins.length
            ? `Showing ${pins.length} of ${total} events on the map. Pick a category or a date to narrow it down.`
            : null
        }
        emptyText={
          unplaced
            ? "None of these events have a place on the map. Switch back to the list to see them."
            : "Nothing is coming up with these filters."
        }
        failedText="The map could not be loaded. Switch back to the list, or try again in a moment."
        regionLabel="Map of events"
        groupLabel="Events on this map"
        pinLabel={(pin) => `${pin.title}, ${pin.when}`}
        renderCard={(pin) => (
          <Card size="sm" className="pr-8">
            <CardContent className="grid gap-1">
              <Link
                to="/events/$slug"
                params={{ slug: pin.slug }}
                className={`w-fit rounded-sm font-medium hover:underline ${focusRing}`}
              >
                {pin.title}
              </Link>
              <p className="text-sm text-muted-foreground">{pin.when}</p>
              {pin.placeName ? (
                <p className="text-sm text-muted-foreground">{pin.placeName}</p>
              ) : null}
            </CardContent>
          </Card>
        )}
      />
      {missing && pins.length ? (
        <p className="text-sm text-muted-foreground">{missing}</p>
      ) : null}
    </div>
  )
}
