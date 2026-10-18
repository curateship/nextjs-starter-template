/**
 * What a saved video is, in the words and numbers both sides need.
 *
 * The browser draws these and the server writes them, so they live here rather
 * than beside the server code: a value the browser imports out of a
 * `@/server/*` module drags the database driver into the page with it.
 */

export const NOTE_VIDEO_STATUSES = [
  "waiting",
  "downloading",
  "saved",
  "queued",
  "transcribing",
  "summarising",
  "ready",
  "failed",
] as const
export type NoteVideoStatus = (typeof NOTE_VIDEO_STATUSES)[number]

export type NoteVideoKind = "video" | "audio"

/** youtube, tiktok, instagram, upload, or yt-dlp's name for any other site. */
export type NoteVideoSource = string

export type TranscriptLine = { startMs: number; endMs: number; text: string }
export type ActionStep = { text: string; done: boolean }
export type Quote = { text: string; startMs: number }

/** Thirty minutes. Anything longer is refused before a byte moves. */
export const MAX_DURATION_SECONDS = 30 * 60
/** About 500MB, for a link and for an upload alike. */
export const MAX_FILE_BYTES = 500 * 1024 * 1024
export const NOTE_TEXT_MAX = 2000
export const FOLDER_NAME_MAX = 80
/** How many cards one read of the list brings, newest first. */
export const VIDEOS_PAGE_SIZE = 50

/** The sentences a refusal shows, said the same way on both sides. */
export const NOTE_SAYS = {
  notALink: "That is not a link to a video",
  tooLong: "Longer than 30 minutes",
  tooBig: "Bigger than 500MB",
  uploadTooBig: "Up to 500MB",
  noGeminiKey: "Save a Gemini key in Settings → AI first",
  geminiKeyUnreadable:
    "The saved Gemini key cannot be read on this server. Paste it again in Settings → AI.",
  aiLimitReached:
    "This month's AI allowance is used up. It starts fresh on the 1st.",
  folderTaken: "A folder with that name already exists",
  folderNameEmpty: "Give the folder a name",
  videoNotFound: "Video not found",
  folderNotFound: "Folder not found",
  uploadGone:
    "This upload has no file any more. Upload it again, up to 30 minutes long.",
  fileGone: "The saved file has gone. Delete this video and save the link again.",
  notAnalysable: "Wait for the video to finish saving first.",
  tooManyLinks: "That is a lot of links at once. Wait a few minutes and save the rest.",
} as const

/**
 * The shell's codes for a saved key it cannot unscramble, which happens when
 * the server's scrambling secret changed since the key was saved.
 */
export function isUnreadableKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /SECRET_UNREADABLE|ENCRYPTION_NOT_CONFIGURED/.test(message)
}

/** Still being worked on, so the screen keeps asking where it has got to. */
const MOVING: ReadonlySet<NoteVideoStatus> = new Set([
  "waiting",
  "downloading",
  "queued",
  "transcribing",
  "summarising",
])

export function isMoving(status: NoteVideoStatus) {
  return MOVING.has(status)
}

/** Being analysed right now, start to finish. */
export function isAnalysing(status: NoteVideoStatus) {
  return (
    status === "queued" || status === "transcribing" || status === "summarising"
  )
}

/** The status line on a card and above the Analyse button. */
export function statusWords(video: {
  status: NoteVideoStatus
  error: string | null
}): string {
  switch (video.status) {
    case "waiting":
    case "downloading":
      return "Downloading…"
    case "saved":
      return "Ready to analyse"
    case "queued":
      return "Queued"
    case "transcribing":
      return "Transcribing…"
    case "summarising":
      return "Summarising…"
    case "ready":
      return "Analysed"
    case "failed":
      return `Failed: ${video.error ?? "something went wrong"}`
  }
}

/** One card in the middle panel, as the list hands it over. */
export type NoteVideoCard = {
  id: string
  folderId: string | null
  source: NoteVideoSource
  sourceUrl: string | null
  kind: NoteVideoKind
  status: NoteVideoStatus
  error: string | null
  coverUrl: string | null
  /** Whether the stored file is still there, which decides what Try again does. */
  hasFile: boolean
  title: string
  channelName: string | null
  durationSeconds: number | null
  firstSummaryLine: string | null
  tags: string[]
  /** Every step of the plan ticked. False when there is no plan to tick. */
  done: boolean
  noteFirstLine: string | null
  createdAt: string
  /** The made-up video shown before anything is saved. Never on the server. */
  sample?: boolean
}

/** Everything the right panel shows about one video. */
export type NoteVideoDetail = NoteVideoCard & {
  playbackUrl: string | null
  postedAt: string | null
  language: string | null
  transcript: TranscriptLine[]
  summary: string[]
  actionPlan: ActionStep[]
  quotes: Quote[]
  note: string
  analysedAt: string | null
}

export type NoteFolder = {
  id: string
  name: string
  position: number
  videoCount: number
}

/** What the left panel counts: everything, the loose ones, and each folder. */
export type NoteFolderList = {
  folders: NoteFolder[]
  allCount: number
  noFolderCount: number
}

/** The middle panel's narrowing: every video, the loose ones, or one folder. */
export const NO_FOLDER = "none"
export type FolderScope = undefined | typeof NO_FOLDER | string

export type NoteVideoPage = {
  videos: NoteVideoCard[]
  /** Where "Show older" carries on from, or null when there is nothing older. */
  nextCursor: string | null
}

/** "1:05", or "1:02:03" past an hour. */
export function formatTimecode(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}

/**
 * A folder name with its extra spaces taken out, so " Pricing  ideas" and
 * "pricing ideas" are the same name. Capitals are compared by the database.
 */
export function cleanFolderName(name: string) {
  const cleaned = name.replace(/\s+/g, " ").trim()
  if (!cleaned) throw new Error(NOTE_SAYS.folderNameEmpty)
  return cleaned.slice(0, FOLDER_NAME_MAX)
}

/** The first line of a person's note, for the card. */
export function firstLine(text: string | null | undefined) {
  const line = (text ?? "").split("\n").find((part) => part.trim())
  return line ? line.trim() : null
}

/** Whether every step of a plan is ticked. Nothing to tick is not done. */
export function planDone(plan: readonly ActionStep[] | null | undefined) {
  return plan ? plan.length > 0 && plan.every((step) => step.done) : false
}
