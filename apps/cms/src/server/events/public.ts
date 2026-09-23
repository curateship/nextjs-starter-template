import { and, asc, eq } from "drizzle-orm"

import type { EventWhen } from "@/lib/events/event-time"
import { postListingIds, type PostBody } from "@/lib/posts/post-body"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import {
  publicListingCardsByIds,
  type PublicCategoryLink,
  type PublicListingCard,
  type PublicSite,
  type VisitorSite,
} from "@/server/directory/public"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import { categories, categoryRelationships } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import { toEvent } from "@/server/events/events"
import { siteEvents, EVENT_CONTENT_TYPE } from "@/server/events/schema"

/**
 * What a visitor may read of a site's events. Every read takes the site from
 * the visited address and selects published events only, so a draft is
 * missing rather than hidden.
 *
 * The Events page's on/off switch is checked by the endpoint before this runs,
 * because a members-only switch depends on who is asking and this answer is
 * cached for everyone. Whether the event is over is worked out by the endpoint
 * too, after the cache, so a cached answer never says an event is still on.
 */

export type PublicEvent = EventWhen & {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  body: PostBody
  placeName: string
  placeAddress: string
  categories: PublicCategoryLink[]
}

export type PublicEventPage = {
  site: PublicSite
  event: PublicEvent
  /** The zone the event's clock times are in, like 'America/Toronto'. */
  timeZone: string
  /** Published listings the body's cards point at, as on a post. */
  listingCards: PublicListingCard[]
}

/** Published, on this site. The whole of what a visitor may read. */
function publishedEventsOnSite(siteId: string) {
  return and(
    eq(siteEvents.workspaceId, siteId),
    eq(siteEvents.status, "published")
  )
}

async function readPublicEventUncached(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb
): Promise<PublicEventPage | null> {
  const [row] = await database
    .select()
    .from(siteEvents)
    .where(and(publishedEventsOnSite(site.id), eq(siteEvents.slug, slug)))
    .limit(1)
  if (!row) return null

  const event = toEvent(row)
  const [categoryRows, timeZone, directoryVisibility] = await Promise.all([
    database
      .select({ name: categories.name, slug: categories.slug })
      .from(categoryRelationships)
      .innerJoin(
        categories,
        eq(categories.id, categoryRelationships.categoryId)
      )
      .where(
        and(
          eq(categoryRelationships.workspaceId, site.id),
          eq(categoryRelationships.contentType, EVENT_CONTENT_TYPE),
          eq(categoryRelationships.contentId, row.id)
        )
      )
      .orderBy(asc(categories.name)),
    siteTimeZone(site.id, database),
    readPageVisibility(site.id, "/directory", database),
  ])

  // A card links to the listing's page, so while the directory is not open to
  // everyone the cards are left out rather than pointing at a closed door.
  const listingCards =
    directoryVisibility === "everyone"
      ? await publicListingCardsByIds(
          site.id,
          postListingIds(event.body),
          database
        )
      : []

  return {
    site: { name: site.name, url: site.url },
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      summary: event.summary,
      coverImage: event.coverImage,
      body: event.body,
      startDate: event.startDate,
      startTime: event.startTime,
      endDate: event.endDate,
      endTime: event.endTime,
      placeName: event.placeName,
      placeAddress: event.placeAddress,
      categories: categoryRows,
    },
    timeZone,
    listingCards,
  }
}

/** One published event by its address, or null. */
export function readPublicEvent(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb = db
): Promise<PublicEventPage | null> {
  return cachedPublicDirectoryRead(
    site.id,
    "event",
    { site: { name: site.name, url: site.url }, slug },
    () => readPublicEventUncached(site, slug, database)
  )
}
