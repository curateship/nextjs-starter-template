import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm"

import { carouselLookSchema, readCarouselLook, CAROUSEL_FOOTER_MAX, type CarouselLook } from "@/lib/video/carousel-look"
import {
  CAROUSEL_PROJECT_NOT_FOUND_MESSAGE,
} from "@/lib/video/carousel-projects"
import { type CarouselFormat } from "@/lib/video/carousel-schema"
import {
  cleanFolderName,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
} from "@/lib/video/project-folders"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { cleanProjectName } from "@/server/video/projects"
import {
  carouselThumbnail,
  cloneSlides,
  insertCarousel,
  requireOwnedCarouselProject,
} from "@/server/video/carousels"
import {
  videoCarouselProjectFolders,
  videoCarouselProjectMedia,
  videoCarouselProjects,
  videoCarousels,
  videoRenderJobs,
  type VideoCarouselProjectRow,
} from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"

/**
 * Carousel projects: each holds many carousels, and keeps what they share, the
 * picture shelf, the look a new carousel starts with and the caption footer
 * (`workspace/docs/carousel-project-carousels.md`). Built the way video
 * projects are (`projects.ts`); the carousels in one are in `carousels.ts`.
 */

/** A row of the carousel projects table. */
export type CarouselProjectItem = {
  id: string
  name: string
  /** Its carousels that are not archived. */
  carousel_count: number
  /** Their slides added together. */
  slide_count: number
  /** The shapes those carousels are in, most used first. */
  formats: CarouselFormat[]
  /** The first picture of its last edited carousel. */
  thumbnail_url: string | null
  look: CarouselLook
  caption_footer: string
  folder_id: string | null
  pinned: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export type CarouselProjectListResponse = {
  projects: CarouselProjectItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}


type Totals = { carousels: number; slides: number; formats: CarouselFormat[]; thumbnail: string | null }
const NO_CAROUSELS: Totals = { carousels: 0, slides: 0, formats: [], thumbnail: null }

/** The counts, shapes and picture of a page of projects, in two queries. */
async function totalsFor(rows: VideoCarouselProjectRow[], database: CustomShellDb) {
  const totals = new Map<string, Totals>()
  if (!rows.length) return totals
  const ids = rows.map((row) => row.id)
  const live = and(inArray(videoCarousels.carouselProjectId, ids), isNull(videoCarousels.archivedAt))
  const [grouped, latest] = await Promise.all([
    database
      .select({
        projectId: videoCarousels.carouselProjectId,
        format: videoCarousels.format,
        count: sql<number>`count(*)::int`,
        slides: sql<number>`coalesce(sum(jsonb_array_length(${videoCarousels.slides})), 0)::int`,
      })
      .from(videoCarousels)
      .where(live)
      .groupBy(videoCarousels.carouselProjectId, videoCarousels.format)
      .orderBy(desc(sql`3`)),
    database
      .selectDistinctOn([videoCarousels.carouselProjectId], {
        projectId: videoCarousels.carouselProjectId,
        slides: videoCarousels.slides,
      })
      .from(videoCarousels)
      .where(live)
      .orderBy(videoCarousels.carouselProjectId, desc(videoCarousels.updatedAt)),
  ])
  for (const row of grouped) {
    const total = totals.get(row.projectId) ?? { ...NO_CAROUSELS, formats: [] }
    total.carousels += row.count
    total.slides += row.slides
    total.formats.push(row.format as CarouselFormat)
    totals.set(row.projectId, total)
  }
  for (const row of latest) {
    const total = totals.get(row.projectId)
    if (total) total.thumbnail = carouselThumbnail(row.slides)
  }
  return totals
}

function serialize(row: VideoCarouselProjectRow, totals: Totals): CarouselProjectItem {
  return {
    id: row.id,
    name: row.name,
    carousel_count: totals.carousels,
    slide_count: totals.slides,
    formats: totals.formats,
    thumbnail_url: totals.thumbnail,
    look: readCarouselLook(row.look),
    caption_footer: row.captionFooter,
    folder_id: row.folderId,
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

async function serializeOne(row: VideoCarouselProjectRow, database: CustomShellDb) {
  const totals = await totalsFor([row], database)
  return serialize(row, totals.get(row.id) ?? NO_CAROUSELS)
}

export async function listOwnedCarouselProjects({
  userId,
  page = 1,
  pageSize = 24,
  search = "",
  folderId,
  archived = false,
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  /** Absent lists every project; null only those in no folder. */
  folderId?: string | null
  /** True lists only archived projects; the list leaves them out otherwise. */
  archived?: boolean
  database?: CustomShellDb
}): Promise<CarouselProjectListResponse> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
  const filters: SQL[] = [
    eq(videoCarouselProjects.userId, userId),
    archived ? isNotNull(videoCarouselProjects.archivedAt) : isNull(videoCarouselProjects.archivedAt),
  ]
  const cleanedSearch = search.trim()
  if (cleanedSearch) {
    filters.push(
      ilike(videoCarouselProjects.name, `%${cleanedSearch.replace(/([\\%_])/g, "\\$1")}%`)
    )
  }
  if (folderId !== undefined) {
    filters.push(
      folderId === null
        ? isNull(videoCarouselProjects.folderId)
        : eq(videoCarouselProjects.folderId, folderId)
    )
  }
  const where = and(...filters)
  const [rows, [totals]] = await Promise.all([
    database
      .select()
      .from(videoCarouselProjects)
      .where(where)
      // Pinned projects first, so a page never leaves one out.
      .orderBy(
        sql`${videoCarouselProjects.pinnedAt} is null`,
        desc(videoCarouselProjects.updatedAt),
        desc(videoCarouselProjects.id)
      )
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: count() }).from(videoCarouselProjects).where(where),
  ])
  const counted = await totalsFor(rows, database)
  const total = totals?.total ?? 0
  return {
    projects: rows.map((row) => serialize(row, counted.get(row.id) ?? NO_CAROUSELS)),
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: Math.max(1, Math.ceil(total / safePageSize)),
  }
}

export async function getOwnedCarouselProjectItem(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  return serializeOne(await requireOwnedCarouselProject(userId, projectId, database), database)
}

/**
 * A new carousel project with its first carousel, named after the project, as
 * a new video project gets its first video. `folderId` files it straight away.
 */
export async function createOwnedCarouselProject(
  userId: string,
  name: string,
  folderId: string | null = null,
  database: CustomShellDb = db
): Promise<{ project: CarouselProjectItem; carousel: string }> {
  const cleaned = cleanProjectName(name)
  if (folderId) await requireOwnedCarouselFolder(userId, folderId, database)
  const at = now()
  const made = await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(videoCarouselProjects)
      .values({ id: uuid(), userId, name: cleaned, folderId, createdAt: at, updatedAt: at })
      .returning()
    const carousel = await insertCarousel(tx, { userId, project: row, name: cleaned })
    return { row, carousel: carousel.id }
  })
  return { project: await serializeOne(made.row, database), carousel: made.carousel }
}

/**
 * A copy of a whole carousel project, in the same folder: its look, footer,
 * picture shelf and every carousel with new ids. History and exports stay
 * with the original.
 */
export async function duplicateOwnedCarouselProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<CarouselProjectItem> {
  const source = await requireOwnedCarouselProject(userId, projectId, database)
  const at = now()
  const row = await database.transaction(async (tx) => {
    const [copy] = await tx
      .insert(videoCarouselProjects)
      .values({
        id: uuid(),
        userId,
        name: cleanProjectName(`${source.name} copy`),
        look: source.look,
        captionFooter: source.captionFooter,
        folderId: source.folderId,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    const carousels = await tx
      .select()
      .from(videoCarousels)
      .where(eq(videoCarousels.carouselProjectId, source.id))
    if (carousels.length) {
      await tx.insert(videoCarousels).values(
        carousels.map((carousel) => ({
          ...carousel,
          id: uuid(),
          carouselProjectId: copy.id,
          slides: cloneSlides(carousel.slides),
          version: 1,
          createdAt: at,
          updatedAt: carousel.updatedAt,
        }))
      )
    }
    const shelf = await tx
      .select()
      .from(videoCarouselProjectMedia)
      .where(eq(videoCarouselProjectMedia.projectId, source.id))
    if (shelf.length) {
      await tx
        .insert(videoCarouselProjectMedia)
        .values(shelf.map((item) => ({ ...item, projectId: copy.id })))
    }
    return copy
  })
  return serializeOne(row, database)
}

/**
 * Carousel project settings: the name, the look a new carousel starts with
 * and the caption footer, saved together. None of them changes a carousel
 * already made.
 */
export async function saveCarouselProjectSettings(
  userId: string,
  projectId: string,
  settings: { name: string; look: CarouselLook; captionFooter: string },
  database: CustomShellDb = db
): Promise<CarouselProjectItem> {
  const [row] = await database
    .update(videoCarouselProjects)
    .set({
      name: cleanProjectName(settings.name),
      look: carouselLookSchema.parse(settings.look),
      captionFooter: settings.captionFooter.trim().slice(0, CAROUSEL_FOOTER_MAX),
      updatedAt: now(),
    })
    .where(and(eq(videoCarouselProjects.id, projectId), eq(videoCarouselProjects.userId, userId)))
    .returning()
  if (!row) throw new Error(CAROUSEL_PROJECT_NOT_FOUND_MESSAGE)
  return serializeOne(row, database)
}

/**
 * Archives carousel projects, or brings them back. Archiving takes the pin
 * off. One not the caller's, or already there, comes back in `skipped_ids`.
 */
export async function setCarouselProjectsArchived(
  userId: string,
  projectIds: string[],
  archived: boolean,
  database: CustomShellDb = db
): Promise<{ done_ids: string[]; skipped_ids: string[] }> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) return { done_ids: [], skipped_ids: [] }
  const rows = await database
    .update(videoCarouselProjects)
    .set(archived ? { archivedAt: now(), pinnedAt: null } : { archivedAt: null })
    .where(
      and(
        eq(videoCarouselProjects.userId, userId),
        inArray(videoCarouselProjects.id, ids),
        archived ? isNull(videoCarouselProjects.archivedAt) : isNotNull(videoCarouselProjects.archivedAt)
      )
    )
    .returning({ id: videoCarouselProjects.id })
  const done = rows.map((row) => row.id)
  return { done_ids: done, skipped_ids: ids.filter((id) => !done.includes(id)) }
}

export async function setCarouselProjectPinned(
  userId: string,
  projectId: string,
  pinned: boolean,
  database: CustomShellDb = db
): Promise<CarouselProjectItem> {
  const [row] = await database
    .update(videoCarouselProjects)
    .set({ pinnedAt: pinned ? now() : null })
    .where(and(eq(videoCarouselProjects.id, projectId), eq(videoCarouselProjects.userId, userId)))
    .returning()
  if (!row) throw new Error(CAROUSEL_PROJECT_NOT_FOUND_MESSAGE)
  return serializeOne(row, database)
}

/** What deleting these carousel projects takes, counted for the delete window. */
export async function summarizeCarouselProjectDelete(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db
): Promise<{ carousels: number; exports: number }> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) return { carousels: 0, exports: 0 }
  const owned = and(eq(videoCarouselProjects.userId, userId), inArray(videoCarouselProjects.id, ids))
  const [[carousels], [exports]] = await Promise.all([
    database
      .select({ total: count() })
      .from(videoCarousels)
      .innerJoin(videoCarouselProjects, eq(videoCarouselProjects.id, videoCarousels.carouselProjectId))
      .where(owned),
    database
      .select({ total: count() })
      .from(videoRenderJobs)
      .innerJoin(videoCarousels, eq(videoCarousels.id, videoRenderJobs.carouselId))
      .innerJoin(videoCarouselProjects, eq(videoCarouselProjects.id, videoCarousels.carouselProjectId))
      .where(owned),
  ])
  return { carousels: carousels?.total ?? 0, exports: exports?.total ?? 0 }
}

/**
 * Deletes carousel projects with every carousel in them. Their kept exports
 * stay on the Exports page, as they do when one carousel is deleted, and the
 * pictures stay in the media library.
 */
export async function deleteOwnedCarouselProjects(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db
): Promise<{ deleted_ids: string[] }> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) return { deleted_ids: [] }
  const rows = await database
    .delete(videoCarouselProjects)
    .where(and(eq(videoCarouselProjects.userId, userId), inArray(videoCarouselProjects.id, ids)))
    .returning({ id: videoCarouselProjects.id })
  return { deleted_ids: rows.map((row) => row.id) }
}

// ------------------------------------------------------------ Folders ----

export type CarouselFolderSummary = { id: string; name: string; project_count: number }

export async function listCarouselFolders(
  userId: string,
  database: CustomShellDb = db
): Promise<CarouselFolderSummary[]> {
  const rows = await database
    .select({
      id: videoCarouselProjectFolders.id,
      name: videoCarouselProjectFolders.name,
      projects: count(videoCarouselProjects.id),
    })
    .from(videoCarouselProjectFolders)
    .leftJoin(videoCarouselProjects, eq(videoCarouselProjects.folderId, videoCarouselProjectFolders.id))
    .where(eq(videoCarouselProjectFolders.userId, userId))
    .groupBy(videoCarouselProjectFolders.id)
    .orderBy(sql`lower(${videoCarouselProjectFolders.name})`)
  return rows.map((row) => ({ id: row.id, name: row.name, project_count: row.projects }))
}

async function requireOwnedCarouselFolder(userId: string, folderId: string, database: CustomShellDb) {
  const [row] = await database
    .select({ id: videoCarouselProjectFolders.id })
    .from(videoCarouselProjectFolders)
    .where(and(eq(videoCarouselProjectFolders.id, folderId), eq(videoCarouselProjectFolders.userId, userId)))
    .limit(1)
  if (!row) throw new Error(FOLDER_NOT_FOUND_MESSAGE)
  return row
}

/** Folder names follow the video projects' rules, so the dropdowns agree. */
async function namedFolderWrite<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(FOLDER_NAME_TAKEN_MESSAGE)
    throw error
  }
}

export async function createCarouselFolder(userId: string, value: string, database: CustomShellDb = db) {
  const name = cleanFolderName(value)
  const at = now()
  const row = { id: uuid(), userId, name, createdAt: at, updatedAt: at }
  await namedFolderWrite(() => database.insert(videoCarouselProjectFolders).values(row))
  return { id: row.id, name, project_count: 0 }
}

export async function renameCarouselFolder(
  userId: string,
  folderId: string,
  value: string,
  database: CustomShellDb = db
) {
  const name = cleanFolderName(value)
  const renamed = await namedFolderWrite(() =>
    database
      .update(videoCarouselProjectFolders)
      .set({ name, updatedAt: now() })
      .where(and(eq(videoCarouselProjectFolders.id, folderId), eq(videoCarouselProjectFolders.userId, userId)))
      .returning({ id: videoCarouselProjectFolders.id })
  )
  if (!renamed.length) throw new Error(FOLDER_NOT_FOUND_MESSAGE)
  return { id: folderId, name }
}

/** Deletes only the folder; its projects stay, in no folder. */
export async function deleteCarouselFolder(userId: string, folderId: string, database: CustomShellDb = db) {
  return database.transaction(async (tx) => {
    await requireOwnedCarouselFolder(userId, folderId, tx)
    const [held] = await tx
      .select({ total: count() })
      .from(videoCarouselProjects)
      .where(eq(videoCarouselProjects.folderId, folderId))
    await tx.delete(videoCarouselProjectFolders).where(eq(videoCarouselProjectFolders.id, folderId))
    return { loose_count: held?.total ?? 0 }
  })
}

/**
 * Puts carousel projects into one folder, or into none when `folderId` is
 * null. Says which moved, which were there already and which are not this
 * person's.
 */
export async function moveCarouselProjectsToFolder(
  userId: string,
  projectIds: string[],
  folderId: string | null,
  database: CustomShellDb = db
) {
  const wanted = [...new Set(projectIds)]
  if (folderId) await requireOwnedCarouselFolder(userId, folderId, database)
  const owned = wanted.length
    ? await database
        .select({ id: videoCarouselProjects.id, folderId: videoCarouselProjects.folderId })
        .from(videoCarouselProjects)
        .where(and(eq(videoCarouselProjects.userId, userId), inArray(videoCarouselProjects.id, wanted)))
    : []
  const moving = owned.filter((row) => row.folderId !== folderId).map((row) => row.id)
  if (moving.length) {
    await database
      .update(videoCarouselProjects)
      .set({ folderId })
      .where(inArray(videoCarouselProjects.id, moving))
  }
  const ownedIds = new Set(owned.map((row) => row.id))
  return {
    moved_ids: moving,
    unchanged_ids: owned.filter((row) => row.folderId === folderId).map((row) => row.id),
    skipped_ids: wanted.filter((id) => !ownedIds.has(id)),
  }
}
