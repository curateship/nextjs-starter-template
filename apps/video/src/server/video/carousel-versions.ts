import { and, desc, eq, max, notInArray } from "drizzle-orm"

import {
  CAROUSEL_NOT_FOUND_MESSAGE,
  carouselSlidesSchema,
  requireCarouselFormat,
  type CarouselFormat,
  type CarouselSlide,
} from "@/lib/video/carousel-schema"
import {
  BREAK_MS,
  HOURLY_MS,
  KEEP_VERSIONS,
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
  type VersionReason,
} from "@/lib/video/project-versions"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  videoCarousels,
  videoCarouselVersions,
  type VideoCarouselRow,
} from "@/server/video/schema"

/**
 * A carousel's history: earlier slides kept by the save that replaces them,
 * by the same rule as a project's (workspace/docs/carousel-history.md,
 * workspace/docs/project-history.md). After a break of 30 minutes, every hour
 * of editing, and before a restore; the newest 20; never the same slides
 * twice.
 */

/** One row of the Earlier versions list, with its slides to look at. */
export type CarouselVersionItem = {
  id: string
  reason: VersionReason
  format: CarouselFormat
  slide_count: number
  saved_at: string
  slides: CarouselSlide[]
  caption: string
}

type CarouselBeingSaved = Pick<
  VideoCarouselRow,
  "id" | "userId" | "createdAt" | "updatedAt" | "slides" | "format" | "caption"
>

/** When this carousel last had a version kept, or null. */
export async function lastKeptAt(database: CustomShellDb, carouselId: string) {
  const [row] = await database
    .select({ at: max(videoCarouselVersions.createdAt) })
    .from(videoCarouselVersions)
    .where(eq(videoCarouselVersions.carouselId, carouselId))
  return row?.at ?? null
}

/**
 * Why the slides a save is about to replace should be kept, or null: last
 * saved `BREAK_MS` ago or more, or the newest version `HOURLY_MS` old or more,
 * counting from when the carousel was made when it has none.
 */
export function carouselVersionDue(
  carousel: Pick<CarouselBeingSaved, "createdAt" | "updatedAt">,
  keptAt: Date | null,
  at: Date
): VersionReason | null {
  if (keptAt && keptAt > carousel.updatedAt) return null
  if (at.getTime() - carousel.updatedAt.getTime() >= BREAK_MS) return "break"
  const since = keptAt ?? carousel.createdAt
  return at.getTime() - since.getTime() >= HOURLY_MS ? "hourly" : null
}

function contentOf(slides: unknown, format: string, caption: string) {
  return JSON.stringify({ slides, format, caption })
}

/**
 * Keeps the carousel as it stands, unless a version already holds the same
 * slides, shape and caption, then deletes any past the newest
 * `KEEP_VERSIONS`. It runs in a savepoint, so a version that fails to keep is
 * logged and the save still lands, except before a restore, where it must.
 */
export async function keepCarouselVersion(
  database: CustomShellDb,
  carousel: CarouselBeingSaved,
  reason: VersionReason,
  at: Date
) {
  const keep = async (tx: CustomShellDb) => {
    const content = contentOf(carousel.slides, carousel.format, carousel.caption)
    const kept = await tx
      .select({
        slides: videoCarouselVersions.slides,
        format: videoCarouselVersions.format,
        caption: videoCarouselVersions.caption,
      })
      .from(videoCarouselVersions)
      .where(eq(videoCarouselVersions.carouselId, carousel.id))
    if (
      kept.some((row) => contentOf(row.slides, row.format, row.caption) === content)
    ) {
      return
    }
    const slides = carouselSlidesSchema.safeParse(carousel.slides)
    if (!slides.success) return
    await tx.insert(videoCarouselVersions).values({
      id: uuid(),
      carouselId: carousel.id,
      userId: carousel.userId,
      reason,
      slides: slides.data,
      format: carousel.format,
      caption: carousel.caption,
      slideCount: slides.data.length,
      savedAt: carousel.updatedAt,
      createdAt: at,
    })
    const newest = tx
      .select({ id: videoCarouselVersions.id })
      .from(videoCarouselVersions)
      .where(eq(videoCarouselVersions.carouselId, carousel.id))
      .orderBy(desc(videoCarouselVersions.createdAt))
      .limit(KEEP_VERSIONS)
    await tx
      .delete(videoCarouselVersions)
      .where(
        and(
          eq(videoCarouselVersions.carouselId, carousel.id),
          notInArray(videoCarouselVersions.id, newest)
        )
      )
  }
  if (reason === "restore") return keep(database)
  try {
    await database.transaction(keep)
  } catch (error) {
    console.error("Keeping a carousel version failed", carousel.id, error)
  }
}

/** The carousel's versions, newest first. Somebody else's lists none. */
export async function listOwnedCarouselVersions(
  userId: string,
  carouselId: string,
  database: CustomShellDb = db
): Promise<CarouselVersionItem[]> {
  const rows = await database
    .select({ version: videoCarouselVersions })
    .from(videoCarouselVersions)
    .innerJoin(videoCarousels, eq(videoCarousels.id, videoCarouselVersions.carouselId))
    .where(
      and(
        eq(videoCarouselVersions.carouselId, carouselId),
        eq(videoCarousels.userId, userId)
      )
    )
    .orderBy(desc(videoCarouselVersions.createdAt))
  return rows.flatMap(({ version }) => {
    const slides = carouselSlidesSchema.safeParse(version.slides)
    if (!slides.success) return []
    return [
      {
        id: version.id,
        reason: version.reason as VersionReason,
        format: requireCarouselFormat(version.format),
        slide_count: version.slideCount,
        saved_at: version.savedAt.toISOString(),
        slides: slides.data,
        caption: version.caption,
      },
    ]
  })
}

/**
 * Puts a version back: what the carousel holds now is kept first as "Before
 * restoring", so the restore can be undone the same way, then the version's
 * slides, shape and caption are saved over it as the next version number.
 */
export async function restoreOwnedCarouselVersion(
  userId: string,
  carouselId: string,
  versionId: string,
  database: CustomShellDb = db
) {
  return database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(videoCarousels)
      .where(and(eq(videoCarousels.id, carouselId), eq(videoCarousels.userId, userId)))
      .for("update")
    if (!current) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
    const [version] = await tx
      .select()
      .from(videoCarouselVersions)
      .where(
        and(
          eq(videoCarouselVersions.id, versionId),
          eq(videoCarouselVersions.carouselId, carouselId)
        )
      )
      .limit(1)
    if (!version) throw new Error(VERSION_NOT_FOUND_MESSAGE)
    const slides = carouselSlidesSchema.safeParse(version.slides)
    if (!slides.success) throw new Error(VERSION_UNREADABLE_MESSAGE)
    const at = now()
    await keepCarouselVersion(tx, current, "restore", at)
    const [row] = await tx
      .update(videoCarousels)
      .set({
        slides: slides.data,
        format: requireCarouselFormat(version.format),
        caption: version.caption,
        version: current.version + 1,
        updatedAt: at,
      })
      .where(eq(videoCarousels.id, carouselId))
      .returning({ version: videoCarousels.version })
    return { version: row.version }
  })
}
