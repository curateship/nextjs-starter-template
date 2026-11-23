import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { getFromR2, uploadFileToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { readCarouselExportSlide } from "@/server/video/carousel-exports"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { videoMusicTracks, videoRenderJobs } from "@/server/video/schema"

/**
 * "Also as a slideshow video" in the send window (part 15): a carousel
 * export made into a tall 9:16 MP4 for TikTok and Reels, a new slide every
 * 3 seconds, with a track from the person's music or none (Tyler, 4 Nov
 * 2026: "Pick a sound"). A picture slide holds for its 3 seconds; a video
 * slide plays its first 3, and holds its last frame if it is shorter.
 */

export const SLIDESHOW_SECONDS = 3
export const SLIDESHOW_SIZE = { width: 1080, height: 1920 }
const FRAME_RATE = 30

export const SLIDESHOW_FAILED_MESSAGE = "The slideshow couldn't be made. Try again."

/** The ffmpeg arguments for slides already on disk, in order. Kept apart so it can be checked without ffmpeg. */
export function slideshowArgs({
  slides,
  sound,
  out,
}: {
  slides: { file: string; video: boolean }[]
  sound: string | null
  out: string
}): string[] {
  const { width, height } = SLIDESHOW_SIZE
  const seconds = String(SLIDESHOW_SECONDS)
  const total = slides.length * SLIDESHOW_SECONDS
  const inputs = slides.flatMap((slide) =>
    slide.video ? ["-t", seconds, "-i", slide.file] : ["-loop", "1", "-t", seconds, "-i", slide.file]
  )
  const fitted = slides.map(
    (_, index) =>
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FRAME_RATE},` +
      `tpad=stop_mode=clone:stop_duration=${seconds},trim=duration=${seconds},setpts=PTS-STARTPTS,format=yuv420p[v${index}]`
  )
  const joined = `${slides.map((_, index) => `[v${index}]`).join("")}concat=n=${slides.length}:v=1:a=0[v]`
  const args = [...inputs]
  if (sound) args.push("-stream_loop", "-1", "-i", sound)
  args.push("-filter_complex", [...fitted, joined].join(";"), "-map", "[v]")
  if (sound) {
    // The music fades over the last second rather than stopping mid-note.
    args.push("-map", `${slides.length}:a`, "-af", `afade=t=out:st=${Math.max(0, total - 1)}:d=1`, "-c:a", "aac", "-b:a", "160k")
  } else {
    args.push("-an")
  }
  args.push("-t", String(total), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", String(FRAME_RATE), "-movflags", "+faststart", out)
  return args
}

/**
 * Makes the slideshow of one ready carousel export and keeps it in storage
 * for the send. Answers where it is, its size and its length.
 */
export async function renderSlideshow(
  userId: string,
  exportId: string,
  soundId: string | null,
  db: CustomShellDb = defaultDb
): Promise<{ storagePath: string; size: number; durationMs: number }> {
  const [row] = await db
    .select()
    .from(videoRenderJobs)
    .where(and(eq(videoRenderJobs.id, exportId), eq(videoRenderJobs.userId, userId), eq(videoRenderJobs.kind, "carousel"), eq(videoRenderJobs.status, "ready")))
    .limit(1)
  const ranges = row?.slideRanges ?? []
  if (!row?.storagePath || !ranges.length) throw new Error("That carousel export isn't there any more.")

  const workDir = await mkdtemp(path.join(tmpdir(), "promo-slideshow-"))
  try {
    const slides: { file: string; video: boolean }[] = []
    for (let index = 0; index < ranges.length; index += 1) {
      const bytes = await readCarouselExportSlide(row.storagePath, ranges, index)
      if (!bytes) throw new Error(SLIDESHOW_FAILED_MESSAGE)
      const video = ranges[index].type === "video"
      const file = path.join(workDir, `slide-${index + 1}.${video ? "mp4" : "png"}`)
      await writeFile(file, bytes)
      slides.push({ file, video })
    }
    let sound: string | null = null
    if (soundId) {
      // Only the person's own music: a marked track they uploaded.
      const [track] = await db
        .select({ storagePath: customShellMedia.storagePath })
        .from(videoMusicTracks)
        .innerJoin(customShellMedia, eq(customShellMedia.id, videoMusicTracks.mediaId))
        .where(and(eq(videoMusicTracks.mediaId, soundId), eq(customShellMedia.userId, userId)))
        .limit(1)
      if (!track) throw new Error("That music isn't there any more. Pick another track.")
      const object = await getFromR2(track.storagePath)
      const bytes = await object.Body?.transformToByteArray()
      if (!bytes) throw new Error(SLIDESHOW_FAILED_MESSAGE)
      sound = path.join(workDir, "sound")
      await writeFile(sound, bytes)
    }
    const out = path.join(workDir, "slideshow.mp4")
    await runFfmpeg(slideshowArgs({ slides, sound, out }), SLIDESHOW_FAILED_MESSAGE)
    const storagePath = `video/promo-sends/${userId}/${uuid()}.mp4`
    await uploadFileToR2(storagePath, out, "video/mp4")
    const { size } = await stat(out)
    return { storagePath, size, durationMs: slides.length * SLIDESHOW_SECONDS * 1000 }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
