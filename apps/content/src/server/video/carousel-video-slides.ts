import { spawn } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { eq } from "drizzle-orm"

import { CAROUSEL_FRAME_SIZES } from "@/lib/video/carousel-layout"
import {
  CAROUSEL_MEDIA_MISSING_MESSAGE,
  CAROUSEL_VIDEO_FAILED_MESSAGE,
  type CarouselFormat,
  type CarouselMediaItem,
  type CarouselSlide,
} from "@/lib/video/carousel-schema"
import { db, type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import {
  pictureRect,
  renderCarouselSlidePng,
  type SlidePicture,
  type SlidePlace,
} from "@/server/video/carousel-export"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { downloadToFile } from "@/server/video/storage-files"

/**
 * Video slides in a carousel export (workspace/docs/carousel-video-slides.md).
 * A slide holding a clip is exported as an MP4: the clip, cropped or fitted
 * to its box, with the layers under it drawn first and the layers over it
 * drawn on top, for as long as the clip runs, up to a minute. The clip's
 * first frame stands in for it wherever a still is needed: the slide's
 * thumbnail, the cover and the PDF.
 */

/** Instagram plays a carousel video for at most a minute. */
export const CAROUSEL_VIDEO_MAX_SECONDS = 60

const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"])

/** A slide's clip, on disk and measured. */
export type SlideClip = {
  file: string
  width: number
  height: number
  seconds: number
  hasSound: boolean
}

/** The clip on a slide, or null. A hidden clip does not count. */
export function slideVideo(slide: CarouselSlide) {
  return (
    slide.items.find(
      (item): item is CarouselMediaItem => item.type === "video" && !item.hidden
    ) ?? null
  )
}

/**
 * Every clip the slides show, downloaded into `workDir` and measured, and
 * its first frame as a picture the slide drawing can hold. A clip that is
 * gone, or not this person's, fails the whole export.
 */
export async function loadSlideClips(
  userId: string,
  slides: CarouselSlide[],
  workDir: string,
  database: CustomShellDb = db
) {
  const clips = new Map<string, SlideClip>()
  const posters = new Map<string, SlidePicture>()
  for (const slide of slides) {
    const item = slideVideo(slide)
    if (!item || clips.has(item.mediaId)) continue
    const [row] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, item.mediaId))
      .limit(1)
    if (!row || row.userId !== userId || !VIDEO_TYPES.has(row.mimeType)) {
      throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
    }
    const file = path.join(workDir, `clip-${clips.size}`)
    try {
      await downloadToFile(row.storagePath, file)
    } catch {
      throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
    }
    const clip = await probeClip(file)
    const posterFile = path.join(workDir, `poster-${clips.size}.png`)
    await runFfmpeg(
      [
        "-ss",
        String(Math.min(0.1, clip.seconds / 2)),
        "-i",
        file,
        "-frames:v",
        "1",
        posterFile,
      ],
      CAROUSEL_VIDEO_FAILED_MESSAGE
    )
    const poster = await readFile(posterFile)
    clips.set(item.mediaId, clip)
    posters.set(item.mediaId, {
      href: `data:image/png;base64,${poster.toString("base64")}`,
      width: clip.width,
      height: clip.height,
    })
  }
  return { clips, posters }
}

/**
 * One video slide as an MP4 at full size: the layers under the clip as one
 * still, the clip in its box, then the layers over it as a second still.
 */
export async function renderVideoSlideMp4({
  slide,
  format,
  place,
  media,
  clip,
  workDir,
}: {
  slide: CarouselSlide
  format: CarouselFormat
  place: SlidePlace
  media: ReadonlyMap<string, SlidePicture>
  clip: SlideClip
  workDir: string
}) {
  const video = slideVideo(slide)
  if (!video) throw new Error(CAROUSEL_VIDEO_FAILED_MESSAGE)
  const size = CAROUSEL_FRAME_SIZES[format]
  // The same order the slide drawing uses: by height, ties as saved.
  const order = slide.items
    .filter((item) => !item.hidden)
    .sort((left, right) => left.zIndex - right.zIndex)
  const at = order.findIndex((item) => item.id === video.id)
  const under = new Set(order.slice(0, at).map((item) => item.id))
  const over = new Set(order.slice(at + 1).map((item) => item.id))

  const tag = `slide-${place.index}`
  const underFile = path.join(workDir, `${tag}-under.png`)
  const overFile = path.join(workDir, `${tag}-over.png`)
  await writeFile(
    underFile,
    renderCarouselSlidePng(slide, format, place, media, undefined, {
      keep: (item) => under.has(item.id),
      background: true,
    })
  )
  await writeFile(
    overFile,
    renderCarouselSlidePng(slide, format, place, media, undefined, {
      keep: (item) => over.has(item.id),
      background: false,
    })
  )

  const box = {
    x: video.x * size.width,
    y: video.y * size.height,
    width: video.width * size.width,
    height: video.height * size.height,
  }
  const placement = clipPlacement(video, box, clip)
  const seconds = Math.min(clip.seconds, CAROUSEL_VIDEO_MAX_SECONDS)
  const outFile = path.join(workDir, `${tag}.mp4`)
  await runFfmpeg(
    [
      "-loop",
      "1",
      "-i",
      underFile,
      "-i",
      clip.file,
      "-loop",
      "1",
      "-i",
      overFile,
      "-filter_complex",
      [
        `[1:v]scale=${placement.scaleWidth}:${placement.scaleHeight},setsar=1,crop=${placement.cropWidth}:${placement.cropHeight}:${placement.cropX}:${placement.cropY}[clip]`,
        `[0:v][clip]overlay=${placement.x}:${placement.y}:shortest=1[under]`,
        "[under][2:v]overlay=0:0:shortest=1,format=yuv420p[out]",
      ].join(";"),
      "-map",
      "[out]",
      ...(clip.hasSound ? ["-map", "1:a:0", "-c:a", "aac", "-b:a", "128k"] : []),
      "-t",
      String(seconds),
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-movflags",
      "+faststart",
      outFile,
    ],
    CAROUSEL_VIDEO_FAILED_MESSAGE
  )
  return new Uint8Array(await readFile(outFile))
}

/**
 * Where the clip goes, in whole pixels: scaled the way Fill, Crop or Fit
 * draws a picture, then cut to the part inside its box.
 */
export function clipPlacement(
  item: Pick<CarouselMediaItem, "fit" | "focusX" | "focusY">,
  box: { x: number; y: number; width: number; height: number },
  clip: { width: number; height: number }
) {
  const drawn = pictureRect(item, box, clip)
  // Even sizes, which the video encoder needs.
  const scaleWidth = Math.max(2, Math.round(drawn.width / 2) * 2)
  const scaleHeight = Math.max(2, Math.round(drawn.height / 2) * 2)
  const left = Math.max(drawn.x, box.x)
  const top = Math.max(drawn.y, box.y)
  const right = Math.min(drawn.x + drawn.width, box.x + box.width)
  const bottom = Math.min(drawn.y + drawn.height, box.y + box.height)
  const cropX = Math.max(0, Math.round(left - drawn.x))
  const cropY = Math.max(0, Math.round(top - drawn.y))
  return {
    scaleWidth,
    scaleHeight,
    cropX,
    cropY,
    cropWidth: Math.max(
      2,
      Math.min(scaleWidth - cropX, Math.round((right - left) / 2) * 2)
    ),
    cropHeight: Math.max(
      2,
      Math.min(scaleHeight - cropY, Math.round((bottom - top) / 2) * 2)
    ),
    x: Math.round(left),
    y: Math.round(top),
  }
}

/** The clip's size, length and whether it has sound, from ffprobe. */
async function probeClip(file: string): Promise<SlideClip> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height:stream_side_data=rotation:stream_tags=rotate:format=duration",
        "-of",
        "json",
        file,
      ],
      { timeout: 30_000 }
    )
    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.on("error", () => reject(new Error(CAROUSEL_VIDEO_FAILED_MESSAGE)))
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(CAROUSEL_VIDEO_FAILED_MESSAGE))
    )
  })
  const parsed = JSON.parse(output) as {
    streams?: {
      codec_type?: string
      width?: number
      height?: number
      side_data_list?: { rotation?: number }[]
      tags?: { rotate?: string }
    }[]
    format?: { duration?: string }
  }
  const picture = parsed.streams?.find((stream) => stream.codec_type === "video")
  const seconds = Number(parsed.format?.duration)
  if (!picture?.width || !picture.height || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(CAROUSEL_VIDEO_FAILED_MESSAGE)
  }
  // A phone clip is often stored on its side with a note to turn it. ffmpeg
  // turns it as it reads, so its size is the turned one.
  const rotation = Math.abs(
    Number(
      picture.side_data_list?.find((data) => data.rotation !== undefined)
        ?.rotation ??
        picture.tags?.rotate ??
        0
    )
  )
  const turned = rotation % 180 === 90
  return {
    file,
    width: turned ? picture.height : picture.width,
    height: turned ? picture.width : picture.height,
    seconds,
    hasSound: Boolean(
      parsed.streams?.some((stream) => stream.codec_type === "audio")
    ),
  }
}
