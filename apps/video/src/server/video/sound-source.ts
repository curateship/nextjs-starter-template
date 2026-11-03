import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { fileCache } from "@/server/video/file-cache"
import type { RenderSource } from "@/server/video/render-sources"
import { videoMediaProxies } from "@/server/video/schema"

/**
 * Over this, a video's whole-file jobs read its smooth copy, never the
 * original: the worker's frames and sound jobs, and writing the recording
 * down.
 */
export const BIG_FILE_BYTES = 1024 * 1024 * 1024

export type SoundSource = RenderSource & {
  /**
   * True when this is a big original read straight from storage because its
   * smooth copy is not made yet. A stretch of it is fine to read; the whole
   * of it is not (`SMOOTH_COPY_FIRST_MESSAGE`).
   */
  streamsBigOriginal: boolean
}

/**
 * Where Captions, Tighten and the other tools that listen to a file read its
 * sound from.
 *
 * - **The smooth copy, once it is made.** It carries the same sound in a
 *   file about a tenth the size, and it is kept on this server's disk, so
 *   Captions and then Tighten read it once between them.
 * - **Otherwise a video is read from its storage address.** A tool asked
 *   about part of a clip fetches only that part. Writing down the whole of a
 *   video over 1GB waits for its smooth copy instead
 *   (`SMOOTH_COPY_FIRST_MESSAGE`); a smaller one is streamed through and only
 *   its sound kept.
 * - **A sound file is fetched whole**: it is 50MB at most.
 *
 * The caller has already checked the file is the asker's own.
 */
export async function openSoundSource(mediaId: string): Promise<SoundSource> {
  const [media] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      fileType: customShellMedia.fileType,
      fileSize: customShellMedia.fileSize,
      proxyPath: videoMediaProxies.storagePath,
      proxySize: videoMediaProxies.fileSize,
      proxyStatus: videoMediaProxies.status,
    })
    .from(customShellMedia)
    .leftJoin(videoMediaProxies, eq(videoMediaProxies.mediaId, customShellMedia.id))
    .where(and(eq(customShellMedia.id, mediaId)))
    .limit(1)
  if (!media) throw new Error("Media not found")

  if (media.proxyStatus === "ready" && media.proxyPath) {
    const kept = await fileCache().open(media.proxyPath, media.proxySize ?? 0)
    return { input: kept.path, release: kept.release, streamsBigOriginal: false }
  }
  if (media.fileType === "video") {
    const kept = await fileCache().peek(media.storagePath)
    if (kept) return { input: kept.path, release: kept.release, streamsBigOriginal: false }
    return {
      input: await getPublicMediaUrl(media.storagePath),
      release: async () => undefined,
      streamsBigOriginal: media.fileSize > BIG_FILE_BYTES,
    }
  }
  const kept = await fileCache().open(media.storagePath, media.fileSize)
  return { input: kept.path, release: kept.release, streamsBigOriginal: false }
}
