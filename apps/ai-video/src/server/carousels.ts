import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoCarousels, type AiVideoCarousel } from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import { ANALYSIS_MODEL, generateJson } from "@/server/video-analysis"
import {
  requireCanonicalCarouselFormat,
  requireCanonicalCarouselSlides,
  type CarouselFormat,
  type CarouselMediaItem,
  type CarouselSlide,
  type CarouselSortBy,
  type CarouselSortDirection,
} from "@/lib/carousel-schema"
import { DEFAULT_TEXT_FONT_ID } from "@/lib/text-fonts"

export { CAROUSEL_FORMATS } from "@/lib/carousel-schema"
export type {
  CarouselFormat,
  CarouselGradientShadowItem,
  CarouselItemType,
  CarouselMediaFit,
  CarouselMediaItem,
  CarouselSlide,
  CarouselSlideItem,
  CarouselSortBy,
  CarouselSortDirection,
  CarouselTextAlign,
  CarouselTextItem,
} from "@/lib/carousel-schema"

export type CarouselItem = {
  id: string
  name: string
  slide_count: number
  format: CarouselFormat
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

export type CarouselDetail = CarouselItem & {
  source_text: string
  caption: string
  slides: CarouselSlide[]
}

export type CarouselListResponse = {
  carousels: CarouselItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

const DEFAULT_FORMAT: CarouselFormat = "4:5"
const DEFAULT_BACKGROUND = "#f8fafc"
const DEFAULT_TEXT_Z_INDEX = 10
const DEFAULT_TITLE_TEXT_Y = 0.56
const DEFAULT_TITLE_TEXT_HEIGHT = 0.14
const DEFAULT_BODY_TEXT_Y = 0.74
const DEFAULT_BODY_TEXT_HEIGHT = 0.16

const generatedDraftSchema = z.object({
  caption: z.string().max(2200),
  slides: z
    .array(
      z.object({
        title: z.string().max(120),
        body: z.string().max(700),
      })
    )
    .min(1)
    .max(10),
})

type GeneratedDraft = z.infer<typeof generatedDraftSchema>

function cleanText(value: string, maxLength: number) {
  return value.trim().replace(/\s+\n/g, "\n").slice(0, maxLength)
}

export function cleanCarouselName(value: string) {
  const name = value.trim()
  if (!name) {
    throw new Error("Carousel name is required")
  }
  return name.slice(0, 255)
}

function cleanSourceText(value: string) {
  return cleanText(value, 20_000)
}

function firstThumbnail(slides: CarouselSlide[]) {
  for (const slide of slides) {
    const media = slide.items
      .filter((item) => item.type === "image" || item.type === "video")
      .sort((a, b) => a.zIndex - b.zIndex)[0] as CarouselMediaItem | undefined
    if (media?.url) return media.url
  }
  return null
}

function carouselSearchPattern(value: string) {
  return `%${value
    .trim()
    .slice(0, 255)
    .replace(/[\\%_]/g, "\\$&")}%`
}

function getCarouselOrderBy(
  sortBy: CarouselSortBy,
  sortDirection: CarouselSortDirection
) {
  const slideCount = sql<number>`jsonb_array_length(${aiVideoCarousels.slides})`
  const column =
    sortBy === "name"
      ? aiVideoCarousels.name
      : sortBy === "slide_count"
        ? slideCount
        : sortBy === "format"
          ? aiVideoCarousels.format
          : aiVideoCarousels.updatedAt

  return sortDirection === "asc" ? asc(column) : desc(column)
}

function serializeCarousel(row: AiVideoCarousel): CarouselItem {
  const slides = requireCanonicalCarouselSlides(row.slides)
  return {
    id: row.id,
    name: row.name,
    slide_count: slides.length,
    format: requireCanonicalCarouselFormat(row.format),
    thumbnail_url: firstThumbnail(slides),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function serializeCarouselDetail(row: AiVideoCarousel): CarouselDetail {
  const slides = requireCanonicalCarouselSlides(row.slides)
  return {
    ...serializeCarousel(row),
    source_text: row.sourceText,
    caption: row.caption,
    slides,
  }
}

async function getOwnedCarousel(userId: string, carouselId: string) {
  const [row] = await db
    .select()
    .from(aiVideoCarousels)
    .where(
      and(
        eq(aiVideoCarousels.id, carouselId),
        eq(aiVideoCarousels.userId, userId)
      )
    )
    .limit(1)

  if (!row) {
    throw new Error("Carousel not found")
  }

  return row
}

function carouselPrompt(sourceText: string) {
  return `You are an Instagram carousel editor. Turn the pasted source into a concise feed carousel.

Return ONLY a JSON object with this exact shape:
{
  "caption": "Instagram caption draft...",
  "slides": [{ "title": "Short hook", "body": "One focused point" }]
}

Rules:
- Create 5 to 8 slides.
- Slide 1 is a strong hook.
- Each slide title is under 12 words.
- Each slide body is under 45 words.
- Keep the source's facts; do not invent names, numbers, or claims.
- The last slide should be a practical takeaway or soft CTA.
- Caption should be under 180 words and ready for manual Instagram upload.

Source:
${sourceText}`
}

async function generateCarouselDraft(
  userId: string,
  sourceText: string
): Promise<GeneratedDraft> {
  try {
    return await generateJson(
      [{ text: carouselPrompt(sourceText) }],
      generatedDraftSchema,
      "Carousel generation",
      {
        userId,
        action: {
          provider: "gemini",
          feature: "carousel_generation",
          model: ANALYSIS_MODEL,
        },
      }
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Video analysis is not configured"
    ) {
      throw new Error("Carousel generation is not configured")
    }
    throw error
  }
}

function createSlidesFromDraft(draft: GeneratedDraft): CarouselSlide[] {
  return draft.slides.map((slide, index) => ({
    id: uuid(),
    title: slide.title.trim() || `Slide ${index + 1}`,
    backgroundColor: index === 0 ? "#111827" : DEFAULT_BACKGROUND,
    items: [
      {
        id: uuid(),
        type: "text",
        text: cleanText(slide.title, 240),
        x: 0.1,
        y: DEFAULT_TITLE_TEXT_Y,
        width: 0.8,
        height: DEFAULT_TITLE_TEXT_HEIGHT,
        fontId: DEFAULT_TEXT_FONT_ID,
        fontSize: index === 0 ? 76 : 58,
        color: index === 0 ? "#ffffff" : "#111827",
        align: "left",
        zIndex: DEFAULT_TEXT_Z_INDEX,
      },
      {
        id: uuid(),
        type: "text",
        text: cleanText(slide.body, 1000),
        x: 0.1,
        y: DEFAULT_BODY_TEXT_Y,
        width: 0.8,
        height: DEFAULT_BODY_TEXT_HEIGHT,
        fontId: DEFAULT_TEXT_FONT_ID,
        fontSize: index === 0 ? 38 : 40,
        color: index === 0 ? "#e5e7eb" : "#374151",
        align: "left",
        zIndex: DEFAULT_TEXT_Z_INDEX + 1,
      },
    ],
  }))
}

export async function listCarouselsForCurrentUser({
  page = 1,
  pageSize = 20,
  search,
  sortBy = "updated_at",
  sortDirection = "desc",
}: {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: CarouselSortBy
  sortDirection?: CarouselSortDirection
} = {}): Promise<CarouselListResponse> {
  const user = await requireUser()
  const normalizedPage = Math.max(1, page)
  const normalizedPageSize = Math.min(Math.max(1, pageSize), 100)
  const searchText = search?.trim()
  const where = and(
    eq(aiVideoCarousels.userId, user.id),
    searchText
      ? sql`${aiVideoCarousels.name} ilike ${carouselSearchPattern(searchText)} escape '\\'`
      : undefined
  )

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiVideoCarousels)
    .where(where)
  const total = totalRow?.count ?? 0
  const rows = await db
    .select()
    .from(aiVideoCarousels)
    .where(where)
    .orderBy(
      getCarouselOrderBy(sortBy, sortDirection),
      desc(aiVideoCarousels.updatedAt)
    )
    .offset((normalizedPage - 1) * normalizedPageSize)
    .limit(normalizedPageSize)

  return {
    carousels: rows.map(serializeCarousel),
    total,
    page: normalizedPage,
    page_size: normalizedPageSize,
    total_pages: total ? Math.ceil(total / normalizedPageSize) : 0,
  }
}

export async function getCarouselForCurrentUser(
  carouselId: string
): Promise<CarouselDetail> {
  const user = await requireUser()
  return serializeCarouselDetail(await getOwnedCarousel(user.id, carouselId))
}

export async function createCarouselForCurrentUser(data: {
  name: string
  sourceText: string
}): Promise<CarouselDetail> {
  requireAppOrigin()
  const user = await requireUser()
  const sourceText = cleanSourceText(data.sourceText)
  const draft = sourceText
    ? await generateCarouselDraft(user.id, sourceText)
    : null
  const slides = draft
    ? createSlidesFromDraft(draft)
    : [
        {
          id: uuid(),
          title: "New slide",
          backgroundColor: DEFAULT_BACKGROUND,
          items: [
            {
              id: uuid(),
              type: "text",
              text: "New text",
              x: 0.12,
              y: 0.72,
              width: 0.76,
              height: 0.2,
              zIndex: DEFAULT_TEXT_Z_INDEX,
              fontId: DEFAULT_TEXT_FONT_ID,
              fontSize: 56,
              color: "#111827",
              align: "left",
            },
          ],
        },
      ]
  const createdAt = now()

  const [created] = await db
    .insert(aiVideoCarousels)
    .values({
      id: uuid(),
      userId: user.id,
      name: cleanCarouselName(data.name),
      format: DEFAULT_FORMAT,
      sourceText,
      caption: draft ? cleanText(draft.caption, 2200) : "",
      slides,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!created) {
    throw new Error("Carousel was not created")
  }

  return serializeCarouselDetail(created)
}

export async function renameCarouselForCurrentUser(
  carouselId: string,
  name: string
): Promise<CarouselItem> {
  requireAppOrigin()
  const user = await requireUser()

  const [row] = await db
    .update(aiVideoCarousels)
    .set({ name: cleanCarouselName(name), updatedAt: now() })
    .where(
      and(
        eq(aiVideoCarousels.id, carouselId),
        eq(aiVideoCarousels.userId, user.id)
      )
    )
    .returning()

  if (!row) {
    throw new Error("Carousel not found")
  }

  return serializeCarousel(row)
}

export async function saveCarouselForCurrentUser(
  carouselId: string,
  data: {
    caption: string
    slides: CarouselSlide[]
    format?: CarouselFormat
  }
): Promise<CarouselItem> {
  requireAppOrigin()
  const user = await requireUser()
  const slides = requireCanonicalCarouselSlides(data.slides)

  const [row] = await db
    .update(aiVideoCarousels)
    .set({
      format: data.format
        ? requireCanonicalCarouselFormat(data.format)
        : DEFAULT_FORMAT,
      caption: cleanText(data.caption, 2200),
      slides,
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoCarousels.id, carouselId),
        eq(aiVideoCarousels.userId, user.id)
      )
    )
    .returning()

  if (!row) {
    throw new Error("Carousel not found")
  }

  return serializeCarousel(row)
}

export async function deleteCarouselForCurrentUser(
  carouselId: string
): Promise<{ carouselId: string }> {
  requireAppOrigin()
  const user = await requireUser()

  const [deleted] = await db
    .delete(aiVideoCarousels)
    .where(
      and(
        eq(aiVideoCarousels.id, carouselId),
        eq(aiVideoCarousels.userId, user.id)
      )
    )
    .returning({ id: aiVideoCarousels.id })

  if (!deleted) {
    throw new Error("Carousel not found")
  }

  return { carouselId: deleted.id }
}

export async function deleteCarouselsForCurrentUser(
  carouselIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(carouselIds))
  if (!uniqueIds.length) return { deletedCount: 0 }

  const rows = await db
    .delete(aiVideoCarousels)
    .where(
      and(
        eq(aiVideoCarousels.userId, user.id),
        inArray(aiVideoCarousels.id, uniqueIds)
      )
    )
    .returning({ id: aiVideoCarousels.id })

  return { deletedCount: rows.length }
}
