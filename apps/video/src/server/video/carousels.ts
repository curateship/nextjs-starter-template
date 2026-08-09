import { and, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm"
import { z } from "zod"

import {
  CAROUSEL_CONFLICT_MESSAGE,
  CAROUSEL_NAME_MAX,
  CAROUSEL_NAME_REQUIRED_MESSAGE,
  CAROUSEL_NOT_FOUND_MESSAGE,
  requireCanonicalCarouselSlides,
  requireCarouselFormat,
  type CarouselFormat,
  type CarouselSlide,
} from "@/lib/video/carousel-schema"
import { now, uuid } from "@/server/auth/security"
import { runAiCall } from "@/server/ai/usage"
import { db, type CustomShellDb } from "@/server/db"
import { generateJson, requireGeminiKey } from "@/server/video/gemini"
import { videoCarousels, type VideoCarouselRow } from "@/server/video/schema"

export type CarouselItem = {
  id: string
  name: string
  format: CarouselFormat
  slide_count: number
  version: number
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

export type CarouselDetail = CarouselItem & {
  slides: CarouselSlide[]
  caption: string
}

export type CarouselListResponse = {
  carousels: CarouselItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function cleanCarouselName(value: string) {
  const name = value.trim().replace(/\s+/g, " ")
  if (!name) throw new Error(CAROUSEL_NAME_REQUIRED_MESSAGE)
  return name.slice(0, CAROUSEL_NAME_MAX)
}

function firstThumbnail(slides: CarouselSlide[]) {
  for (const slide of slides) {
    for (const item of [...slide.items].sort((a, b) => b.zIndex - a.zIndex)) {
      if (item.type === "image") return item.url
    }
  }
  return null
}

function serializeCarousel(row: VideoCarouselRow): CarouselItem {
  const slides = requireCanonicalCarouselSlides(row.slides)
  return {
    id: row.id,
    name: row.name,
    format: requireCarouselFormat(row.format),
    slide_count: slides.length,
    version: row.version,
    thumbnail_url: firstThumbnail(slides),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function serializeDetail(row: VideoCarouselRow): CarouselDetail {
  return {
    ...serializeCarousel(row),
    slides: requireCanonicalCarouselSlides(row.slides),
    caption: row.caption,
  }
}

async function getOwnedCarousel(
  userId: string,
  carouselId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select()
    .from(videoCarousels)
    .where(
      and(eq(videoCarousels.id, carouselId), eq(videoCarousels.userId, userId))
    )
    .limit(1)
  if (!row) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  return row
}

export async function listOwnedCarousels({
  userId,
  page = 1,
  pageSize = 100,
  search = "",
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  database?: CustomShellDb
}): Promise<CarouselListResponse> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
  const filters: SQL[] = [eq(videoCarousels.userId, userId)]
  const cleanedSearch = search.trim()
  if (cleanedSearch) {
    filters.push(
      ilike(
        videoCarousels.name,
        `%${cleanedSearch.replace(/([\\%_])/g, "\\$1")}%`
      )
    )
  }
  const where = and(...filters)
  const [rows, [totals]] = await Promise.all([
    database
      .select()
      .from(videoCarousels)
      .where(where)
      .orderBy(desc(videoCarousels.updatedAt), desc(videoCarousels.id))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: count() }).from(videoCarousels).where(where),
  ])
  const total = totals?.total ?? 0
  return {
    carousels: rows.map(serializeCarousel),
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: Math.max(1, Math.ceil(total / safePageSize)),
  }
}

export async function getOwnedCarouselDetail(
  userId: string,
  carouselId: string,
  database: CustomShellDb = db
) {
  return serializeDetail(await getOwnedCarousel(userId, carouselId, database))
}

function createStarterSlides(): CarouselSlide[] {
  return [
    {
      id: uuid(),
      title: "Hook",
      backgroundColor: "#111827",
      items: [
        {
          id: uuid(),
          type: "text",
          text: "Your hook goes here",
          x: 0.1,
          y: 0.6,
          width: 0.8,
          height: 0.2,
          zIndex: 10,
          fontId: "inter",
          fontSize: 72,
          color: "#ffffff",
          align: "left",
        },
      ],
    },
  ]
}

export async function createOwnedCarousel(
  userId: string,
  name: string,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const timestamp = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(name),
      format: "4:5",
      slides: createStarterSlides(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return serializeCarousel(row)
}

function cloneSlides(value: unknown): CarouselSlide[] {
  return requireCanonicalCarouselSlides(value).map((slide) => ({
    ...slide,
    id: uuid(),
    items: slide.items.map((item) => ({ ...item, id: uuid() })),
  }))
}

export async function duplicateOwnedCarousel(
  userId: string,
  carouselId: string,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const source = await getOwnedCarousel(userId, carouselId, database)
  const timestamp = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(`${source.name} copy`),
      format: source.format,
      slides: cloneSlides(source.slides),
      caption: source.caption,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return serializeCarousel(row)
}

export async function renameOwnedCarousel(
  userId: string,
  carouselId: string,
  name: string,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const [row] = await database
    .update(videoCarousels)
    .set({ name: cleanCarouselName(name), updatedAt: now() })
    .where(
      and(eq(videoCarousels.id, carouselId), eq(videoCarousels.userId, userId))
    )
    .returning()
  if (!row) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  return serializeCarousel(row)
}

export async function writeCarousel(
  userId: string,
  carouselId: string,
  value: {
    slides: CarouselSlide[]
    format: CarouselFormat
    caption: string
    expectedVersion: number
  },
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const slides = requireCanonicalCarouselSlides(value.slides)
  const format = requireCarouselFormat(value.format)
  const [row] = await database
    .update(videoCarousels)
    .set({
      slides,
      format,
      caption: value.caption.slice(0, 2_200),
      version: value.expectedVersion + 1,
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoCarousels.id, carouselId),
        eq(videoCarousels.userId, userId),
        eq(videoCarousels.version, value.expectedVersion)
      )
    )
    .returning()
  if (row) return serializeCarousel(row)

  const [existing] = await database
    .select({ id: videoCarousels.id })
    .from(videoCarousels)
    .where(
      and(eq(videoCarousels.id, carouselId), eq(videoCarousels.userId, userId))
    )
    .limit(1)
  throw new Error(
    existing ? CAROUSEL_CONFLICT_MESSAGE : CAROUSEL_NOT_FOUND_MESSAGE
  )
}

const polishedTextSchema = z.object({ text: z.string().min(1).max(2_000) })

/** One metered writing assist. It returns words only; choosing them remains an
 * ordinary studio edit, so the same undo and auto-save rules cover it. */
export async function polishOwnedCarouselText(
  userId: string,
  carouselId: string,
  slideId: string,
  itemId: string,
  database: CustomShellDb = db
) {
  const carousel = await getOwnedCarousel(userId, carouselId, database)
  const slide = requireCanonicalCarouselSlides(carousel.slides).find(
    (candidate) => candidate.id === slideId
  )
  const item = slide?.items.find((candidate) => candidate.id === itemId)
  if (item?.type !== "text") {
    throw new Error("Select a text layer first.")
  }

  const apiKey = await requireGeminiKey()
  return runAiCall(
    {
      userId,
      provider: "gemini",
      model: "gemini-2.5-flash",
      feature: "carousel_text_help",
      metadata: { carouselId },
    },
    async () => {
      const answer = await generateJson({
        apiKey,
        model: "gemini-2.5-flash",
        label: "Carousel text help",
        schema: polishedTextSchema,
        parts: [
          {
            text: `Polish this Instagram carousel text without changing its facts or meaning. Keep it concise, keep its language, and return JSON only as {"text":"..."}.\n\nText: ${JSON.stringify(item.text)}`,
          },
        ],
      })
      return {
        result: answer.value.text.trim(),
        usage: {
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
        },
      }
    }
  )
}

export async function deleteOwnedCarousels(
  userId: string,
  carouselIds: string[],
  database: CustomShellDb = db
) {
  const ids = Array.from(new Set(carouselIds))
  if (!ids.length) return { deleted_ids: [] as string[] }
  const rows = await database
    .delete(videoCarousels)
    .where(
      and(eq(videoCarousels.userId, userId), inArray(videoCarousels.id, ids))
    )
    .returning({ id: videoCarousels.id })
  return { deleted_ids: rows.map((row) => row.id) }
}
