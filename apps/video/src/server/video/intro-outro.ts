import { spawn } from "node:child_process"
import { and, eq, inArray } from "drizzle-orm"

import type { IntroOutroPart } from "@/lib/video/intro-outro"
import { db, type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { openRenderSource, isRemoteInput, REMOTE_INPUT_ARGS } from "@/server/video/render-sources"
import { videoProjects } from "@/server/video/schema"

/**
 * The project's intro and outro for an export (intro-and-outro.md), each
 * with how long its file runs, read by ffprobe because nothing stores a
 * video's length. One that is not the owner's video any more, or whose
 * length can't be read, is left out rather than failing the export.
 */
export async function introOutroParts(
  userId: string,
  projectId: string,
  database: CustomShellDb = db,
  /**
   * The video's own intro and outro, set from its template when it was made
   * (templates.md). Each one the video has wins over the project's.
   */
  video?: { introMediaId: string | null; outroMediaId: string | null }
): Promise<{ intro: IntroOutroPart | null; outro: IntroOutroPart | null }> {
  const [saved] = await database
    .select({ intro: videoProjects.introMediaId, outro: videoProjects.outroMediaId })
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  const project = {
    intro: video?.introMediaId ?? saved?.intro ?? null,
    outro: video?.outroMediaId ?? saved?.outro ?? null,
  }
  const ids = [project.intro, project.outro].filter((id): id is string => !!id)
  if (!ids.length) return { intro: null, outro: null }
  const rows = await database
    .select()
    .from(customShellMedia)
    .where(
      and(
        inArray(customShellMedia.id, ids),
        eq(customShellMedia.userId, userId),
        eq(customShellMedia.fileType, "video")
      )
    )
  const part = async (mediaId: string | null | undefined): Promise<IntroOutroPart | null> => {
    const media = rows.find((row) => row.id === mediaId)
    if (!media) return null
    const source = await openRenderSource(media, { draft: false })
    try {
      const durationMs = await probeDurationMs(source.input)
      return durationMs > 0 ? { mediaId: media.id, durationMs } : null
    } finally {
      await source.release().catch(() => undefined)
    }
  }
  return { intro: await part(project.intro), outro: await part(project.outro) }
}

/** How long a file runs, in whole milliseconds, or 0 when it can't be read. */
function probeDurationMs(input: string) {
  return new Promise<number>((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        ...(isRemoteInput(input) ? REMOTE_INPUT_ARGS : []),
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        input,
      ],
      { timeout: 30_000 }
    )
    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.on("error", () => resolve(0))
    child.on("close", () => {
      const seconds = Number.parseFloat(stdout.trim())
      resolve(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0)
    })
  })
}
