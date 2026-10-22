import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
import {
  getFromR2,
  r2ObjectExists,
  uploadToR2,
} from "@/server/media/storage"
import {
  loadSlidePictures,
  renderCarouselSlidePng,
} from "@/server/video/carousel-export"
import {
  carouselPdfPath,
  createSlidesPdf,
  slidePageJpeg,
} from "@/server/video/carousel-pdf"
import {
  loadSlideClips,
  renderVideoSlideMp4,
  slideVideo,
} from "@/server/video/carousel-video-slides"
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
 * A carousel export is made in one request and written ready, never queued,
 * so a failure is told to the person who pressed Export rather than left as
 * a failed row. Ten picture slides draw in a few seconds. Each video slide is
 * encoded by ffmpeg in turn, up to a minute of clip each, so a carousel of
 * many video slides can keep the request open for minutes and holds every
 * MP4 in memory until the ZIP is written.
 */

// Wide enough to stay sharp in the details window, small enough that the
// Exports list does not pull a full slide for a thumbnail.
const COVER_WIDTH = 360

/**
 * `slides/slide-01.png`, the name each slide has inside the ZIP, or `.mp4`
 * for a video slide.
 */
export function carouselSlideFileName(index: number, video = false) {
  return `slides/slide-${String(index + 1).padStart(2, "0")}.${video ? "mp4" : "png"}`
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

  const workDir = await mkdtemp(path.join(tmpdir(), "carousel-export-"))
  let files: { data: Uint8Array; video: boolean }[]
  let cover: Uint8Array
  let pdf: Uint8Array
  try {
    const media = await loadSlidePictures(userId, carousel.slides, database)
    // A clip is downloaded once and stands in as its first frame wherever a
    // still is drawn (workspace/docs/carousel-video-slides.md).
    const { clips, posters } = await loadSlideClips(
      userId,
      carousel.slides,
      workDir,
      database
    )
    for (const [mediaId, poster] of posters) media.set(mediaId, poster)
    const count = carousel.slides.length
    let stills: Uint8Array[]
    try {
      stills = carousel.slides.map((slide, index) =>
        renderCarouselSlidePng(slide, carousel.format, { index, count }, media)
      )
      cover = renderCarouselSlidePng(
        carousel.slides[0],
        carousel.format,
        { index: 0, count },
        media,
        COVER_WIDTH
      )
    } catch (error) {
      console.error("Carousel export failed", carouselId, error)
      throw new Error(CAROUSEL_EXPORT_FAILED_MESSAGE)
    }
    files = []
    for (const [index, slide] of carousel.slides.entries()) {
      const video = slideVideo(slide)
      const clip = video ? clips.get(video.mediaId) : undefined
      files.push(
        clip
          ? {
              data: await renderVideoSlideMp4({
                slide,
                format: carousel.format,
                place: { index, count },
                media,
                clip,
                workDir,
              }),
              video: true,
            }
          : { data: stills[index], video: false }
      )
    }
    pdf = createSlidesPdf(await Promise.all(stills.map(slidePageJpeg)))
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }

  const caption = carousel.caption.trim()
  const zip = createStoredZip([
    ...files.map((file, index) => ({
      name: carouselSlideFileName(index, file.video),
      data: file.data,
    })),
    {
      name: "caption.txt",
      data: new TextEncoder().encode(caption ? `${caption}\n` : ""),
    },
  ])
  const slideRanges: CarouselSlideRange[] = zip.entries
    .slice(0, files.length)
    .map(({ start, size }, index) =>
      files[index].video ? { start, size, type: "video" } : { start, size }
    )

  const id = uuid()
  const storagePath = `video/exports/${userId}/${id}.zip`
  const coverPath = `video/export-covers/${userId}/${id}.png`
  const size = CAROUSEL_FRAME_SIZES[carousel.format]
  const at = now()

  try {
    await uploadToR2(storagePath, zip.bytes, "application/zip")
    await uploadToR2(carouselPdfPath(storagePath), pdf, "application/pdf")
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
 * The kept carousel's PDF. One made before PDFs were kept with the ZIP is
 * built now from the ZIP's slides and kept for next time.
 */
export async function ensureCarouselExportPdf(
  storagePath: string,
  ranges: CarouselSlideRange[]
) {
  const pdfPath = carouselPdfPath(storagePath)
  if (await r2ObjectExists(pdfPath)) return pdfPath
  const pages = []
  for (let index = 0; index < ranges.length; index += 1) {
    const slide = await readCarouselExportSlide(storagePath, ranges, index)
    // Every export from before PDFs were kept is pictures only.
    if (!slide || ranges[index].type === "video") {
      throw new Error("The slides could not be read back for the PDF.")
    }
    pages.push(await slidePageJpeg(slide))
  }
  await uploadToR2(pdfPath, createSlidesPdf(pages), "application/pdf")
  return pdfPath
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
