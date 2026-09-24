import { and, eq, sql } from "drizzle-orm"

import { directoryListings } from "@/server/directory/schema"
import { siteEvents } from "@/server/events/schema"

/**
 * How every read finds an event's place when the place is one of the site's
 * listings. Kept apart from the rest of the events code, with nothing but the
 * two tables to import, because the public reads build their column lists
 * when they load and must never wait on a longer chain of imports.
 */

/**
 * An event's listing: by id, and only on the event's own site, so a stray
 * link could never show another site's listing.
 */
export const listingOfEvent = and(
  eq(directoryListings.id, siteEvents.listingId),
  eq(directoryListings.workspaceId, siteEvents.workspaceId)
)

/**
 * The place's name and address as a visitor sees them: the linked listing's
 * current ones, or the typed ones. The query has to left-join
 * `directoryListings` on `listingOfEvent`.
 */
export const livePlaceName = sql<string>`coalesce(${directoryListings.title}, ${siteEvents.placeName})`
export const livePlaceAddress = sql<string>`coalesce(${directoryListings.contactLinks}->>'address', ${siteEvents.placeAddress})`

/**
 * Where the place is on a map, as a visitor sees it: the linked listing's pin,
 * or the typed address as looked up. A listing with no pin means no position,
 * even when the event kept one from before the listing was picked. The query
 * has to left-join `directoryListings` on `listingOfEvent`.
 */
export const livePlaceLatitude = sql<
  number | null
>`case when ${directoryListings.id} is null then ${siteEvents.latitude} else ${directoryListings.latitude} end`.mapWith(
  Number
)
export const livePlaceLongitude = sql<
  number | null
>`case when ${directoryListings.id} is null then ${siteEvents.longitude} else ${directoryListings.longitude} end`.mapWith(
  Number
)
