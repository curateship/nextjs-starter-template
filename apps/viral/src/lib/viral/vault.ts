import type { AnalysisPieces } from "@/lib/viral/analysis"
import type { CreatorPlatform } from "@/lib/viral/creators"

/**
 * The vault: viral ideas kept per project, with the video's own copy, its
 * numbers, the analysis and notes (`workspace/docs/vault.md`). Tyler,
 * 4 Nov 2026: "Status and tags", the statuses Idea → Scripted → Sent → Posted.
 */
export const VAULT_STATUSES = ["idea", "scripted", "sent", "posted"] as const
export type VaultStatus = (typeof VAULT_STATUSES)[number]

export const vaultStatusLabels: Record<VaultStatus, string> = {
  idea: "Idea",
  scripted: "Scripted",
  sent: "Sent",
  posted: "Posted",
}

export const VAULT_TAG_MAX = 40
export const VAULT_TAGS_PER_ITEM_MAX = 20

/** The numbers when it was saved. Null where the platform hides one. */
export type VaultStats = {
  views: number | null
  likes: number | null
  comments: number | null
  subscribers: number | null
  durationSeconds: number | null
  postedAt: string | null
  score: number | null
  outlier: number | null
}

export type VaultItem = {
  id: string
  projectId: string
  projectName: string
  platform: CreatorPlatform
  platformVideoId: string
  sourceUrl: string
  title: string
  channelName: string
  thumbnailUrl: string | null
  /** Viral's own copy, playable even when the original is gone. Null while it has none. */
  playbackUrl: string | null
  stats: VaultStats
  analysisTopic: string | null
  analysis: AnalysisPieces | null
  notes: string
  status: VaultStatus
  tags: string[]
  sentEditUrl: string | null
  sentAt: string | null
  /** The last send's state, when one is under way or failed. */
  send: { id: string; status: "sending" | "copying" | "ready" | "failed"; error: string | null } | null
  createdAt: string
}

/** A tag typed by a person, tidied: trimmed, inner spaces squeezed. Empty means none. */
export function cleanTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, VAULT_TAG_MAX)
}
