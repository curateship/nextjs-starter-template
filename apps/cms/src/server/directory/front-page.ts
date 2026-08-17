import { sql } from "drizzle-orm"

import {
  browseSortForFrontPageSort,
  DIRECTORY_FRONT_PAGE_COUNT_MAX,
  isDirectoryFrontPageLayout,
  isDirectoryFrontPageSort,
  MAX_DIRECTORY_FRONT_PAGE_SECTIONS,
  type DirectoryFrontPageData,
  type DirectoryFrontPageListing,
  type DirectoryFrontPageRow,
} from "@/lib/directory/front-page"
import { db, type CustomShellDb } from "@/server/db"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import { directoryMapDisplayKey } from "@/server/directory/settings"

type FrontPageRow = {
  pageHeading: string
  pageIntro: string
  sectionId: string
  sectionHeading: string
  sectionIntro: string
  sort: string
  layout: string
  categorySlug: string | null
  id: string | null
  title: string | null
  slug: string | null
  metaDescription: string | null
  rating: number | string | null
  featuredImage: string | null
  latitude: number | string | null
  longitude: number | string | null
  listingCategoryName: string | null
  listingCategorySlug: string | null
  claimed: boolean | null
  featured: boolean | null
}

/**
 * Every row of a site's home page, and the listings in each, in one query.
 *
 * One query no matter how many rows there are. Each row's listings come from a
 * lateral subquery that is re-run per row with that row's own filter, order and
 * limit, so six rows of twelve cost the same round trip as one row of eight —
 * which is the whole reason a home page is allowed several rows at all.
 *
 * A row whose filter matches nothing comes back with no listings and is dropped
 * here rather than drawn as a heading over an empty space.
 */
async function readFrontPageRows(
  site: { id: string; name: string },
  database: CustomShellDb
): Promise<Omit<DirectoryFrontPageData, "mapApiKey"> | null> {
  const result = await database.execute(sql`
    WITH config AS (
      SELECT
        coalesce(nullif(trim(settings.browse_title), ''), 'Directory') AS heading,
        coalesce(trim(settings.browse_intro), '') AS intro,
        (
          coalesce(settings.map_enabled, false)
          AND settings.map_display_key_encrypted IS NOT NULL
        ) AS map_ok
      FROM (SELECT 1) fallback
      LEFT JOIN directory_settings settings
        ON settings.workspace_id = ${site.id}
    ),
    sections AS (
      SELECT
        section.id,
        section.display_order,
        section.heading,
        section.intro,
        section.category_id,
        section.sort,
        section.listing_count,
        -- A map this site cannot draw becomes a grid of the same listings. The
        -- choice is refused in the admin screen too, so this is the belt for a
        -- site that saved a map row and then removed its key.
        CASE
          WHEN section.layout = 'map' AND config.map_ok THEN 'map'
          WHEN section.layout = 'map' THEN 'grid'
          ELSE section.layout
        END AS layout,
        category.slug AS category_slug
      FROM directory_front_page_sections section
      CROSS JOIN config
      LEFT JOIN categories category
        ON category.id = section.category_id
       AND category.workspace_id = ${site.id}
      WHERE section.workspace_id = ${site.id}
      ORDER BY section.display_order ASC, section.id ASC
      LIMIT ${MAX_DIRECTORY_FRONT_PAGE_SECTIONS}
    ),
    active_feature AS (
      SELECT fe.listing_id, max(fp.priority)::int AS priority
      FROM directory_featured_entitlements fe
      INNER JOIN directory_featured_plans fp ON fp.id = fe.plan_id
      INNER JOIN directory_claims claim
        ON claim.id = fe.claim_id
       AND claim.status = 'approved'
       AND claim.user_id = fe.buyer_user_id
       AND claim.listing_id = fe.listing_id
      WHERE fe.workspace_id = ${site.id}
        AND fe.status = 'active'
        AND fe.starts_at <= now()
        AND fe.ends_at > now()
      GROUP BY fe.listing_id
    )
    SELECT
      config.heading AS "pageHeading",
      config.intro AS "pageIntro",
      sections.id AS "sectionId",
      sections.heading AS "sectionHeading",
      sections.intro AS "sectionIntro",
      sections.sort,
      sections.layout,
      sections.category_slug AS "categorySlug",
      chosen.id,
      chosen.title,
      chosen.slug,
      chosen."metaDescription",
      chosen.rating,
      chosen."featuredImage",
      chosen.latitude,
      chosen.longitude,
      chosen."listingCategoryName",
      chosen."listingCategorySlug",
      chosen.claimed,
      chosen.featured
    FROM sections
    CROSS JOIN config
    LEFT JOIN LATERAL (
      SELECT
        listing.id,
        listing.title,
        listing.slug,
        listing.meta_description AS "metaDescription",
        listing.rating,
        listing.featured_image AS "featuredImage",
        listing.latitude,
        listing.longitude,
        category.name AS "listingCategoryName",
        category.slug AS "listingCategorySlug",
        EXISTS (
          SELECT 1 FROM directory_claims approved
          WHERE approved.listing_id = listing.id
            AND approved.workspace_id = ${site.id}
            AND approved.status = 'approved'
        ) AS claimed,
        (feature.listing_id IS NOT NULL) AS featured,
        row_number() OVER (
          ORDER BY
            CASE WHEN sections.sort = 'featured' THEN feature.priority END DESC NULLS LAST,
            CASE WHEN sections.sort = 'rating' THEN listing.rating END DESC NULLS LAST,
            CASE WHEN sections.sort = 'name' THEN listing.title END ASC,
            listing.created_at DESC,
            listing.id ASC
        ) AS position
      FROM directory_listings listing
      LEFT JOIN active_feature feature ON feature.listing_id = listing.id
      LEFT JOIN LATERAL (
        SELECT category.name, category.slug
        FROM category_relationships relationship
        INNER JOIN categories category ON category.id = relationship.category_id
        WHERE relationship.workspace_id = ${site.id}
          AND relationship.content_type = 'directory_listing'
          AND relationship.content_id = listing.id
        ORDER BY relationship.is_primary DESC, category.display_order ASC, category.name ASC
        LIMIT 1
      ) category ON true
      WHERE listing.workspace_id = ${site.id}
        AND listing.status = 'published'
        AND (
          sections.category_id IS NULL
          OR EXISTS (
            SELECT 1 FROM category_relationships filtered
            WHERE filtered.workspace_id = ${site.id}
              AND filtered.content_type = 'directory_listing'
              AND filtered.content_id = listing.id
              AND filtered.category_id = sections.category_id
          )
        )
        -- 'featured' is a filter as well as an order: a row of featured
        -- listings padded out with ordinary ones is an advert nobody paid for.
        AND (sections.sort <> 'featured' OR feature.listing_id IS NOT NULL)
        -- A pin needs both numbers, so a map row never counts a listing it
        -- could not draw towards its total.
        AND (
          sections.layout <> 'map'
          OR (listing.latitude IS NOT NULL AND listing.longitude IS NOT NULL)
        )
      ORDER BY position ASC
      -- The row's own limit is applied by the join below. This one is the
      -- ceiling on any row, read from the same constant that refuses a bigger
      -- one on the way in, so raising the cap does not need this remembering.
      LIMIT ${DIRECTORY_FRONT_PAGE_COUNT_MAX}
    ) chosen ON chosen.position <= sections.listing_count
    ORDER BY sections.display_order ASC, sections.id ASC, chosen.position ASC
  `)

  const rows = result.rows as FrontPageRow[]
  const first = rows[0]
  if (!first) return null

  const byId = new Map<string, DirectoryFrontPageRow>()
  for (const row of rows) {
    const sort = isDirectoryFrontPageSort(row.sort) ? row.sort : "newest"
    let section = byId.get(row.sectionId)
    if (!section) {
      const browseSort = browseSortForFrontPageSort(sort)
      section = {
        id: row.sectionId,
        heading: row.sectionHeading,
        intro: row.sectionIntro,
        layout: isDirectoryFrontPageLayout(row.layout) ? row.layout : "grid",
        browse: {
          ...(row.categorySlug ? { category: row.categorySlug } : {}),
          ...(browseSort ? { sort: browseSort } : {}),
        },
        listings: [],
      }
      byId.set(row.sectionId, section)
    }
    const listing = toListing(row, section.layout === "map")
    if (listing) section.listings.push(listing)
  }

  return {
    siteName: site.name,
    heading: first.pageHeading,
    intro: first.pageIntro,
    // A heading over nothing is worse than one row fewer, so an empty row is
    // not drawn at all.
    rows: [...byId.values()].filter((row) => row.listings.length > 0),
  }
}

function toListing(
  row: FrontPageRow,
  needsPoint: boolean
): DirectoryFrontPageListing | null {
  if (!row.id || !row.title || !row.slug) return null
  const latitude = row.latitude === null ? null : Number(row.latitude)
  const longitude = row.longitude === null ? null : Number(row.longitude)
  // The query already refuses a map row's listing that is missing either
  // number. Checked again rather than cast, so the promise the type makes — a
  // pin always has both — is one the compiler proved.
  if (needsPoint && (latitude === null || longitude === null)) return null

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    metaDescription: row.metaDescription ?? "",
    rating: row.rating === null ? null : Number(row.rating),
    featuredImage: row.featuredImage ?? "",
    category:
      row.listingCategoryName && row.listingCategorySlug
        ? { name: row.listingCategoryName, slug: row.listingCategorySlug }
        : null,
    claimed: row.claimed ?? false,
    featured: row.featured ?? false,
    ...(needsPoint && latitude !== null && longitude !== null
      ? { latitude, longitude }
      : {}),
  }
}

/**
 * A site's listings home page, or null when it has no rows.
 *
 * Cached like every other public directory page, and cleared by the same
 * `clearPublicDirectoryCache` that saving a listing already calls — so a new
 * listing appears on the home page immediately rather than in two minutes.
 */
export async function readDirectoryFrontPage(
  site: { id: string; name: string },
  database: CustomShellDb = db
): Promise<DirectoryFrontPageData | null> {
  const page = await cachedPublicDirectoryRead(
    site.id,
    "front-page",
    { name: site.name },
    () => readFrontPageRows(site, database),
    // "This site has no rows" is remembered too, unlike every other public
    // page here. It is the answer for every site that does not use the feature,
    // and it is asked on their busiest page — leaving it uncached would mean
    // this query ran on every single visit to a home page that has no use for
    // it. Adding a row clears the cache, so the "no" cannot go stale.
    () => true
  )
  if (!page || page.rows.length === 0) return null

  // Read after the cache, like every other secret-shaped value here: a key
  // pasted a minute ago should reach the next visitor rather than the one after
  // the cache expires. Only asked for when a row actually draws a map, so a
  // home page with no map never carries the key at all.
  const mapApiKey = page.rows.some((row) => row.layout === "map")
    ? await directoryMapDisplayKey(site.id, database)
    : null

  // A key that has gone missing since the rows were read leaves a map row with
  // nothing to draw into, so it becomes the grid it would have been.
  const rows = mapApiKey
    ? page.rows
    : page.rows.map((row) =>
        row.layout === "map" ? { ...row, layout: "grid" as const } : row
      )

  return { ...page, rows, mapApiKey }
}
