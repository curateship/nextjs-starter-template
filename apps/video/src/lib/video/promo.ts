/**
 * Send to Promo's shared words and shapes (`workspace/docs/send-to-promo.md`),
 * read by the server and the send window alike.
 */

export type PromoSendKind = "export" | "thumbnail" | "slideshow"
export type PromoSendStatus = "sending" | "sent" | "failed"

/** The networks a send may leave a draft in, the way Promo names them. */
export const PROMO_DRAFT_NETWORKS = ["instagram", "tiktok", "linkedin", "x"] as const
export type PromoDraftNetwork = (typeof PROMO_DRAFT_NETWORKS)[number]

export const PROMO_NETWORK_LABELS: Record<string, string> = {
  reddit: "Reddit",
  instagram: "Instagram",
  tiktok: "TikTok",
  medium: "Medium",
  x: "X",
  linkedin: "LinkedIn",
}

/** What a send asked for beyond the file itself. */
export type PromoSendOptions = {
  drafts?: PromoDraftNetwork[]
  /** The Promo archive item a newer version replaces (part 18). */
  replaceItemId?: string
  /** Language copies share their original video's id. */
  groupKey?: string
  /** A carousel also sent as a slideshow, with this sound (part 15). */
  slideshowSoundId?: string | null
  /** A carousel's PDF goes with it, for LinkedIn (part 16). */
  pdf?: boolean
  /**
   * The file a send carries of its own: a drawn thumbnail or a slideshow,
   * kept under `video/promo-sends/` until Promo has its copy.
   */
  filePath?: string
  fileSize?: number
  fileDurationMs?: number
}

/** A Promo project as the send window lists it. */
export type PromoProjectOption = { id: string; name: string; imageUrl: string; networks: string[] }

/** One send as a row or the send window shows it. */
export type PromoSendView = {
  id: string
  kind: PromoSendKind
  exportId: string | null
  thumbnailId: string | null
  promoProjectId: string
  promoProjectName: string
  status: PromoSendStatus
  error: string
  promoItemId: string
  promoItemUrl: string
  /** How much of the main file Promo has fetched, from 0 to 1, while sending. */
  progress: number
  createdAt: string
}

/** How long Promo may fetch a send's files. A 5GB file on a slow line still fits. */
export const PROMO_TOKEN_HOURS = 2

/** A send still "sending" this long after its last news is taken as failed. */
export const PROMO_SEND_STALE_HOURS = 3

/** The words a failed send shows when Promo gave none. */
export const PROMO_SEND_FAILED = "The send to Promo failed. Try again."

/** Every Promo project, once, so the send window can tick several (part 6). */
export const MAX_PROMO_PROJECTS_PER_SEND = 10

/** The most exports one press of Send to Promo takes (part 7). */
export const MAX_PROMO_EXPORTS_PER_SEND = 50
