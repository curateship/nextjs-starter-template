import { createFileRoute } from "@tanstack/react-router"
import { eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { sites, type SiteSettings } from "@/lib/db/schema/sites"
import { resolveSiteByHostWithDevFallback } from "@/lib/site-host-resolution"
import { getClientIp, isPersistentRateLimited } from "@/lib/utils/rate-limit"
import { UUID_REGEX } from "@/lib/utils/validation"
import {
  getListingRatingFromContentBlocks,
  parseWidgetTheme,
  parseWidgetVariant,
  renderListingWidgetHtml,
  type ListingWidgetData,
} from "@/lib/widgets/listing-widget"

const WIDGET_RATE_LIMIT = 120
const WIDGET_RATE_WINDOW_MS = 60_000

// frame-ancestors * is the point of this route: third-party sites embed it in an iframe
const BASE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *",
}

const LISTING_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
const FALLBACK_CACHE_CONTROL = "public, max-age=300, s-maxage=300"

async function loadPublishedListing(siteId: string, directoryId: string): Promise<ListingWidgetData | null> {
  if (!UUID_REGEX.test(directoryId)) return null

  const result = await db.execute(sql`
    select
      d.title,
      d.slug,
      d.content_blocks as "contentBlocks"
    from directory d
    where d.site_id = ${siteId}
      and d.id = ${directoryId}
      and d.status = 'published'
    limit 1
  `)

  const row = result.rows[0] as
    | { title: string; slug: string; contentBlocks: Record<string, unknown> | null }
    | undefined
  if (!row) return null

  return {
    title: row.title,
    slug: row.slug,
    // rating is a per-listing value key, so it lives in the listing's own
    // content_blocks — no template merge needed
    rating: getListingRatingFromContentBlocks(row.contentBlocks || {}),
  }
}

export const Route = createFileRoute("/embed/listing/$directoryId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const host = request.headers.get("host") || ""
          const site = await resolveSiteByHostWithDevFallback(host)
          if (!site) {
            return new Response("Not found", { status: 404, headers: { "Cache-Control": FALLBACK_CACHE_CONTROL } })
          }

          const [siteRow] = await db
            .select({ name: sites.name, settings: sites.settings })
            .from(sites)
            .where(eq(sites.id, site.id))
            .limit(1)
          if (!siteRow || (siteRow.settings as SiteSettings)?.listing_widgets_enabled === false) {
            return new Response("Not found", { status: 404, headers: { "Cache-Control": FALLBACK_CACHE_CONTROL } })
          }

          const ip = getClientIp(request.headers)
          if (await isPersistentRateLimited(`widget:${site.id}:${ip}`, WIDGET_RATE_LIMIT, WIDGET_RATE_WINDOW_MS)) {
            return new Response("Too many requests", {
              status: 429,
              headers: { "Cache-Control": "no-store", "Retry-After": "60" },
            })
          }

          const listing = await loadPublishedListing(site.id, params.directoryId)

          const url = new URL(request.url)
          const html = renderListingWidgetHtml({
            siteName: siteRow.name,
            listing,
            variant: parseWidgetVariant(url.searchParams.get("variant")),
            theme: parseWidgetTheme(url.searchParams.get("theme")),
          })

          return new Response(html, {
            headers: {
              ...BASE_HEADERS,
              "Cache-Control": listing ? LISTING_CACHE_CONTROL : FALLBACK_CACHE_CONTROL,
            },
          })
        } catch (error) {
          console.error("Listing widget error:", error)
          return new Response("Widget unavailable", { status: 500, headers: { "Cache-Control": "no-store" } })
        }
      },
    },
  },
})
