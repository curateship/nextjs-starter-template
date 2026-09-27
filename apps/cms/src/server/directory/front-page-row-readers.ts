import { sql } from "drizzle-orm"

import { cleanContactLinks } from "@/lib/directory/contact-links"
import {
  browseSortForFrontPageSort,
  type DirectoryFrontPageListing,
} from "@/lib/directory/front-page"
import {
  cleanCategoriesRowSettings,
  cleanListingsRowSettings,
  cleanPickedRowSettings,
} from "@/lib/directory/front-page-kinds"
import type {
  CategoriesRowData,
  DealsRowData,
  EventsRowData,
  ListingsRowData,
  PostsRowData,
} from "@/lib/directory/front-page-row-data"
import { timeZoneLabel, wallClockAt } from "@/lib/events/event-time"
import {
  readCategoryCardsForChoices,
  resolvedCategoryChoice,
} from "@/server/directory/category-cards"
import { db, type CustomShellDb } from "@/server/db"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import { siteById } from "@/server/directory/public"
import {
  directoryMapDisplayKey,
  siteTimeZone,
} from "@/server/directory/settings"
import { eventsAccessFor, readUpcomingEvents } from "@/server/events/public"
import { findCurrentUser } from "@/server/auth/security"
import { newestPosts, postsAccessFor } from "@/server/posts/cards"
import { listedDealsAt } from "@/server/promotions/deal-view"
import { dealsAccessFor, readNewestDeals } from "@/server/promotions/public"
import { categories } from "@/server/directory/schema"
import { eq, and } from "drizzle-orm"

/**
 * What fills each of CMS's own front page rows, one row at a time.
 *
 * The shell asks for each row of an app kind while it answers a front page,
 * hands over that row's saved fields and the site whose address was visited,
 * and takes back either the row's contents or `null` — and `null` leaves the
 * row off the page entirely. Every "nothing is coming up", "no deals are on"
 * and "this visitor may not see that page" is said by answering `null`.
 *
 * Each reader is one read. The old per-site builder fetched every row of
 * listings in a single lateral query, which was worth it when a page was
 * nothing but listings; now a page is a hero and a plans table as often as not,
 * and one plain query per row is easier to follow for the same handful of
 * round trips. Each of them is cached for two minutes by
 * `cachedPublicDirectoryRead`, the same cache a saved listing already clears.
 */

/** Whether this visitor is signed in, asked at most once per row. */
const isSignedIn = async () =>
  Boolean(await findCurrentUser().catch(() => null))

/** One category's public address, for a row's "see them all" link. */
async function categorySlug(
  workspaceId: string,
  categoryId: string | null,
  database: CustomShellDb
): Promise<string | null> {
  if (!categoryId) return null
  const [row] = await database
    .select({ slug: categories.slug })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.workspaceId, workspaceId)
      )
    )
    .limit(1)
  return row?.slug ?? null
}

type ListingRow = {
  id: string
  title: string
  slug: string
  metaDescription: string | null
  rating: number | string | null
  featuredImage: string | null
  contactLinks: unknown
  latitude: number | string | null
  longitude: number | string | null
  categoryName: string | null
  categorySlug: string | null
  neighbourhoodName: string | null
  neighbourhoodSlug: string | null
  claimed: boolean
  featured: boolean
}

/**
 * One row's listings: this site's published ones, narrowed to the row's
 * category, in the row's order, capped at the row's count.
 *
 * `featured` is a filter as well as an order, which is what the whole-page
 * "featured" setting always did: a row of featured listings quietly padded out
 * with ordinary ones would be an advert nobody paid for. A map row leaves out a
 * listing missing either coordinate, because a pin needs both and a listing
 * that cannot be drawn must not count towards the row's total.
 */
async function readRowListings(
  workspaceId: string,
  settings: ReturnType<typeof cleanListingsRowSettings>,
  neighbourhoodCategoryId: string | null,
  database: CustomShellDb
): Promise<DirectoryFrontPageListing[]> {
  const result = await database.execute(sql`
    WITH active_feature AS (
      SELECT fe.listing_id, max(fp.priority)::int AS priority
      FROM directory_featured_entitlements fe
      INNER JOIN directory_featured_plans fp ON fp.id = fe.plan_id
      INNER JOIN directory_claims claim
        ON claim.id = fe.claim_id
       AND claim.status = 'approved'
       AND claim.user_id = fe.buyer_user_id
       AND claim.listing_id = fe.listing_id
      WHERE fe.workspace_id = ${workspaceId}
        AND fe.status = 'active'
        AND fe.starts_at <= now()
        AND fe.ends_at > now()
      GROUP BY fe.listing_id
    )
    SELECT
      listing.id,
      listing.title,
      listing.slug,
      listing.meta_description AS "metaDescription",
      listing.rating,
      listing.featured_image AS "featuredImage",
      listing.contact_links AS "contactLinks",
      listing.latitude,
      listing.longitude,
      category.name AS "categoryName",
      category.slug AS "categorySlug",
      neighbourhood.name AS "neighbourhoodName",
      neighbourhood.slug AS "neighbourhoodSlug",
      EXISTS (
        SELECT 1 FROM directory_claims approved
        WHERE approved.listing_id = listing.id
          AND approved.workspace_id = ${workspaceId}
          AND approved.status = 'approved'
      ) AS claimed,
      (feature.listing_id IS NOT NULL) AS featured
    FROM directory_listings listing
    LEFT JOIN active_feature feature ON feature.listing_id = listing.id
    LEFT JOIN LATERAL (
      SELECT category.name, category.slug
      FROM category_relationships relationship
      INNER JOIN categories category ON category.id = relationship.category_id
      WHERE relationship.workspace_id = ${workspaceId}
        AND relationship.content_type = 'directory_listing'
        AND relationship.content_id = listing.id
      ORDER BY relationship.is_primary DESC, category.display_order ASC, category.name ASC
      LIMIT 1
    ) category ON true
    LEFT JOIN LATERAL (
      SELECT category.name, category.slug
      FROM category_relationships relationship
      INNER JOIN categories category ON category.id = relationship.category_id
      WHERE relationship.workspace_id = ${workspaceId}
        AND relationship.content_type = 'directory_listing'
        AND relationship.content_id = listing.id
        AND category.parent_id = ${neighbourhoodCategoryId}
      ORDER BY category.display_order ASC, category.name ASC
      LIMIT 1
    ) neighbourhood ON true
    WHERE listing.workspace_id = ${workspaceId}
      AND listing.status = 'published'
      AND (
        ${settings.categoryId}::varchar IS NULL
        OR EXISTS (
          SELECT 1 FROM category_relationships filtered
          WHERE filtered.workspace_id = ${workspaceId}
            AND filtered.content_type = 'directory_listing'
            AND filtered.content_id = listing.id
            AND filtered.category_id = ${settings.categoryId}
        )
      )
      AND (${settings.sort} <> 'featured' OR feature.listing_id IS NOT NULL)
      AND (
        ${settings.layout} <> 'map'
        OR (listing.latitude IS NOT NULL AND listing.longitude IS NOT NULL)
      )
    ORDER BY
      CASE WHEN ${settings.sort} = 'featured' THEN feature.priority END DESC NULLS LAST,
      CASE WHEN ${settings.sort} = 'rating' THEN listing.rating END DESC NULLS LAST,
      CASE WHEN ${settings.sort} = 'name' THEN listing.title END ASC,
      listing.created_at DESC,
      listing.id ASC
    LIMIT ${settings.count}
  `)

  const needsPoint = settings.layout === "map"
  return (result.rows as ListingRow[]).flatMap((row) => {
    const latitude = row.latitude === null ? null : Number(row.latitude)
    const longitude = row.longitude === null ? null : Number(row.longitude)
    // Checked again rather than cast, so the promise the type makes — a pin
    // always has both numbers — is one the compiler proved.
    if (needsPoint && (latitude === null || longitude === null)) return []

    return [
      {
        id: row.id,
        title: row.title,
        slug: row.slug,
        metaDescription: row.metaDescription ?? "",
        rating: row.rating === null ? null : Number(row.rating),
        featuredImage: row.featuredImage ?? "",
        address: cleanContactLinks(row.contactLinks).address,
        category:
          row.categoryName && row.categorySlug
            ? { name: row.categoryName, slug: row.categorySlug }
            : null,
        neighbourhood:
          row.neighbourhoodName && row.neighbourhoodSlug
            ? { name: row.neighbourhoodName, slug: row.neighbourhoodSlug }
            : null,
        claimed: row.claimed,
        featured: row.featured,
        ...(needsPoint && latitude !== null && longitude !== null
          ? { latitude, longitude }
          : {}),
      },
    ]
  })
}

export async function readListingsRow(
  workspaceId: string,
  settings: Record<string, unknown>,
  database: CustomShellDb = db
): Promise<ListingsRowData | null> {
  const row = cleanListingsRowSettings(settings)
  const shape = await cachedPublicDirectoryRead(
    workspaceId,
    "front-page-listings-row",
    row,
    async () => {
      const { neighbourhoodCategoryId } = await neighbourhoodFor(
        workspaceId,
        database
      )
      const listings = await readRowListings(
        workspaceId,
        row,
        neighbourhoodCategoryId,
        database
      )
      if (listings.length === 0) return null
      return {
        listings,
        slug: await categorySlug(workspaceId, row.categoryId, database),
      }
    },
    // "This row is empty" is remembered too. It is the answer for every row
    // whose category has nothing published in it, and it is asked on the site's
    // busiest page.
    () => true
  )
  if (!shape) return null

  // Read after the cache, like every other secret-shaped value: a key pasted a
  // minute ago should reach the next visitor. Only asked for by a row that
  // actually draws a map, and a row whose key has gone missing draws the grid
  // it would otherwise have been.
  const mapApiKey =
    row.layout === "map"
      ? await directoryMapDisplayKey(workspaceId, database)
      : null
  const browseSort = browseSortForFrontPageSort(row.sort)

  return {
    listings: shape.listings,
    layout: row.layout === "map" && !mapApiKey ? "grid" : row.layout,
    browse: {
      ...(shape.slug ? { category: shape.slug } : {}),
      ...(browseSort ? { sort: browseSort } : {}),
    },
    mapApiKey,
  }
}

/** Which parent category names this site's neighbourhoods, or none. */
async function neighbourhoodFor(workspaceId: string, database: CustomShellDb) {
  const { directorySettings } = await import("@/server/directory/schema")
  const [row] = await database
    .select({
      neighbourhoodCategoryId: directorySettings.neighbourhoodCategoryId,
    })
    .from(directorySettings)
    .where(eq(directorySettings.workspaceId, workspaceId))
    .limit(1)
  return { neighbourhoodCategoryId: row?.neighbourhoodCategoryId ?? null }
}

export async function readCategoriesRow(
  workspaceId: string,
  settings: Record<string, unknown>,
  database: CustomShellDb = db
): Promise<CategoriesRowData | null> {
  const row = cleanCategoriesRowSettings(settings)
  const [cards] = await readCategoryCardsForChoices(
    workspaceId,
    [
      resolvedCategoryChoice(
        { source: row.source, pickedCategoryIds: row.pickedCategoryIds },
        row.count
      ),
    ],
    database
  )
  return cards && cards.length > 0 ? { cards } : null
}

export async function readEventsRow(
  workspaceId: string,
  settings: Record<string, unknown>,
  database: CustomShellDb = db,
  /** The moment to read "still to come" against. The tests fix it. */
  at: Date = new Date()
): Promise<EventsRowData | null> {
  const row = cleanPickedRowSettings(settings)
  // Every card on this row leads to the Events page, so a visitor who may not
  // see that page is shown no row rather than a set of closed doors.
  if ((await eventsAccessFor(workspaceId, isSignedIn, database)) === null) {
    return null
  }
  const site = await siteById(workspaceId, database)
  if (!site) return null

  const timeZone = await siteTimeZone(workspaceId, database)
  const upcoming = await readUpcomingEvents(
    site,
    1,
    wallClockAt(timeZone, at),
    database,
    row.categoryId ? { categoryId: row.categoryId } : {}
  )
  const events = upcoming.events.slice(0, row.count)
  if (events.length === 0) return null

  return {
    events,
    zone: timeZoneLabel(timeZone),
    categorySlug: await categorySlug(workspaceId, row.categoryId, database),
  }
}

export async function readDealsRow(
  workspaceId: string,
  settings: Record<string, unknown>,
  database: CustomShellDb = db,
  /** The moment to read "still on" against. The tests fix it. */
  at: Date = new Date()
): Promise<DealsRowData | null> {
  const row = cleanPickedRowSettings(settings)
  if ((await dealsAccessFor(workspaceId, isSignedIn, database)) === null) {
    return null
  }
  const site = await siteById(workspaceId, database)
  if (!site) return null

  const now = wallClockAt(await siteTimeZone(workspaceId, database), at)
  const deals = listedDealsAt(
    await readNewestDeals(
      site,
      now,
      { categoryId: row.categoryId, limit: row.count },
      database
    ),
    now
  )
  if (deals.length === 0) return null

  return {
    deals,
    categorySlug: await categorySlug(workspaceId, row.categoryId, database),
  }
}

export async function readPostsRow(
  workspaceId: string,
  settings: Record<string, unknown>,
  database: CustomShellDb = db
): Promise<PostsRowData | null> {
  const row = cleanPickedRowSettings(settings)
  if ((await postsAccessFor(workspaceId, isSignedIn, database)) === null) {
    return null
  }
  const site = await siteById(workspaceId, database)
  if (!site) return null

  const posts = await newestPosts(
    workspaceId,
    row.count,
    row.categoryId,
    database
  )
  if (posts.length === 0) return null

  return { posts, siteName: site.name }
}
