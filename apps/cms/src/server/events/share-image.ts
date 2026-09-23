import { and, eq } from "drizzle-orm"

import {
  listingShareImageVersion,
  renderListingShareImage,
} from "@/lib/directory/listing-share-image"
import {
  eventShareImageKicker,
  eventShareImagePath,
} from "@/lib/events/event-share-image"
import { toClock } from "@/lib/events/event-time"
import type { enforceRateLimit } from "@/server/auth/rate-limit"
import type { CustomShellDb } from "@/server/db"
import type { VisitorSite } from "@/server/directory/public"
import {
  publicShareImageResponse,
  type DrawShareImage,
} from "@/server/directory/share-image"
import { eventsArePublic } from "@/server/events/public"
import { siteEvents } from "@/server/events/schema"

/**
 * The drawn share card for an event with no cover photo, at
 * /events/share-image/<address>. It shows the event's date where a listing's
 * card shows its category.
 *
 * Drawn only while the Events page is open to everyone, like the feed and the
 * sitemap: a card is fetched by a link preview that is never signed in, and a
 * members-only event should not describe itself to one.
 */
async function drawPublishedEvent(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb,
  draw: DrawShareImage
) {
  if (!(await eventsArePublic(site.id, database))) return null
  const [event] = await database
    .select({
      title: siteEvents.title,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
      endDate: siteEvents.endDate,
      endTime: siteEvents.endTime,
      updatedAt: siteEvents.updatedAt,
    })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.workspaceId, site.id),
        eq(siteEvents.slug, slug),
        eq(siteEvents.status, "published")
      )
    )
    .limit(1)
  if (!event) return null

  const input = {
    title: event.title,
    kicker: eventShareImageKicker({
      startDate: event.startDate,
      startTime: toClock(event.startTime),
      endDate: event.endDate,
      endTime: event.endTime ? toClock(event.endTime) : null,
    }),
    siteName: site.name,
    accentColor: site.accentColor ?? "",
    updatedAt: event.updatedAt,
  }
  return { svg: draw(input), version: listingShareImageVersion(input) }
}

/** The event route's testable work, kept separate from request-host lookup. */
export function eventShareImageResponse(input: {
  request: Request
  site: VisitorSite | null
  slug: string
  requestAddress: string
  database?: CustomShellDb
  limit?: typeof enforceRateLimit
  draw?: DrawShareImage
}): Promise<Response> {
  return publicShareImageResponse({
    ...input,
    kind: "event",
    path: eventShareImagePath,
    read: (site, slug, database) =>
      drawPublishedEvent(
        site,
        slug,
        database,
        input.draw ?? renderListingShareImage
      ),
  })
}
