import type { Network } from "@/lib/social/networks"

/**
 * The Archive's shared words and rules, read by the server and the
 * dashboard alike (`workspace/docs/archive.md`).
 */

export const ARCHIVE_ITEM_KINDS = ["video", "carousel", "picture"] as const
export type ArchiveItemKind = (typeof ARCHIVE_ITEM_KINDS)[number]

export type ArchiveItemStatus = "copying" | "ready"
export type ArchiveSource = "video" | "upload"
export type ArchiveSlideKind = "photo" | "video"

/** The networks Write captions writes for, each within its own limits. */
export const CAPTION_NETWORKS = ["instagram", "tiktok"] as const
export type CaptionNetwork = (typeof CAPTION_NETWORKS)[number]
export type ArchiveCaptions = Partial<Record<CaptionNetwork, string>>

/** One file still to be fetched from Video while an item is copying. */
export type ArchivePendingFile = {
  role: "main" | "cover" | "pdf" | "slide"
  /** A slide's place, from 0. */
  position?: number
  kind?: ArchiveSlideKind
  url: string
  mimeType: string
  size: number
}

export type ArchivePending = {
  files: ArchivePendingFile[]
  /** The ready item a newer version takes the place of (part 18). */
  replaceItemId?: string
  /** Networks to leave a draft in once it is ready (part 35). */
  drafts?: Network[]
}

/** How long a deleted item waits in the Bin before it is gone for good. */
export const BIN_DAYS = 30

/** The biggest single file Promo copies from Video: the same 5GB Video uploads allow. */
export const MAX_ARCHIVE_FILE_BYTES = 5 * 1024 ** 3

/** The most slides one carousel may hold. Instagram's limit is 20. */
export const MAX_ARCHIVE_SLIDES = 20

/**
 * Cloudflare R2's standard storage price, in dollars per GB a month, for the
 * storage line on each project (part 29). One place, so a new price is one edit.
 */
export const STORAGE_DOLLARS_PER_GB_MONTH = 0.015

/** "12.4 GB, about $0.19 a month". */
export function storageLine(bytes: number): string {
  const gb = bytes / 1024 ** 3
  const size =
    bytes < 1024 ** 2
      ? `${Math.max(0, Math.round(bytes / 1024))} KB`
      : gb < 1
        ? `${Math.round(bytes / 1024 ** 2)} MB`
        : `${gb.toFixed(1)} GB`
  const dollars = gb * STORAGE_DOLLARS_PER_GB_MONTH
  const money = dollars < 0.01 ? "under $0.01" : `about $${dollars.toFixed(2)}`
  return `${size}, ${money} a month`
}

export const ARCHIVE_KIND_LABELS: Record<ArchiveItemKind, string> = {
  video: "Video",
  carousel: "Carousel",
  picture: "Picture",
}
