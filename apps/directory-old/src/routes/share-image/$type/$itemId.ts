import { createFileRoute } from "@tanstack/react-router"
import { eq, sql } from "drizzle-orm"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { db } from "@/lib/db"
import { sites, type SiteSettings } from "@/lib/db/schema/sites"
import { resolveSiteByHostWithDevFallback } from "@/lib/site-host-resolution"
import {
  buildShareCardSvg,
  buildShareImagePath,
  formatShareEventDate,
  isShareImageType,
  resolveShareImageTheme,
  shareImageObjectKey,
  shareImageVersion,
  SHARE_IMAGE_FONT_FAMILY,
  SHARE_IMAGE_FONT_FILE,
  type ShareImageType,
} from "@/lib/share-image"
import { extractEventContentFields } from "@/lib/utils/calendar"
import { getFromR2, toBodyInit, uploadToR2 } from "@/lib/utils/r2"
import { getClientIp, isPersistentRateLimited } from "@/lib/utils/rate-limit"
import { UUID_REGEX } from "@/lib/utils/validation"

const SHARE_IMAGE_RATE_LIMIT = 120
const SHARE_IMAGE_RATE_WINDOW_MS = 60_000

// The URL carries the item's version, so a served image can be cached forever;
// an edit changes the version and with it the URL.
const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable"
const MISS_CACHE_CONTROL = "public, max-age=300"

interface ShareCardRow {
  title: string
  kicker: string | null
  updatedAt: Date | string
}

async function loadListingCard(siteId: string, itemId: string): Promise<ShareCardRow | null> {
  const result = await db.execute(sql`
    select
      d.title,
      d.updated_at as "updatedAt",
      (
        select c.title
        from category_relationships ccr
        join categories c on c.id = ccr.category_id and c.site_id = d.site_id
        where ccr.content_id = d.id and ccr.content_type = 'directory'
        order by ccr.is_primary desc, ccr.created_at asc
        limit 1
      ) as "kicker"
    from directory d
    where d.site_id = ${siteId} and d.id = ${itemId} and d.status = 'published'
    limit 1
  `)
  return (result.rows[0] as unknown as ShareCardRow | undefined) ?? null
}

async function loadEventCard(siteId: string, itemId: string): Promise<ShareCardRow | null> {
  const result = await db.execute(sql`
    select e.title, e.updated_at as "updatedAt", e.content_blocks as "contentBlocks"
    from events e
    where e.site_id = ${siteId} and e.id = ${itemId} and e.is_published = true
    limit 1
  `)
  const row = result.rows[0] as
    | { title: string; updatedAt: Date | string; contentBlocks: unknown }
    | undefined
  if (!row) return null

  const fields = extractEventContentFields(row.contentBlocks)
  return {
    title: row.title,
    kicker: formatShareEventDate(fields.eventDate),
    updatedAt: row.updatedAt,
  }
}

function loadCard(type: ShareImageType, siteId: string, itemId: string) {
  return type === "listing" ? loadListingCard(siteId, itemId) : loadEventCard(siteId, itemId)
}

// The rasterizer is a native addon whose .node binary no bundler can inline,
// so it must be required at runtime, never imported statically.
const requireNative = createRequire(import.meta.url)

// In dev the font sits in public/fonts under the app cwd; in the built server
// the public dir sits beside the server bundle inside .output.
let cachedFontPath: string | null | undefined
function resolveFontPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "public", "fonts", SHARE_IMAGE_FONT_FILE),
    fileURLToPath(new URL(`../public/fonts/${SHARE_IMAGE_FONT_FILE}`, import.meta.url)),
    fileURLToPath(new URL(`../../public/fonts/${SHARE_IMAGE_FONT_FILE}`, import.meta.url)),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function renderCardPng(svg: string): Buffer {
  const { Resvg } = requireNative("@resvg/resvg-js") as typeof import("@resvg/resvg-js")
  if (cachedFontPath === undefined) cachedFontPath = resolveFontPath()
  if (!cachedFontPath) throw new Error("Share image font is missing on the server")

  const rendered = new Resvg(svg, {
    font: {
      fontFiles: [cachedFontPath],
      loadSystemFonts: false,
      defaultFontFamily: SHARE_IMAGE_FONT_FAMILY,
    },
  })
  return Buffer.from(rendered.render().asPng())
}

function imageResponse(body: BodyInit): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": IMAGE_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": MISS_CACHE_CONTROL } })
}

export const Route = createFileRoute("/share-image/$type/$itemId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { type, itemId } = params
          if (!isShareImageType(type) || !UUID_REGEX.test(itemId)) return notFound()

          const site = await resolveSiteByHostWithDevFallback(request.headers.get("host") || "")
          if (!site) return notFound()

          const [siteRow] = await db
            .select({ name: sites.name, settings: sites.settings })
            .from(sites)
            .where(eq(sites.id, site.id))
            .limit(1)
          if (!siteRow) return notFound()

          const ip = getClientIp(request.headers)
          if (await isPersistentRateLimited(`share-image:${site.id}:${ip}`, SHARE_IMAGE_RATE_LIMIT, SHARE_IMAGE_RATE_WINDOW_MS)) {
            return new Response("Too many requests", {
              status: 429,
              headers: { "Cache-Control": "no-store", "Retry-After": "60" },
            })
          }

          const card = await loadCard(type, site.id, itemId)
          const version = card ? shareImageVersion(card.updatedAt) : null
          if (!card || !version) return notFound()

          // A stale or fabricated version must not mint extra stored copies:
          // send the scraper to the one canonical URL for the current version.
          if (new URL(request.url).searchParams.get("v") !== version) {
            return new Response(null, {
              status: 302,
              headers: {
                Location: buildShareImagePath(type, itemId, version),
                "Cache-Control": MISS_CACHE_CONTROL,
              },
            })
          }

          const objectKey = shareImageObjectKey(site.id, type, itemId, version)
          const stored = await getFromR2(objectKey).catch(() => null)
          if (stored?.Body) return imageResponse(toBodyInit(stored.Body))

          const settings = siteRow.settings as SiteSettings | null
          const svg = buildShareCardSvg({
            title: card.title,
            kicker: card.kicker,
            // Same precedence as the page titles: configured site title, then name
            siteName: (typeof settings?.site_title === "string" && settings.site_title.trim()) || siteRow.name,
            theme: resolveShareImageTheme(settings?.default_theme),
          })
          const png = renderCardPng(svg)
          await uploadToR2(objectKey, png, "image/png")
          return imageResponse(new Uint8Array(png))
        } catch (error) {
          console.error("Share image error:", error)
          return new Response("Share image unavailable", { status: 500, headers: { "Cache-Control": "no-store" } })
        }
      },
    },
  },
})
