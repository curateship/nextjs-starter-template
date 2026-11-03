import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { fileCache } from "@/server/video/file-cache"
import { videoMediaProxies } from "@/server/video/schema"

/**
 * Where ffmpeg reads one library file from, for an export or a saved frame.
 *
 * A video is read straight from its storage address, and ffmpeg asks for only
 * the bytes it needs: the file's index, then the stretch under the clip. A
 * 10-second clip of a 20GB recording fetches about those 10 seconds, and a
 * saved frame a few megabytes. Nothing is downloaded whole any more.
 *
 * - **A copy already on this server's disk wins** (`file-cache.ts`), so a
 *   video whose smooth copy was made here reads nothing over the network.
 * - **A Small export reads the smooth copies.** They are 720p, more than the
 *   480p a Small export is drawn at, and far smaller to read. Best and Good
 *   still read the originals.
 * - **Pictures and sound are fetched whole** into the kept copies: they are
 *   small, and a picture is read again for every frame it is on screen.
 * - **A dropped connection is picked up again.** ffmpeg reconnects for up to
 *   thirty seconds and asks again from where it was (`REMOTE_INPUT_ARGS`).
 */

export type RenderSourceMedia = {
  id: string
  storagePath: string
  fileType: string
  fileSize: number
}

export type RenderSource = {
  /** A path on disk or an address, as ffmpeg's `-i` takes it. */
  input: string
  release: () => Promise<void>
}

/** Put before `-i` for an address: keep the connection, and come back if it drops. */
export const REMOTE_INPUT_ARGS = [
  "-reconnect",
  "1",
  "-reconnect_on_network_error",
  "1",
  "-reconnect_delay_max",
  "30",
]

export function isRemoteInput(input: string) {
  return /^https?:\/\//.test(input)
}

/** `-i` and the input, with the reconnect options when it is an address. */
export function inputArgs(input: string) {
  return [...(isRemoteInput(input) ? REMOTE_INPUT_ARGS : []), "-i", input]
}

export async function openRenderSource(
  media: RenderSourceMedia,
  { draft }: { draft: boolean }
): Promise<RenderSource> {
  let storagePath = media.storagePath
  let sizeBytes = media.fileSize
  if (draft && media.fileType === "video") {
    const [proxy] = await db
      .select({
        storagePath: videoMediaProxies.storagePath,
        fileSize: videoMediaProxies.fileSize,
      })
      .from(videoMediaProxies)
      .where(
        and(
          eq(videoMediaProxies.mediaId, media.id),
          eq(videoMediaProxies.status, "ready")
        )
      )
      .limit(1)
    if (proxy?.storagePath) {
      storagePath = proxy.storagePath
      sizeBytes = proxy.fileSize ?? 0
    }
  }

  const kept = await fileCache().peek(storagePath)
  if (kept) return { input: kept.path, release: kept.release }

  if (media.fileType === "video") {
    return { input: await getPublicMediaUrl(storagePath), release: async () => undefined }
  }
  const fetched = await fileCache().open(storagePath, sizeBytes)
  return { input: fetched.path, release: fetched.release }
}
