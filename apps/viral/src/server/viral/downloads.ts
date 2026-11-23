import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { streamPrivateR2Object } from "@/server/viral/r2-response"
import { viralVaultItems, viralVideos } from "@/server/viral/schema"

/**
 * Download to computer (`workspace/docs/vault.md`, more-features task part 5,
 * Tyler: "Both ⋮ menus"). The file Viral kept of a video, sent as a download
 * named after the video's title. The project page's right panel asks by the
 * saved video's id, a vault idea by its own id. Either way the copy has to be
 * the asker's: anybody else's id, and an id with no copy, answer the same
 * "No such file", so the answer never says whether it exists.
 *
 * The file streams from storage as it is read; nothing holds it in memory.
 */

export const DOWNLOAD_SOURCES = ["video", "idea"] as const
export type DownloadSource = (typeof DOWNLOAD_SOURCES)[number]

const NO_STORE = { "Cache-Control": "no-store" }

type KeptFile = { storagePath: string; mimeType: string; title: string }

/** The kept copy behind a saved video or a vault idea, when it is this person's. */
export async function keptFileFor(ownerId: string, source: DownloadSource, id: string): Promise<KeptFile | null> {
  if (!/^[A-Za-z0-9-]{1,36}$/.test(id)) return null
  const [row] =
    source === "video"
      ? await db
          .select({ storagePath: customShellMedia.storagePath, mimeType: customShellMedia.mimeType, title: viralVideos.title })
          .from(viralVideos)
          .innerJoin(customShellMedia, eq(customShellMedia.id, viralVideos.mediaId))
          .where(and(eq(viralVideos.id, id), eq(viralVideos.ownerId, ownerId), eq(customShellMedia.userId, ownerId)))
          .limit(1)
      : await db
          .select({ storagePath: customShellMedia.storagePath, mimeType: customShellMedia.mimeType, title: viralVaultItems.title })
          .from(viralVaultItems)
          .innerJoin(customShellMedia, eq(customShellMedia.id, viralVaultItems.mediaId))
          .where(and(eq(viralVaultItems.id, id), eq(viralVaultItems.ownerId, ownerId), eq(customShellMedia.userId, ownerId)))
          .limit(1)
  return row ? { storagePath: row.storagePath, mimeType: row.mimeType, title: row.title ?? "" } : null
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
}

/**
 * The file's name: the title with anything a file name or a header can't
 * hold taken out (slashes, quotes, line breaks and other control
 * characters), at most 120 characters, then the extension. "video" when no
 * title is left.
 */
export function downloadName(title: string, mimeType: string, storagePath: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim()
  const fromPath = /\.([a-z0-9]{2,5})$/i.exec(storagePath)?.[1]?.toLowerCase()
  const extension = EXTENSIONS[mimeType] ?? fromPath ?? "mp4"
  return `${cleaned || "video"}.${extension}`
}

/**
 * `attachment; filename="<plain>"; filename*=UTF-8''<encoded>` (RFC 6266).
 * The plain name keeps only printable ASCII for old browsers; every browser
 * today reads the encoded one, accents and all.
 */
export function contentDisposition(name: string): string {
  const plain = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${plain}"; filename*=UTF-8''${encoded}`
}

/** The download itself, for the signed-in route. */
export async function downloadKeptFile(ownerId: string, source: DownloadSource, id: string): Promise<Response> {
  const file = await keptFileFor(ownerId, source, id)
  if (!file) return Response.json({ detail: "No such file." }, { status: 404, headers: NO_STORE })
  const response = await streamPrivateR2Object({ storagePath: file.storagePath, contentType: file.mimeType, cacheControl: "private, no-store" })
  if (!response.ok) return response
  response.headers.set("Content-Disposition", contentDisposition(downloadName(file.title, file.mimeType, file.storagePath)))
  return response
}
