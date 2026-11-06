import type { AnalysisPieces } from "@/lib/viral/analysis"
import { creatorPlatformLabels, isCreatorPlatform, type CreatorPlatform } from "@/lib/viral/creators"
import { readNotes } from "@/lib/viral/notes"
import { isTextSocial, SOCIAL_NAMES, type TextSocial } from "@/lib/viral/socials"
import { writtenPageText } from "@/lib/pages/written-page-body"

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
/** The longest title an idea you type yourself may have. */
export const VAULT_TITLE_MAX = 300
export const VAULT_TAGS_PER_ITEM_MAX = 20

/**
 * What an idea came from (`workspace/docs/vault.md`, more-features task part
 * 1): a saved video, a saved X, Reddit or LinkedIn post, or one you typed
 * yourself. Only a video has a player and a kept copy.
 */
export const VAULT_KINDS = ["video", "post", "own"] as const
export type VaultKind = (typeof VAULT_KINDS)[number]

/**
 * The numbers when it was saved. Null where the platform hides one. A post
 * keeps its likes (upvotes on Reddit, reactions on LinkedIn), its replies as
 * comments, its writer's followers as subscribers, and its reposts.
 */
export type VaultStats = {
  views: number | null
  likes: number | null
  comments: number | null
  subscribers: number | null
  durationSeconds: number | null
  postedAt: string | null
  score: number | null
  outlier: number | null
  /** A post's reposts. Absent on a video. */
  reposts?: number | null
}

/** A saved post's own words, copied when it was saved (more-features task part 2). */
export type VaultSourcePost = {
  /** A Reddit post's title, or "". */
  title: string
  text: string
  /** The link the post carries, kept only when it is http or https. */
  link: string
  /** A subreddit's name, or "". */
  community: string
  authorHandle: string
  authorName: string
}

export type VaultItem = {
  id: string
  kind: VaultKind
  projectId: string
  projectName: string
  /** The video's platform or the post's network. Null for your own idea. */
  platform: CreatorPlatform | TextSocial | null
  platformVideoId: string | null
  /** Where the original is. Null for your own idea. */
  sourceUrl: string | null
  title: string
  channelName: string
  thumbnailUrl: string | null
  /** Viral's own copy, playable even when the original is gone. Null while it has none. */
  playbackUrl: string | null
  /** Whether Viral keeps a copy of the video, so Download to computer can offer it. */
  hasFile: boolean
  stats: VaultStats
  analysisTopic: string | null
  analysis: AnalysisPieces | null
  /** Your version of the script, part by part. Null while the AI's version stands. */
  editedScript: AnalysisPieces["script"] | null
  /** A saved post's words. Null for a video or your own idea. */
  post: VaultSourcePost | null
  /** Plain text for a video or a post; for your own idea, the shell editor's document as JSON text. */
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

/** "YouTube", "Reddit", or "Your idea" for one typed in. */
export function vaultSourceLabel(item: Pick<VaultItem, "platform">): string {
  if (!item.platform) return "Your idea"
  return isTextSocial(item.platform) ? SOCIAL_NAMES[item.platform] : creatorPlatformLabels[item.platform]
}

/** A stored platform as an idea's: null for your own idea, a known video platform or network as it is, anything else as YouTube. */
export function readVaultPlatform(value: string | null): VaultItem["platform"] {
  if (!value) return null
  if (isCreatorPlatform(value) || isTextSocial(value)) return value
  return "youtube"
}

/**
 * The script that goes out: your edit when there is one, otherwise the AI's.
 * Send to Video, Post for Promo and the Script card's Copy all read this
 * (Tyler, 6 Nov 2026: "Keep it, Show original").
 */
export function currentScript(item: Pick<VaultItem, "analysis" | "editedScript">): AnalysisPieces["script"] | null {
  return item.editedScript ?? item.analysis?.script ?? null
}

/**
 * The notes as plain words, for Send to Video, a post's prompt and the
 * search. Your own idea's notes are the shell editor's document, so its
 * words are read out of it; every other idea's notes are plain text already.
 */
export function vaultNotesText(item: Pick<VaultItem, "kind" | "notes">): string {
  if (item.kind !== "own") return item.notes
  // One line per paragraph, list or heading, so the words keep their breaks.
  return (readNotes(item.notes).content ?? [])
    .map((block) => writtenPageText(block).trim())
    .filter(Boolean)
    .join("\n")
}
