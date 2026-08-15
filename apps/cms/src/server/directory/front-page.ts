import { sql } from "drizzle-orm"

import type { DirectoryFrontPageData } from "@/lib/directory/front-page"
import { db, type CustomShellDb } from "@/server/db"

type FrontPageRow = {
  mode: string
  heading: string
  intro: string
  id: string | null
  title: string | null
  slug: string | null
  metaDescription: string | null
  rating: number | string | null
  featuredImage: string | null
  categoryName: string | null
  categorySlug: string | null
  claimed: boolean | null
  featured: boolean | null
}

/**
 * Reads the front-page choice and its cards together. This stays one query on
 * the site's busiest page, including when the switch is off or no cards exist.
 */
export async function readDirectoryFrontPage(
  site: { id: string; name: string },
  database: CustomShellDb = db,
  options: { featuredAvailable?: boolean } = {}
): Promise<DirectoryFrontPageData | null> {
  const featuredAvailable = options.featuredAvailable ?? true
  const result = await database.execute(sql`
    WITH config AS (
      SELECT
        CASE
          WHEN coalesce(settings.front_page_mode, 'off') = 'featured'
            AND NOT ${featuredAvailable}
            THEN 'newest'
          ELSE coalesce(settings.front_page_mode, 'off')
        END AS mode,
        coalesce(nullif(trim(settings.browse_title), ''), 'Directory') AS heading,
        coalesce(trim(settings.browse_intro), '') AS intro,
        greatest(1, least(12, coalesce(settings.front_page_count, 8))) AS listing_count
      FROM (SELECT 1) fallback
      LEFT JOIN directory_settings settings
        ON settings.workspace_id = ${site.id}
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
    ),
    chosen AS (
      SELECT
        listing.id,
        listing.title,
        listing.slug,
        listing.meta_description AS "metaDescription",
        listing.rating,
        listing.featured_image AS "featuredImage",
        category.name AS "categoryName",
        category.slug AS "categorySlug",
        EXISTS (
          SELECT 1 FROM directory_claims approved
          WHERE approved.listing_id = listing.id
            AND approved.workspace_id = ${site.id}
            AND approved.status = 'approved'
        ) AS claimed,
        (feature.listing_id IS NOT NULL) AS featured,
        listing.created_at,
        feature.priority
      FROM directory_listings listing
      CROSS JOIN config
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
        AND config.mode <> 'off'
        AND (config.mode <> 'featured' OR feature.listing_id IS NOT NULL)
      ORDER BY
        CASE WHEN config.mode = 'featured' THEN feature.priority END DESC NULLS LAST,
        listing.created_at DESC,
        listing.id ASC
      LIMIT (SELECT listing_count FROM config)
    )
    SELECT
      config.mode,
      config.heading,
      config.intro,
      chosen.id,
      chosen.title,
      chosen.slug,
      chosen."metaDescription",
      chosen.rating,
      chosen."featuredImage",
      chosen."categoryName",
      chosen."categorySlug",
      chosen.claimed,
      chosen.featured
    FROM config
    LEFT JOIN chosen ON true
    ORDER BY
      CASE WHEN config.mode = 'featured' THEN chosen.priority END DESC NULLS LAST,
      chosen.created_at DESC,
      chosen.id ASC
  `)
  const rows = result.rows as FrontPageRow[]
  const first = rows[0]
  if (!first || first.mode === "off") return null

  return {
    siteName: site.name,
    heading: first.heading,
    intro: first.intro,
    listings: rows.flatMap((row) =>
      row.id && row.title && row.slug
        ? [
            {
              id: row.id,
              title: row.title,
              slug: row.slug,
              metaDescription: row.metaDescription ?? "",
              rating: row.rating === null ? null : Number(row.rating),
              featuredImage: row.featuredImage ?? "",
              category:
                row.categoryName && row.categorySlug
                  ? { name: row.categoryName, slug: row.categorySlug }
                  : null,
              claimed: row.claimed ?? false,
              featured: row.featured ?? false,
            },
          ]
        : []
    ),
  }
}
