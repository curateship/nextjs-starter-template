import { CAROUSEL_FRAME_SIZES } from "@/lib/video/carousel-layout"
import {
  CAROUSEL_EMPTY_EXPORT_MESSAGE,
  CAROUSEL_EXPORT_FAILED_MESSAGE,
  CAROUSEL_KEEP_FAILED_MESSAGE,
} from "@/lib/video/carousel-schema"
import { EXPORT_TITLE_MAX } from "@/lib/video/render"
import { createStoredZip } from "@/lib/video/stored-zip"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getFromR2, uploadToR2 } from "@/server/media/storage"
import {
  loadSlidePictures,
  renderCarouselSlidePng,
} from "@/server/video/carousel-export"
import { getOwnedCarouselDetail } from "@/server/video/carousels"
import { removeExportFiles } from "@/server/video/export-files"
import {
  serializeRenderJob,
  type RenderJobSummary,
} from "@/server/video/render-queue"
import {
  videoRenderJobs,
  type CarouselSlideRange,
} from "@/server/video/schema"

/**
 * Keeping a carousel export: the ZIP Export downloads, built here and kept in
 * storage, plus a row in `video_render_jobs` of kind `carousel`. From then on
 * it is an export like any other: listed on the Exports page, downloaded
 * again, shared by link, deleted and cleared out by the same code that handles
 * video exports.
 *
 * A carousel export is made in one request and written ready, never queued.
 * Ten slides draw in a few seconds, so there is nothing to wait in line for,
 * and a failure is told to the person who pressed Export rather than left as
 * a failed row.
 */

// Wide enough to stay sharp in the details window, small enough that the
// Exports list does not pull a full slide for a thumbnail.
const COVER_WIDTH = 360

/** `slides/slide-01.png`, the name each slide has inside the ZIP. */
export function carouselSlideFileName(index: number) {
  return `slides/slide-${String(index + 1).padStart(2, "0")}.png`
}

export async function keepCarouselExport({
  userId,
  carouselId,
  database = db,
}: {
  userId: string
  carouselId: string
  database?: CustomShellDb
}): Promise<RenderJobSummary> {
  // The saved carousel, so the ZIP holds what the editor last saved, in its
  // saved slide order.
  const carousel = await getOwnedCarouselDetail(userId, carouselId, database)
  if (!carousel.slides.length) throw new Error(CAROUSEL_EMPTY_EXPORT_MESSAGE)

  const media = await loadSlidePictures(userId, carousel.slides, database)
  let slides: Uint8Array[]
  let cover: Uint8Array
  try {
    slides = carousel.slides.map((slide) =>
      renderCarouselSlidePng(slide, carousel.format, media)
    )
    cover = renderCarouselSlidePng(
      carousel.slides[0],
      carousel.format,
      media,
      COVER_WIDTH
    )
  } catch (error) {
    console.error("Carousel export failed", carouselId, error)
    throw new Error(CAROUSEL_EXPORT_FAILED_MESSAGE)
  }

  const caption = carousel.caption.trim()
  const zip = createStoredZip([
    ...slides.map((data, index) => ({
      name: carouselSlideFileName(index),
      data,
    })),
    {
      name: "caption.txt",
      data: new TextEncoder().encode(caption ? `${caption}\n` : ""),
    },
  ])
  const slideRanges: CarouselSlideRange[] = zip.entries
    .slice(0, slides.length)
    .map(({ start, size }) => ({ start, size }))

  const id = uuid()
  const storagePath = `video/exports/${userId}/${id}.zip`
  const coverPath = `video/export-covers/${userId}/${id}.png`
  const size = CAROUSEL_FRAME_SIZES[carousel.format]
  const at = now()

  try {
    await uploadToR2(storagePath, zip.bytes, "application/zip")
    await uploadToR2(coverPath, cover, "image/png")
    const [row] = await database
      .insert(videoRenderJobs)
      .values({
        id,
        userId,
        kind: "carousel",
        projectId: null,
        carouselId: carousel.id,
        caption,
        slideRanges,
        status: "ready",
        quality: "high",
        aspect: carousel.format,
        storagePath,
        fileSize: zip.bytes.byteLength,
        thumbnailStoragePath: coverPath,
        width: size.width,
        height: size.height,
        title: carousel.name.trim().slice(0, EXPORT_TITLE_MAX) || null,
        createdAt: at,
        updatedAt: at,
        startedAt: at,
        finishedAt: at,
      })
      .returning()
    return serializeRenderJob(row, null, carousel.name)
  } catch (error) {
    console.error("Keeping a carousel export failed", carouselId, error)
    // Whatever reached storage goes again, so a failed keep leaves no file
    // that no row points at. Removing a file that never arrived succeeds.
    await removeExportFiles([
      { id, storagePath, thumbnailStoragePath: coverPath },
    ])
    throw new Error(CAROUSEL_KEEP_FAILED_MESSAGE)
  }
}

/**
 * One slide's PNG, read out of a kept carousel ZIP by its byte range. Null
 * when the export has no such slide.
 */
export async function readCarouselExportSlide(
  storagePath: string,
  ranges: CarouselSlideRange[],
  index: number
) {
  const range = Number.isInteger(index) ? ranges[index] : undefined
  if (!range) return null
  const object = await getFromR2(
    storagePath,
    `bytes=${range.start}-${range.start + range.size - 1}`
  )
  const bytes = await object.Body?.transformToByteArray()
  if (!bytes || bytes.byteLength !== range.size) {
    throw new Error("The stored slide was not the size the export recorded.")
  }
  // A copy on a plain buffer, which is what a response body takes.
  return new Uint8Array(bytes)
}
