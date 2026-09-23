import {
  formatEventClock,
  formatEventShortDay,
  type EventWhen,
} from "@/lib/events/event-time"

/**
 * An event without a cover photo is shared with a drawn card, the same card a
 * listing gets, with the event's date where a listing has its category. The
 * drawing itself is `lib/directory/listing-share-image.ts`.
 */

/**
 * "Sat, Sep 26 · 6:00 PM", or "Sat, Sep 26 to Mon, Sep 28" for an event over
 * several days, where the start time would not fit on the card's one line.
 */
export function eventShareImageKicker(when: EventWhen): string {
  if (when.endDate && when.endDate !== when.startDate) {
    return `${formatEventShortDay(when.startDate)} to ${formatEventShortDay(when.endDate)}`
  }
  return `${formatEventShortDay(when.startDate)} · ${formatEventClock(when.startTime)}`
}

export function eventShareImagePath(slug: string, version: string): string {
  return `/events/share-image/${encodeURIComponent(slug)}?v=${encodeURIComponent(version)}`
}

export function eventShareImageUrl(
  siteUrl: string,
  slug: string,
  version: string
): string {
  return new URL(eventShareImagePath(slug, version), siteUrl).toString()
}
