import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { and, eq } from "drizzle-orm"
import sharp from "sharp"

import { planMusicClips } from "@/lib/video/background-music"
import { CAROUSEL_FRAME_SIZES } from "@/lib/video/carousel-layout"
import {
  CAROUSEL_EMPTY_EXPORT_MESSAGE,
  CAROUSEL_VIDEO_FAILED_MESSAGE,
  CAROUSEL_VIDEO_MUSIC_MISSING_MESSAGE,
  CAROUSEL_VIDEO_SECONDS,
  type CarouselFormat,
  type CarouselVideoTransition,
} from "@/lib/video/carousel-schema"
import { DEFAULT_TRANSITION_MS } from "@/lib/video/clip-transitions"
import { DEFAULT_FRAME_RATE } from "@/lib/video/render"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { editorId } from "@/lib/video/timeline-utils"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import {
  discardGeneratedAsset,
  saveGeneratedAsset,
} from "@/server/video/asset-factories/media"
import {
  loadSlidePictures,
  renderCarouselSlidePng,
} from "@/server/video/carousel-export"
import {
  CAROUSEL_VIDEO_MAX_SECONDS,
  loadSlideClips,
  renderVideoSlideMp4,
  slideVideo,
} from "@/server/video/carousel-video-slides"
import { getOwnedCarouselDetail } from "@/server/video/carousels"
import { runFfmpeg } from "@/server/video/ffmpeg"
import {
  createOwnedProject,
  deleteOwnedProjects,
  writeProjectTimeline,
} from "@/server/video/projects"
import { enqueueRenderJobs } from "@/server/video/render-queue"

/**
 * A carousel turned into a reel (workspace/docs/carousel-video.md): every
 * slide drawn as a tall picture, held for the seconds asked, a video slide
 * for its own length, with the change asked between slides and the music
 * under it all. It is made as a new 9:16 project and queued like any export,
 * so it lands on the Exports page and can still be opened and changed.
 */

const REEL = { width: 1080, height: 1920 }

/** The seconds a slide stays up, rounded to a tenth and kept in bounds. */
function slideMs(seconds: number) {
  const bounded = Math.min(
    CAROUSEL_VIDEO_SECONDS.max,
    Math.max(CAROUSEL_VIDEO_SECONDS.min, seconds)
  )
  return Math.round(bounded * 10) * 100
}

/**
 * The timeline: the slides back to back on one lane, each change a blend at
 * the seam that takes no extra time, then the music on a lane of its own.
 */
export function carouselVideoTimeline({
  slides,
  transition,
  music,
}: {
  slides: (
    | { kind: "image"; mediaId: string; url: string; name: string; ms: number }
    | { kind: "video"; mediaId: string; url: string; name: string; ms: number }
  )[]
  transition: CarouselVideoTransition
  music?: { mediaId: string; url: string; name: string; sourceDurationMs: number }
}): ProjectTimeline {
  let startMs = 0
  const clips = slides.map((slide, index) => {
    const clip = {
      id: editorId(),
      kind: slide.kind,
      name: slide.name,
      mediaId: slide.mediaId,
      url: slide.url,
      startMs,
      durationMs: slide.ms,
      trimStartMs: 0,
      ...(slide.kind === "video" ? { sourceDurationMs: slide.ms } : {}),
      ...(index > 0 && transition !== "cut"
        ? {
            transition: {
              kind: transition === "fade" ? ("crossfade" as const) : ("slide" as const),
              durationMs: DEFAULT_TRANSITION_MS,
            },
          }
        : {}),
    }
    startMs += slide.ms
    return clip
  })
  const tracks: ProjectTimeline["tracks"] = [
    { id: editorId(), muted: false, clips },
  ]
  if (music) {
    tracks.push({
      id: editorId(),
      muted: false,
      duck: true,
      clips: planMusicClips(music, startMs),
    })
  }
  return { aspect: "9:16", tracks }
}

/** A slide's PNG in the middle of a 9:16 frame, the gaps in its own colour. */
async function tallStill(
  png: Uint8Array,
  format: CarouselFormat,
  background: string
) {
  if (format === "9:16") return png
  const size = CAROUSEL_FRAME_SIZES[format]
  return new Uint8Array(
    await sharp({
      create: { ...REEL, channels: 4, background },
    })
      .composite([
        { input: Buffer.from(png), top: Math.round((REEL.height - size.height) / 2), left: 0 },
      ])
      .png()
      .toBuffer()
  )
}

export async function makeCarouselVideo({
  userId,
  carouselId,
  secondsPerSlide,
  transition,
  music,
  database = db,
}: {
  userId: string
  carouselId: string
  secondsPerSlide: number
  transition: CarouselVideoTransition
  music?: { mediaId: string; sourceDurationMs: number }
  database?: CustomShellDb
}) {
  const carousel = await getOwnedCarouselDetail(userId, carouselId, database)
  if (!carousel.slides.length) throw new Error(CAROUSEL_EMPTY_EXPORT_MESSAGE)
  const musicSource = music
    ? await requireOwnedMusic(userId, music.mediaId, music.sourceDurationMs, database)
    : undefined

  const workDir = await mkdtemp(path.join(tmpdir(), "carousel-video-"))
  const kept: { id: string; storagePath: string }[] = []
  let projectId: string | null = null
  try {
    const media = await loadSlidePictures(userId, carousel.slides, database)
    const { clips, posters } = await loadSlideClips(
      userId,
      carousel.slides,
      workDir,
      database
    )
    for (const [mediaId, poster] of posters) media.set(mediaId, poster)
    const count = carousel.slides.length
    const ms = slideMs(secondsPerSlide)
    const placed = []
    for (const [index, slide] of carousel.slides.entries()) {
      const name = `${carousel.name} slide ${index + 1}`
      const video = slideVideo(slide)
      const clip = video ? clips.get(video.mediaId) : undefined
      if (clip) {
        const mp4 = await renderVideoSlideMp4({
          slide,
          format: carousel.format,
          place: { index, count },
          media,
          clip,
          workDir,
        })
        const bytes = await tallClip(mp4, carousel.format, slide.backgroundColor, workDir, index)
        const asset = await saveGeneratedAsset({
          userId,
          bytes,
          mimeType: "video/mp4",
          fileType: "video",
          name,
        })
        kept.push(asset)
        placed.push({
          kind: "video" as const,
          mediaId: asset.id,
          url: asset.url,
          name,
          ms: Math.round(Math.min(clip.seconds, CAROUSEL_VIDEO_MAX_SECONDS) * 1000),
        })
        continue
      }
      const png = renderCarouselSlidePng(slide, carousel.format, { index, count }, media)
      const asset = await saveGeneratedAsset({
        userId,
        bytes: await tallStill(png, carousel.format, slide.backgroundColor),
        mimeType: "image/png",
        fileType: "image",
        name,
      })
      kept.push(asset)
      placed.push({ kind: "image" as const, mediaId: asset.id, url: asset.url, name, ms })
    }

    const project = await createOwnedProject(userId, `${carousel.name} video`, database)
    projectId = project.id
    await writeProjectTimeline(
      userId,
      project.id,
      carouselVideoTimeline({ slides: placed, transition, music: musicSource }),
      project.version,
      database
    )
    const jobs = await enqueueRenderJobs({
      userId,
      projectId: project.id,
      aspects: ["9:16"],
      quality: "high",
      frameRate: DEFAULT_FRAME_RATE,
      title: `${carousel.name} video`,
      database,
    })
    return { projectId: project.id, jobs }
  } catch (error) {
    // The project and the slides already kept go again, so a failed try
    // (a full render queue, say) leaves no half-made project behind and
    // nothing in the library that no project uses.
    if (projectId) {
      await deleteOwnedProjects(userId, [projectId], database).catch(() => undefined)
    }
    await Promise.all(kept.map((asset) => discardGeneratedAsset(asset)))
    throw error
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

/** A video slide's MP4 in the middle of a 9:16 frame, the gaps in its colour. */
async function tallClip(
  mp4: Uint8Array,
  format: CarouselFormat,
  background: string,
  workDir: string,
  index: number
) {
  if (format === "9:16") return mp4
  const input = path.join(workDir, `tall-in-${index}.mp4`)
  const output = path.join(workDir, `tall-out-${index}.mp4`)
  await writeFile(input, mp4)
  await runFfmpeg(
    [
      "-i",
      input,
      "-vf",
      `pad=${REEL.width}:${REEL.height}:0:(oh-ih)/2:color=${background.replace("#", "0x")}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ],
    CAROUSEL_VIDEO_FAILED_MESSAGE
  )
  return new Uint8Array(await readFile(output))
}

async function requireOwnedMusic(
  userId: string,
  mediaId: string,
  sourceDurationMs: number,
  database: CustomShellDb
) {
  const [row] = await database
    .select()
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!row || row.fileType !== "audio") {
    throw new Error(CAROUSEL_VIDEO_MUSIC_MISSING_MESSAGE)
  }
  const serialized = await serializeMedia(row)
  return {
    mediaId: row.id,
    url: serialized.url,
    name: row.originalName,
    sourceDurationMs,
  }
}
