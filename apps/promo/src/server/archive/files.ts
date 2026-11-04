import { and, eq, isNull, or } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"

import { callVideo } from "./video-link"
import { promoArchiveDrafts, promoArchiveItems, promoArchiveSlides } from "./schema"

/**
 * Archive files as the post writers see them (part 34). Every network checks
 * that a picked file is this person's own; a file from the Archive passes
 * that check the same as a media library file does, and the post it makes
 * remembers its archive item for the posted marks (part 41).
 */

export type ArchiveFile = { itemId: string; mimeType: string; name: string; videoExportId: string; source: "video" | "upload" }

/** The archive file at this storage key, if it is one of this person's ready, unbinned items' files. */
export async function archiveFileAt(userId: string, storagePath: string, db: CustomShellDb = defaultDb): Promise<ArchiveFile | null> {
  const [item] = await db
    .select({
      itemId: promoArchiveItems.id,
      title: promoArchiveItems.title,
      mimeType: promoArchiveItems.mimeType,
      storagePath: promoArchiveItems.storagePath,
      pdfPath: promoArchiveItems.pdfPath,
      videoExportId: promoArchiveItems.videoExportId,
      source: promoArchiveItems.source,
    })
    .from(promoArchiveItems)
    .where(
      and(
        eq(promoArchiveItems.userId, userId),
        eq(promoArchiveItems.status, "ready"),
        isNull(promoArchiveItems.deletedAt),
        or(eq(promoArchiveItems.storagePath, storagePath), eq(promoArchiveItems.pdfPath, storagePath))
      )
    )
    .limit(1)
  if (item) {
    const pdf = item.pdfPath === storagePath
    return {
      itemId: item.itemId,
      mimeType: pdf ? "application/pdf" : item.mimeType,
      name: item.title || "Archive item",
      videoExportId: item.videoExportId,
      source: item.source,
    }
  }
  const [slide] = await db
    .select({
      itemId: promoArchiveItems.id,
      title: promoArchiveItems.title,
      mimeType: promoArchiveSlides.mimeType,
      videoExportId: promoArchiveItems.videoExportId,
      source: promoArchiveItems.source,
    })
    .from(promoArchiveSlides)
    .innerJoin(promoArchiveItems, eq(promoArchiveItems.id, promoArchiveSlides.itemId))
    .where(
      and(
        eq(promoArchiveSlides.storagePath, storagePath),
        eq(promoArchiveItems.userId, userId),
        eq(promoArchiveItems.status, "ready"),
        isNull(promoArchiveItems.deletedAt)
      )
    )
    .limit(1)
  return slide ? { itemId: slide.itemId, mimeType: slide.mimeType, name: slide.title || "Archive item", videoExportId: slide.videoExportId, source: slide.source } : null
}

/** The archive file behind a public address, or null for any other address. */
export async function archiveFileForUrl(userId: string, url: string, db: CustomShellDb = defaultDb): Promise<ArchiveFile | null> {
  const storagePath = url ? await storagePathForUrl(url) : null
  return storagePath ? archiveFileAt(userId, storagePath, db) : null
}

/**
 * A post made from an archive item went out: its draft on that network is
 * used, and Video is told so the video or carousel there turns Posted
 * (part 41). Never fails the post, which is out either way.
 */
export async function archivePostWentOut(
  userId: string,
  archiveItemId: string | null,
  network: string,
  postUrl: string,
  {
    db = defaultDb,
    tell = (body: unknown) => callVideo(userId, "/api/connect/promo/events", body, { db }),
    now = new Date(),
  }: { db?: CustomShellDb; tell?: (body: unknown) => Promise<unknown>; now?: Date } = {}
): Promise<void> {
  if (!archiveItemId) return
  try {
    await db
      .update(promoArchiveDrafts)
      .set({ usedAt: now })
      .where(and(eq(promoArchiveDrafts.itemId, archiveItemId), eq(promoArchiveDrafts.network, network as never), isNull(promoArchiveDrafts.usedAt)))
    const [item] = await db
      .select({ videoExportId: promoArchiveItems.videoExportId, source: promoArchiveItems.source })
      .from(promoArchiveItems)
      .where(eq(promoArchiveItems.id, archiveItemId))
      .limit(1)
    if (item?.source === "video" && item.videoExportId) {
      await tell({ type: "posted", videoExportId: item.videoExportId, network, postUrl })
    }
  } catch (error) {
    console.error("An archive post's marks could not be written", archiveItemId, error)
  }
}
