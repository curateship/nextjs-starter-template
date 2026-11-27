import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  type SQL,
} from "drizzle-orm"
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
import { applyCarouselLook, captionWithFooter, readCarouselLook } from "@/lib/video/carousel-look"
import { CAROUSEL_PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/carousel-projects"
import { type VideoSort, type VideoStatus } from "@/lib/video/project-videos"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import {
  carouselVersionDue,
  keepCarouselVersion,
  lastKeptAt,
} from "@/server/video/carousel-versions"
import { cleanProjectName, getOwnedProject } from "@/server/video/projects"
import {
  videoCarouselProjectLastCarousels,
  videoCarouselProjects,
  videoCarousels,
  videoFirstFrames,
  videoRenderJobs,
  type VideoCarouselProjectRow,
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
  /** The video project it was made from, or null. */
  project_id: string | null
  /** The carousel project holding it. */
  carousel_project_id: string
  status: VideoStatus
  pinned: boolean
  archived: boolean
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

/** The first picture of stored slides, for a list row; null if none can be read. */
export function carouselThumbnail(value: unknown) {
  try {
    return firstThumbnail(requireCanonicalCarouselSlides(value))
  } catch {
    return null
  }
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
    carousel_project_id: row.carouselProjectId,
    status: row.status,
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
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

/** The most rows one Carousels tab answer holds. A project of more scrolls in pages. */
const CAROUSEL_PAGE_MAX = 200

/** One of this person's carousel projects, or the not-found error. */
export async function requireOwnedCarouselProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<VideoCarouselProjectRow> {
  const [row] = await database
    .select()
    .from(videoCarouselProjects)
    .where(and(eq(videoCarouselProjects.id, projectId), eq(videoCarouselProjects.userId, userId)))
    .limit(1)
  if (!row) throw new Error(CAROUSEL_PROJECT_NOT_FOUND_MESSAGE)
  return row
}

/**
 * A carousel project's "last edited" moves whenever one of its carousels is
 * saved, made, moved or deleted, as a video project's does.
 */
async function touchCarouselProject(projectId: string, at: Date, database: CustomShellDb) {
  await database
    .update(videoCarouselProjects)
    .set({ updatedAt: at })
    .where(eq(videoCarouselProjects.id, projectId))
}

function orderFor(sort: VideoSort): SQL[] {
  // Pinned first whatever the sort, earliest pin on top, as in the Videos tab.
  const pinned = [sql`${videoCarousels.pinnedAt} is null`, asc(videoCarousels.pinnedAt)]
  if (sort === "name") return [...pinned, sql`lower(${videoCarousels.name})`, asc(videoCarousels.id)]
  if (sort === "newest") return [...pinned, desc(videoCarousels.createdAt), desc(videoCarousels.id)]
  return [...pinned, desc(videoCarousels.updatedAt), desc(videoCarousels.id)]
}

/**
 * The Carousels tab: one carousel project's carousels, searched by name,
 * sorted, filtered by status, 200 at a time. Archived carousels are listed
 * only when asked for.
 */
export async function listProjectCarousels({
  userId,
  projectId,
  search = "",
  sort = "edited",
  status,
  archived = false,
  page = 1,
  pageSize = CAROUSEL_PAGE_MAX,
  database = db,
}: {
  userId: string
  projectId: string
  search?: string
  sort?: VideoSort
  status?: VideoStatus
  archived?: boolean
  page?: number
  pageSize?: number
  database?: CustomShellDb
}): Promise<CarouselListResponse> {
  await requireOwnedCarouselProject(userId, projectId, database)
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(CAROUSEL_PAGE_MAX, Math.max(1, Math.floor(pageSize)))
  const filters: SQL[] = [
    eq(videoCarousels.carouselProjectId, projectId),
    eq(videoCarousels.userId, userId),
    archived ? isNotNull(videoCarousels.archivedAt) : isNull(videoCarousels.archivedAt),
  ]
  if (status) filters.push(eq(videoCarousels.status, status))
  const cleaned = search.trim()
  if (cleaned) {
    filters.push(ilike(videoCarousels.name, `%${cleaned.replace(/([\\%_])/g, "\\$1")}%`))
  }
  const where = and(...filters)
  const [rows, [totals]] = await Promise.all([
    database
      .select()
      .from(videoCarousels)
      .where(where)
      .orderBy(...orderFor(sort))
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

/**
 * The carousel the editor opens in a carousel project, for one person: the
 * one asked for, else the one they last had open, else the first in the
 * Carousels tab's own order. Archived carousels open only when asked for by
 * name, or when every carousel is archived. A project with none answers null.
 * Nothing is written here: this runs on a page load.
 */
export async function openProjectCarousel({
  userId,
  projectId,
  carouselId,
  database = db,
}: {
  userId: string
  projectId: string
  carouselId?: string
  database?: CustomShellDb
}): Promise<CarouselDetail | null> {
  await requireOwnedCarouselProject(userId, projectId, database)
  const inProject = and(
    eq(videoCarousels.carouselProjectId, projectId),
    eq(videoCarousels.userId, userId)
  )
  if (carouselId) {
    const [row] = await database
      .select()
      .from(videoCarousels)
      .where(and(inProject, eq(videoCarousels.id, carouselId)))
      .limit(1)
    if (!row) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
    return serializeDetail(row)
  }
  const [remembered] = await database
    .select({ carousel: videoCarousels })
    .from(videoCarouselProjectLastCarousels)
    .innerJoin(videoCarousels, eq(videoCarousels.id, videoCarouselProjectLastCarousels.carouselId))
    .where(
      and(
        eq(videoCarouselProjectLastCarousels.projectId, projectId),
        eq(videoCarouselProjectLastCarousels.person, userId),
        inProject,
        isNull(videoCarousels.archivedAt)
      )
    )
    .limit(1)
  if (remembered) return serializeDetail(remembered.carousel)
  const [first] = await database
    .select()
    .from(videoCarousels)
    .where(inProject)
    .orderBy(sql`${videoCarousels.archivedAt} is not null`, ...orderFor("edited"))
    .limit(1)
  return first ? serializeDetail(first) : null
}

/** Remembers the carousel a person has open, so its project opens on it next time. */
export async function rememberOpenCarousel(
  userId: string,
  carouselId: string,
  database: CustomShellDb = db
) {
  const carousel = await getOwnedCarousel(userId, carouselId, database)
  const at = now()
  await database
    .insert(videoCarouselProjectLastCarousels)
    .values({ projectId: carousel.carouselProjectId, person: userId, carouselId, updatedAt: at })
    .onConflictDoUpdate({
      target: [videoCarouselProjectLastCarousels.projectId, videoCarouselProjectLastCarousels.person],
      set: { carouselId, updatedAt: at },
    })
}

/**
 * The carousel project an old carousel address belongs to, so a link from
 * before carousel projects (`/admin/video-carousels/<carousel>`) can be sent
 * on to its project. Null when the id is not one of this person's carousels.
 */
export async function carouselProjectOf(
  userId: string,
  carouselId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ projectId: videoCarousels.carouselProjectId })
    .from(videoCarousels)
    .where(and(eq(videoCarousels.id, carouselId), eq(videoCarousels.userId, userId)))
    .limit(1)
  return row?.projectId ?? null
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

/**
 * The insert behind every carousel made in a carousel project. A new carousel
 * starts in the project's look and its caption ends with the project's footer
 * (part 22). A copy of a carousel keeps both as they were (`keepLook`,
 * `keepCaption`); one from a template keeps its design and gains the footer.
 * The caller has checked the project is the person's.
 */
export async function insertCarousel(
  database: CustomShellDb,
  {
    userId,
    project,
    name,
    format = "4:5",
    slides,
    caption = "",
    madeFrom = null,
    status,
    keepLook = false,
    keepCaption = false,
    editedAt,
  }: {
    userId: string
    project: VideoCarouselProjectRow
    name: string
    format?: CarouselFormat
    /** Starter slides when left out. */
    slides?: CarouselSlide[]
    caption?: string
    /** The video project it was made from (`project_id`). */
    madeFrom?: string | null
    status?: VideoStatus
    /** Slides keep their own fonts, colours and background. */
    keepLook?: boolean
    /** The caption stays as given, with no footer added. */
    keepCaption?: boolean
    /** When it counts as last edited; a duplicate sits just under its original. */
    editedAt?: Date
  }
): Promise<VideoCarouselRow> {
  const look = readCarouselLook(project.look)
  const starting = slides ?? createStarterSlides()
  const at = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(name),
      format: requireCarouselFormat(format),
      slides: requireCanonicalCarouselSlides(keepLook ? starting : applyCarouselLook(starting, look)),
      caption: keepCaption ? caption : captionWithFooter(caption, project.captionFooter),
      projectId: madeFrom,
      carouselProjectId: project.id,
      ...(status ? { status } : {}),
      createdAt: at,
      updatedAt: editedAt ?? at,
    })
    .returning()
  await touchCarouselProject(project.id, at, database)
  return row
}

/**
 * This person's templates for New carousel: those in `projectId` first, then
 * the rest, newest change first in each (part 23).
 */
export async function listOwnedTemplates(
  userId: string,
  projectId: string | null = null,
  database: CustomShellDb = db
): Promise<CarouselItem[]> {
  const rows = await database
    .select()
    .from(videoCarousels)
    .where(
      and(eq(videoCarousels.userId, userId), eq(videoCarousels.isTemplate, true))
    )
    .orderBy(
      ...(projectId ? [sql`${videoCarousels.carouselProjectId} = ${projectId} desc`] : []),
      desc(videoCarousels.updatedAt),
      desc(videoCarousels.id)
    )
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
 * A new carousel in `projectId` copied from a template: its slides, shape and
 * caption, with new ids so the two never share a layer, and the project's
 * caption footer added. The copy is not a template and was made from no
 * video project.
 */
export async function createCarouselFromTemplate(
  userId: string,
  projectId: string,
  templateId: string,
  name: string,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const [project, template] = await Promise.all([
    requireOwnedCarouselProject(userId, projectId, database),
    getOwnedCarousel(userId, templateId, database),
  ])
  if (!template.isTemplate) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  const row = await insertCarousel(database, {
    userId,
    project,
    name,
    format: requireCarouselFormat(template.format),
    slides: cloneSlides(template.slides),
    caption: template.caption,
    // The template's design stays; the project's footer is added.
    keepLook: true,
  })
  return serializeCarousel(row)
}

/** The carousels made from one of this person's video projects. */
export async function listCarouselsMadeFrom(
  userId: string,
  videoProjectId: string,
  database: CustomShellDb = db
): Promise<CarouselItem[]> {
  await getOwnedProject(userId, videoProjectId, database)
  const rows = await database
    .select()
    .from(videoCarousels)
    .where(
      and(
        eq(videoCarousels.userId, userId),
        eq(videoCarousels.projectId, videoProjectId)
      )
    )
    .orderBy(desc(videoCarousels.updatedAt), desc(videoCarousels.id))
  return rows.map(serializeCarousel)
}

/** A blank carousel in a carousel project, named and shaped in New carousel. */
export async function createOwnedCarousel(
  userId: string,
  projectId: string,
  name: string,
  format: CarouselFormat = "4:5",
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const project = await requireOwnedCarouselProject(userId, projectId, database)
  return serializeCarousel(await insertCarousel(database, { userId, project, name, format }))
}

/**
 * A carousel made from a video project's first frames, put in the carousel
 * project picked each time (part 24): one slide per frame, in the order they
 * were ticked, each picture filling its slide. A portrait frame on a square
 * slide loses its top and bottom, so the middle stays (Tyler's call,
 * 17 Oct 2026). It remembers the video project it was made from.
 */
export async function createCarouselFromFrames(
  userId: string,
  videoProjectId: string,
  /** One of the person's carousel projects, or the name of a new one. */
  into: { projectId: string } | { newProjectName: string },
  firstFrameIds: string[],
  format: CarouselFormat,
  database: CustomShellDb = db
): Promise<CarouselItem> {
  const [project, existing] = await Promise.all([
    getOwnedProject(userId, videoProjectId, database),
    "projectId" in into ? requireOwnedCarouselProject(userId, into.projectId, database) : null,
  ])
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
  const row = await database.transaction(async (tx) => {
    let carouselProject = existing
    if (!carouselProject) {
      const at = now()
      ;[carouselProject] = await tx
        .insert(videoCarouselProjects)
        .values({
          id: uuid(),
          userId,
          name: cleanProjectName("newProjectName" in into ? into.newProjectName : project.name),
          createdAt: at,
          updatedAt: at,
        })
        .returning()
    }
    return insertCarousel(tx, {
      userId,
      project: carouselProject,
      name: `${project.name} carousel`,
      format,
      slides,
      // Made from the video project, so its Carousels card lists it
      // (workspace/docs/carousel-projects.md).
      madeFrom: project.id,
    })
  })
  return serializeCarousel(row)
}

export function cloneSlides(value: unknown): CarouselSlide[] {
  return requireCanonicalCarouselSlides(value).map((slide) => ({
    ...slide,
    id: uuid(),
    items: slide.items.map((item) => ({ ...item, id: uuid() })),
  }))
}

/**
 * A copy of a carousel, in the same carousel project, just under it. Given
 * another shape, the copy is in that shape with its layers moved by
 * relayoutSlides and is named after the shape; the original is never changed
 * (workspace/docs/carousel-shapes.md).
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
  const project = await requireOwnedCarouselProject(userId, source.carouselProjectId, database)
  const row = await insertCarousel(database, {
    userId,
    project,
    name: format ? `${source.name} ${targetFormat}` : `${source.name} copy`,
    format: targetFormat,
    slides: relayoutSlides(cloneSlides(source.slides), sourceFormat, targetFormat),
    caption: source.caption,
    // A copy stays in the same projects, and is never a template itself.
    madeFrom: source.projectId,
    status: source.status,
    keepLook: true,
    keepCaption: true,
    // A moment before its original, so under "Last edited" it sits right under it.
    editedAt: new Date(source.updatedAt.getTime() - 1),
  })
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
    await touchCarouselProject(current.carouselProjectId, at, tx)
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
    .returning({ id: videoCarousels.id, projectId: videoCarousels.carouselProjectId })
  const at = now()
  for (const projectId of new Set(rows.map((row) => row.projectId))) {
    await touchCarouselProject(projectId, at, database)
  }
  return { deleted_ids: rows.map((row) => row.id) }
}

/** What deleting these carousels takes with it, counted for the delete window. */
export async function summarizeCarouselDelete(
  userId: string,
  carouselIds: string[],
  database: CustomShellDb = db
): Promise<{ carousels: number; exports: number }> {
  const ids = [...new Set(carouselIds)]
  if (!ids.length) return { carousels: 0, exports: 0 }
  const owned = and(eq(videoCarousels.userId, userId), inArray(videoCarousels.id, ids))
  const [[carousels], [exports]] = await Promise.all([
    database.select({ total: count() }).from(videoCarousels).where(owned),
    database
      .select({ total: count() })
      .from(videoRenderJobs)
      .innerJoin(videoCarousels, eq(videoCarousels.id, videoRenderJobs.carouselId))
      .where(owned),
  ])
  return { carousels: carousels?.total ?? 0, exports: exports?.total ?? 0 }
}

/** What a change to many carousels did: which changed, and which did not. */
export type CarouselBatchResult = { done_ids: string[]; skipped_ids: string[] }

async function updateOwnedCarousel(
  userId: string,
  carouselId: string,
  values: Partial<Pick<VideoCarouselRow, "status" | "pinnedAt">>,
  database: CustomShellDb
) {
  const [row] = await database
    .update(videoCarousels)
    .set(values)
    .where(and(eq(videoCarousels.id, carouselId), eq(videoCarousels.userId, userId)))
    .returning()
  if (!row) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  return serializeCarousel(row)
}

export async function setCarouselStatus(
  userId: string,
  carouselId: string,
  status: VideoStatus,
  database: CustomShellDb = db
) {
  return updateOwnedCarousel(userId, carouselId, { status }, database)
}

/** Pins a carousel to the top of the Carousels tab, or takes the pin off. */
export async function setCarouselPinned(
  userId: string,
  carouselId: string,
  pinned: boolean,
  database: CustomShellDb = db
) {
  return updateOwnedCarousel(userId, carouselId, { pinnedAt: pinned ? now() : null }, database)
}

/**
 * Archives carousels, or brings them back. Archiving takes the pin off, as it
 * does for projects. One not the caller's, or already there, is skipped.
 */
export async function setCarouselsArchived(
  userId: string,
  carouselIds: string[],
  archived: boolean,
  database: CustomShellDb = db
): Promise<CarouselBatchResult> {
  const ids = [...new Set(carouselIds)]
  if (!ids.length) return { done_ids: [], skipped_ids: [] }
  const rows = await database
    .update(videoCarousels)
    .set(archived ? { archivedAt: now(), pinnedAt: null } : { archivedAt: null })
    .where(
      and(
        eq(videoCarousels.userId, userId),
        inArray(videoCarousels.id, ids),
        archived ? isNull(videoCarousels.archivedAt) : isNotNull(videoCarousels.archivedAt)
      )
    )
    .returning({ id: videoCarousels.id })
  const done = rows.map((row) => row.id)
  return { done_ids: done, skipped_ids: ids.filter((id) => !done.includes(id)) }
}

/**
 * Moves carousels into another of the person's carousel projects. Their
 * history and exports go with them. The pictures they use stay on the old
 * project's shelf, and keep showing on their slides.
 */
export async function moveCarousels(
  userId: string,
  carouselIds: string[],
  targetProjectId: string,
  database: CustomShellDb = db
): Promise<CarouselBatchResult> {
  const ids = [...new Set(carouselIds)]
  if (!ids.length) return { done_ids: [], skipped_ids: [] }
  await requireOwnedCarouselProject(userId, targetProjectId, database)
  const moved = await database.transaction(async (tx) => {
    const rows = await tx
      .select({ id: videoCarousels.id, projectId: videoCarousels.carouselProjectId })
      .from(videoCarousels)
      .where(
        and(
          eq(videoCarousels.userId, userId),
          inArray(videoCarousels.id, ids),
          ne(videoCarousels.carouselProjectId, targetProjectId)
        )
      )
      .for("update")
    const movable = rows.map((row) => row.id)
    if (!movable.length) return []
    const at = now()
    await tx
      .update(videoCarousels)
      .set({ carouselProjectId: targetProjectId, updatedAt: at })
      .where(inArray(videoCarousels.id, movable))
    await tx
      .delete(videoCarouselProjectLastCarousels)
      .where(inArray(videoCarouselProjectLastCarousels.carouselId, movable))
    for (const projectId of new Set([targetProjectId, ...rows.map((row) => row.projectId)])) {
      await touchCarouselProject(projectId, at, tx)
    }
    return movable
  })
  return { done_ids: moved, skipped_ids: ids.filter((id) => !moved.includes(id)) }
}
