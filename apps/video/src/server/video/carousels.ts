import { and, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm"
import { z } from "zod"

import {
  CAROUSEL_CONFLICT_MESSAGE,
  CAROUSEL_NAME_MAX,
  CAROUSEL_NAME_REQUIRED_MESSAGE,
  CAROUSEL_NOT_FOUND_MESSAGE,
  FIRST_FRAMES_NOT_FOUND_MESSAGE,
  requireCanonicalCarouselSlides,
  requireCarouselFormat,
  type CarouselFormat,
  type CarouselSlide,
} from "@/lib/video/carousel-schema"
import { relayoutSlides } from "@/lib/video/carousel-layout"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import {
  carouselVersionDue,
  keepCarouselVersion,
  lastKeptAt,
} from "@/server/video/carousel-versions"
import { getOwnedProject } from "@/server/video/projects"
import {
  videoCarousels,
  videoFirstFrames,
  type VideoCarouselRow,
} from "@/server/video/schema"
import { askWriter } from "@/server/video/writer"

export type CarouselItem = {
  id: string
  name: string
  format: CarouselFormat
  slide_count: number
  version: number
  thumbnail_url: string | null
  /** Offered under "A template" in New carousel. */
  is_template: boolean
  /** The video project it belongs to, or null. */
  project_id: string | null
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

export function serializeCarousel(row: VideoCarouselRow): CarouselItem {
  const slides = requireCanonicalCarouselSlides(row.slides)
  return {
    id: row.id,
    name: row.name,
    format: requireCarouselFormat(row.format),
    slide_count: slides.length,
    version: row.version,
    thumbnail_url: firstThumbnail(slides),
    is_template: row.isTemplate,
    project_id: row.projectId,
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

/** This person's templates, newest change first, for New carousel. */
export async function listOwnedTemplates(
  userId: string,
  database: CustomShellDb = db
): Promise<CarouselItem[]> {
  const rows = await database
    .select()
    .from(videoCarousels)
    .where(
      and(eq(videoCarousels.userId, userId), eq(videoCarousels.isTemplate, true))
    )
    .orderBy(desc(videoCarousels.updatedAt), desc(videoCarousels.id))
    .limit(100)
  return rows.map(serializeCarousel)
}

/** Marks a carousel as a template, or takes the mark off. */
export async function setCarouselTemplate(
  userId: string,
  carouselId: string,
  isTemplate: boolean,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const [row] = await database
    .update(videoCarousels)
    .set({ isTemplate })
    .where(
      and(eq(videoCarousels.id, carouselId), eq(videoCarousels.userId, userId))
    )
    .returning()
  if (!row) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  return serializeCarousel(row)
}

/**
 * A new carousel copied from a template: its slides, shape and caption, with
 * new ids so the two never share a layer. The copy is not a template and
 * belongs to no project.
 */
export async function createCarouselFromTemplate(
  userId: string,
  templateId: string,
  name: string,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const template = await getOwnedCarousel(userId, templateId, database)
  if (!template.isTemplate) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  const timestamp = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(name),
      format: requireCarouselFormat(template.format),
      slides: requireCanonicalCarouselSlides(cloneSlides(template.slides)),
      caption: template.caption,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return serializeCarousel(row)
}

/** The carousels that belong to one of this person's projects. */
export async function listProjectCarousels(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<CarouselItem[]> {
  await getOwnedProject(userId, projectId, database)
  const rows = await database
    .select()
    .from(videoCarousels)
    .where(
      and(
        eq(videoCarousels.userId, userId),
        eq(videoCarousels.projectId, projectId)
      )
    )
    .orderBy(desc(videoCarousels.updatedAt), desc(videoCarousels.id))
  return rows.map(serializeCarousel)
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

/**
 * A carousel made from a project's first frames: one slide per frame, in the
 * order they were ticked, each picture filling its slide. A portrait frame on
 * a square slide loses its top and bottom, so the middle stays (Tyler's call,
 * 17 Oct 2026).
 */
export async function createCarouselFromFrames(
  userId: string,
  projectId: string,
  firstFrameIds: string[],
  format: CarouselFormat,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const project = await getOwnedProject(userId, projectId, database)
  const ids = [...new Set(firstFrameIds)]
  const rows = await database
    .select({ frame: videoFirstFrames, image: customShellMedia })
    .from(videoFirstFrames)
    .innerJoin(
      customShellMedia,
      and(
        eq(customShellMedia.id, videoFirstFrames.imageMediaId),
        eq(customShellMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(videoFirstFrames.userId, userId),
        eq(videoFirstFrames.projectId, project.id),
        inArray(videoFirstFrames.id, ids)
      )
    )
  const byId = new Map(rows.map((row) => [row.frame.id, row]))
  const picked = ids.flatMap((id) => byId.get(id) ?? [])
  if (!picked.length) throw new Error(FIRST_FRAMES_NOT_FOUND_MESSAGE)
  const slides = await Promise.all(
    picked.map(async ({ frame, image }) => ({
      id: uuid(),
      title: frame.name.slice(0, 120),
      backgroundColor: "#000000",
      items: [
        {
          id: uuid(),
          type: "image" as const,
          mediaId: image.id,
          url: (await serializeMedia(image)).url,
          altText: frame.name.slice(0, 500),
          fit: "cover" as const,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          zIndex: 0,
        },
      ],
    }))
  )
  const timestamp = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(`${project.name} carousel`),
      format: requireCarouselFormat(format),
      slides: requireCanonicalCarouselSlides(slides),
      // It is the project's, so the project lists it
      // (workspace/docs/carousel-projects.md).
      projectId: project.id,
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

/**
 * A copy of a carousel. Given another shape, the copy is in that shape with
 * its layers moved by relayoutSlides and is named after the shape; the
 * original is never changed (workspace/docs/carousel-shapes.md).
 */
export async function duplicateOwnedCarousel(
  userId: string,
  carouselId: string,
  format?: CarouselFormat,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const source = await getOwnedCarousel(userId, carouselId, database)
  const sourceFormat = requireCarouselFormat(source.format)
  const targetFormat = format ? requireCarouselFormat(format) : sourceFormat
  const timestamp = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(
        format ? `${source.name} ${targetFormat}` : `${source.name} copy`
      ),
      format: targetFormat,
      slides: requireCanonicalCarouselSlides(
        relayoutSlides(cloneSlides(source.slides), sourceFormat, targetFormat)
      ),
      caption: source.caption,
      // A copy stays in the same project, and is never a template itself.
      projectId: source.projectId,
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
  const owned = and(
    eq(videoCarousels.id, carouselId),
    eq(videoCarousels.userId, userId),
    eq(videoCarousels.version, value.expectedVersion)
  )
  const row = await database.transaction(async (tx) => {
    // Locked until the save lands, so two saves cannot both decide a
    // version is due (workspace/docs/carousel-history.md).
    const [current] = await tx
      .select()
      .from(videoCarousels)
      .where(owned)
      .for("update")
    if (!current) return undefined
    const at = now()
    const reason = carouselVersionDue(
      current,
      await lastKeptAt(tx, current.id),
      at
    )
    if (reason) await keepCarouselVersion(tx, current, reason, at)
    const [saved] = await tx
      .update(videoCarousels)
      .set({
        slides,
        format,
        caption: value.caption.slice(0, 2_200),
        version: value.expectedVersion + 1,
        updatedAt: at,
      })
      .where(owned)
      .returning()
    return saved
  })
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

  const answer = await askWriter({
    userId,
    feature: "carousel_text_help",
    metadata: { carouselId },
    prompt: `Polish this Instagram carousel text without changing its facts or meaning. Keep it concise, keep its language, and return JSON only as {"text":"..."}.\n\nText: ${JSON.stringify(item.text)}`,
    schema: polishedTextSchema,
    label: "Carousel text help",
  })
  return answer.text.trim()
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
