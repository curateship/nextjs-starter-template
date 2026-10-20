import type { JSONContent } from "@tiptap/core"

import type { Highlight } from "@/lib/note/library/highlights"

/**
 * What a library and its notes are, in the words and shapes both sides need.
 *
 * Videos, Notes and Posts became one thing on 20 Oct 2026 (Tyler: "collapse
 * video and post into notes"): every record is a note, written by hand or
 * imported from a YouTube, Instagram, TikTok or X link, and every note lives in
 * one of its owner's libraries. The browser draws these and the server writes
 * them, so they live here: a value the browser imports out of `@/server/*`
 * drags the database driver into the page with it.
 */

// ---------------------------------------------------------------------------
// Sources

/** Where a note came from. "note" is one written with New note. */
export const NOTE_SOURCES = ["note", "youtube_long", "youtube_short", "instagram", "tiktok", "x"] as const
export type NoteSource = (typeof NOTE_SOURCES)[number]
/** The five the Import menu offers, in its order. */
export const IMPORT_SOURCES = ["youtube_long", "youtube_short", "instagram", "tiktok", "x"] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

/** The name on the Import menu, the Source column, and the folder an import makes. */
export const SOURCE_LABEL: Record<NoteSource, string> = {
  note: "Note",
  youtube_long: "YouTube long",
  youtube_short: "YouTube short",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X/Twitter",
}

/** The site's own name, for "Open on YouTube". */
export const SOURCE_SITE: Record<NoteSource, string> = {
  note: "",
  youtube_long: "YouTube",
  youtube_short: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
}

/** The dot before the source's name. Written out so Tailwind finds them. */
export const SOURCE_DOT: Record<NoteSource, string> = {
  note: "bg-muted-foreground/50",
  youtube_long: "bg-red-500",
  youtube_short: "bg-orange-500",
  instagram: "bg-fuchsia-500",
  tiktok: "bg-foreground",
  x: "bg-sky-500",
}

export function isImportSource(source: NoteSource): source is ImportSource {
  return source !== "note"
}

// ---------------------------------------------------------------------------
// Fixed fields

export const NOTE_PRIORITIES = ["high", "normal", "low"] as const
export type NotePriority = (typeof NOTE_PRIORITIES)[number]
export const PRIORITY_LABEL: Record<NotePriority, string> = { high: "High", normal: "Normal", low: "Low" }

// ---------------------------------------------------------------------------
// Statuses

/** Getting the video or the post in. Null on a note written by hand. */
export const IMPORT_STATUSES = ["waiting", "reading", "downloading", "saved", "failed"] as const
export type ImportStatus = (typeof IMPORT_STATUSES)[number]

/** An X post's own video, downloaded after its words are read. */
export const POST_VIDEO_STATUSES = ["none", "waiting", "downloading", "saved", "failed", "too_long"] as const
export type PostVideoStatus = (typeof POST_VIDEO_STATUSES)[number]

/** The AI's work. Null until Analyse is first pressed. */
export const ANALYSE_STATUSES = ["queued", "transcribing", "summarising", "ready", "failed"] as const
export type AnalyseStatus = (typeof ANALYSE_STATUSES)[number]

/** none, whole, or cut when the rest of an X thread could not be read. */
export type ThreadStatus = "none" | "whole" | "cut"

export function isImporting(status: ImportStatus | null) {
  return status === "waiting" || status === "reading" || status === "downloading"
}

export function isAnalysing(status: AnalyseStatus | null) {
  return status === "queued" || status === "transcribing" || status === "summarising"
}

/** Still being worked on, so the screen keeps asking where it has got to. */
export function isMoving(note: {
  importStatus: ImportStatus | null
  analyseStatus: AnalyseStatus | null
  videoStatus: PostVideoStatus
}) {
  return (
    isImporting(note.importStatus) ||
    isAnalysing(note.analyseStatus) ||
    note.videoStatus === "waiting" ||
    note.videoStatus === "downloading"
  )
}

// ---------------------------------------------------------------------------
// What the AI writes

export type TranscriptLine = { startMs: number; endMs: number; text: string }
/** One plan step. `from` names the note a merged plan's step came from. */
export type PlanStep = { text: string; done: boolean; from?: string | null }
export type Quote = { text: string; startMs: number | null }

export type PostPicture = { path: string; width: number | null; height: number | null }
export type PictureView = { url: string; width: number | null; height: number | null }

export type QuotedPost = {
  postId: string
  url: string
  authorName: string | null
  authorHandle: string | null
  text: string
  postedAt: string | null
  pictures: PostPicture[]
}

export type ThreadPost = { postId: string; text: string; pictures: PostPicture[] }

/** Not started (no ticks), In progress (some), Done (all). Null with no plan. */
export const PLAN_PROGRESSES = ["not_started", "in_progress", "done"] as const
export type PlanProgress = (typeof PLAN_PROGRESSES)[number]

export function planProgress(plan: readonly PlanStep[] | null | undefined): PlanProgress | null {
  if (!plan?.length) return null
  const ticked = plan.filter((step) => step.done).length
  if (ticked === 0) return "not_started"
  return ticked === plan.length ? "done" : "in_progress"
}

// ---------------------------------------------------------------------------
// Limits

/** Thirty minutes. Anything longer is refused before a byte moves. */
export const MAX_DURATION_SECONDS = 30 * 60
/** About 500MB. */
export const MAX_FILE_BYTES = 500 * 1024 * 1024

/** What a saved file is: most are video, and a site that only has sound gives audio. */
export type MediaKind = "video" | "audio"
export const NOTE_TITLE_MAX = 200
export const LIBRARY_NAME_MAX = 80
export const LIBRARY_DESCRIPTION_MAX = 500
export const FOLDER_NAME_MAX = 80
export const TEMPLATE_NAME_MAX = 80
export const VIEW_NAME_MAX = 60
export const TAG_MAX = 60
/** Tags on one note (the default Tyler was offered, 20 Oct 2026). */
export const TAGS_PER_NOTE = 25
export const AUTHOR_NAME_MAX = 120
export const AUTHOR_HANDLE_MAX = 100
export const PLAN_STEPS_MAX = 30
export const PLAN_STEP_MAX = 400
export const ABOUT_YOU_MAX = 500
/** How many notes one list brings. More than that asks for a search or a folder. */
export const NOTES_LIST_MAX = 1000
/** How many earlier copies of a note are kept (Tyler, 18 Oct 2026). */
export const VERSIONS_KEPT = 100
/** At most one earlier copy per this many minutes of editing. */
export const VERSION_EVERY_MINUTES = 5
/** How long Trash keeps a note (Tyler, 18 Oct 2026). */
export const TRASH_DAYS = 30
/** How many recently opened notes sit in the left panel. */
export const RECENT_NOTES = 3
/** The most notes one press of Analyse many or One plan from many takes. */
export const MANY_AT_ONCE_MAX = 10

// ---------------------------------------------------------------------------
// The sentences a refusal shows, said the same way on both sides

export const LIBRARY_SAYS = {
  libraryNotFound: "Library not found",
  libraryTaken: "You already have a library with that name",
  libraryNameEmpty: "Give the library a name",
  folderNotFound: "Folder not found",
  folderTaken: "A folder with that name is already in this library",
  folderNameEmpty: "Give the folder a name",
  noteNotFound: "Note not found",
  titleEmpty: "Give the note a title",
  changedElsewhere: "This note changed in another tab",
  inTrash: "That note is in Trash. Restore it first.",
  templateNotFound: "Template not found",
  templateNameEmpty: "Give the template a name",
  viewNotFound: "View not found",
  viewNameEmpty: "Give the view a name",
  viewTaken: "A view with that name is already in this library",
  versionNotFound: "That earlier copy is not there any more",
  tagEmpty: "A tag needs some words",
  tooManyTags: `A note holds up to ${TAGS_PER_NOTE} tags`,
  authorEmpty: "Give the author a name",
  sameLibrary: "Those notes are already in that library",
  notALink: "That link isn't from YouTube, Instagram, TikTok or X.",
  alreadyHere: "That link is already in this library",
  tooManyLinks: "Too many imports. Try again in a few minutes.",
  tooLong: "Longer than 30 minutes",
  tooBig: "Bigger than 500MB",
  fileGone: "The saved file has gone. Remove the video and import the link again.",
  notImported: "Wait for the import to finish first.",
  videoStillSaving: "Wait for the video to finish saving first.",
  noVideo: "This post's video is not waiting to be tried again.",
  notAnImport: "This note has no imported link to analyse.",
  stillAnalysing: "Wait for the analysis to finish first.",
  noGeminiKey: "Save a Gemini key in Settings → AI first",
  geminiKeyUnreadable:
    "The saved Gemini key cannot be read on this server. Paste it again in Settings → AI.",
  aiLimitReached: "This month's AI allowance is used up. It starts fresh on the 1st.",
  pickTwo: "Pick at least two notes with a plan.",
  tooManyPicked: `Pick up to ${MANY_AT_ONCE_MAX} notes at a time.`,
  noPlanYet: "Analyse these notes first, so each has a plan to merge.",
  stepEmpty: "A step needs some words",
  tooManySteps: `A plan holds up to ${PLAN_STEPS_MAX} steps`,
  postDeleted: "This post was deleted, or the link is wrong.",
  postPrivate: "This post is private, so only people its author lets in can read it.",
  xBusy: "X didn't answer. Try again in a minute.",
  xChanged: "X's page did not have the post in it. X may have changed its page.",
  saveKeyWrong:
    "This Save from x.com button is not yours, or is an old one. Drag it again from Settings → App settings → Library.",
  saveKeyUnavailable: "Save from x.com needs the server's secret key, which is not set here.",
} as const

// ---------------------------------------------------------------------------
// Libraries

export const LIBRARY_COLOURS = ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] as const
export type LibraryColour = (typeof LIBRARY_COLOURS)[number]

export const LIBRARY_COLOUR_LABEL: Record<LibraryColour, string> = {
  slate: "Grey",
  red: "Red",
  orange: "Orange",
  amber: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Purple",
  pink: "Pink",
}

/** A library's colour is a label people pick, so it keeps its hue in both themes. */
export const LIBRARY_COLOUR_DOT: Record<LibraryColour, string> = {
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-600",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
}

export type LibraryRow = {
  id: string
  name: string
  description: string
  colour: LibraryColour
  avatarUrl: string | null
  bannerUrl: string | null
  pinned: boolean
  /** Notes not in Trash. */
  noteCount: number
  /** The newest edit to the library or any note in it. */
  editedAt: string
}

export type LibraryFolder = {
  id: string
  name: string
  /** The import source this folder was made for, or null for one made by hand. */
  source: ImportSource | null
  position: number
  /** Notes in it, not counting archived ones or Trash. */
  noteCount: number
}

export type LibraryAuthor = {
  /** The name in lowercase, which is what groups the notes (Tyler: "Group by name"). */
  key: string
  name: string
  pictureUrl: string | null
  count: number
}

export type LibraryTag = { tag: string; count: number }

export type LibraryView = { id: string; name: string; filters: NoteFilters; position: number }

export type TemplateSummary = { id: string; name: string; position: number }

/** Everything the left panel and the headers need, read once per library. */
export type LibraryPage = {
  library: LibraryRow
  folders: LibraryFolder[]
  counts: { all: number; loose: number; archived: number; trash: number }
  authors: LibraryAuthor[]
  tags: LibraryTag[]
  recent: { id: string; title: string; openedAt: string }[]
  views: LibraryView[]
  templates: TemplateSummary[]
  /** Every other library of this person, for Move to library. */
  otherLibraries: { id: string; name: string; colour: LibraryColour }[]
}

// ---------------------------------------------------------------------------
// The list

/** The fixed rows of the left panel, or a folder's id. */
export const FIXED_SCOPES = ["all", "loose", "archived", "trash"] as const
type FixedScope = (typeof FIXED_SCOPES)[number]
export type NoteScope = FixedScope | string

export function isFixedScope(scope: string): scope is FixedScope {
  return (FIXED_SCOPES as readonly string[]).includes(scope)
}

export const ANALYSED_FILTERS = ["analysed", "not_analysed", "importing", "failed"] as const
export type AnalysedFilter = (typeof ANALYSED_FILTERS)[number]
export const ANALYSED_LABEL: Record<AnalysedFilter, string> = {
  analysed: "Analysed",
  not_analysed: "Not analysed",
  importing: "Still importing",
  failed: "Failed",
}

export const PROGRESS_FILTERS = ["none", ...PLAN_PROGRESSES] as const
export type ProgressFilter = (typeof PROGRESS_FILTERS)[number]
export const PROGRESS_FILTER_LABEL: Record<ProgressFilter, string> = {
  none: "No plan",
  not_started: "Not started",
  in_progress: "Part done",
  done: "All done",
}

/** The Filter popover's rows. Each is one pick, or nothing. */
export type NoteFilters = {
  source?: NoteSource
  priority?: NotePriority
  tag?: string
  author?: string
  analysed?: AnalysedFilter
  progress?: ProgressFilter
}

export const FILTER_KEYS = ["source", "priority", "tag", "author", "analysed", "progress"] as const

export function countFilters(filters: NoteFilters) {
  return FILTER_KEYS.filter((key) => filters[key] !== undefined).length
}

/** One row in the middle table. */
export type NoteCard = {
  id: string
  libraryId: string
  folderId: string | null
  folderName: string | null
  title: string
  tags: string[]
  priority: NotePriority
  source: NoteSource
  sourceUrl: string | null
  authorName: string | null
  importStatus: ImportStatus | null
  analyseStatus: AnalyseStatus | null
  videoStatus: PostVideoStatus
  analysed: boolean
  progress: PlanProgress | null
  pinned: boolean
  archived: boolean
  deletedAt: string | null
  updatedAt: string
  /** What the price line of Analyse many needs. */
  analyse: AnalyseInputs
  /** Characters across the plan's steps, for One plan's price. */
  planChars: number
}

export type NoteList = {
  notes: NoteCard[]
  /** True when there were more than `NOTES_LIST_MAX`, so the list is cut. */
  more: boolean
}

/** What the AI's price line needs to know about one note, worked out on the server. */
export type AnalyseInputs = {
  /** Seconds of sound still to be written down, or 0. */
  soundSeconds: number
  /** Characters of words the summary reads: the post, quote, thread and what was said. */
  chars: number
  pictures: number
}

export type LinkedNoteState = "ok" | "trash" | "gone"

/** Everything the right panel shows about one note. */
export type NoteDetail = NoteCard & {
  body: JSONContent
  revision: number
  words: number
  linkedFrom: { id: string; title: string }[]
  linkTitles: Record<string, { title: string; state: LinkedNoteState }>
  importError: string | null
  analyseError: string | null
  authorHandle: string | null
  authorPictureUrl: string | null
  postedAt: string | null
  durationSeconds: number | null
  mediaKind: "video" | "audio" | null
  playbackUrl: string | null
  coverUrl: string | null
  /** Whether the stored file is still there, which decides what Try again does. */
  hasFile: boolean
  postText: string | null
  pictures: PictureView[]
  quoted: (Omit<QuotedPost, "pictures"> & { pictures: PictureView[] }) | null
  thread: (Omit<ThreadPost, "pictures"> & { pictures: PictureView[] })[]
  threadStatus: ThreadStatus
  likesWhenSaved: number | null
  repostsWhenSaved: number | null
  videoError: string | null
  highlights: Highlight[]
  transcript: TranscriptLine[]
  summary: string[]
  actionPlan: PlanStep[]
  quotes: Quote[]
  analysedAt: string | null
  /** A merged plan's notes, as they are now. One deleted since is left out. */
  mergedFrom: { id: string; title: string }[]
}

/** What a save sends: only the parts that changed, and the revision it started from. */
export type NoteSave = {
  id: string
  revision: number
  title?: string
  body?: JSONContent
}

export type NoteVersionSummary = { id: string; createdAt: string; title: string; words: number }
export type NoteVersion = NoteVersionSummary & { body: JSONContent }

/** One note's title, for the "[[" picker. */
export type NoteTitle = { id: string; title: string; folderName: string | null }

export type BulkOutcome = { done: string[]; skipped: string[] }

// ---------------------------------------------------------------------------
// Small helpers both sides use

/** The note's title as a person reads it. */
export function noteTitle(title: string) {
  return title.trim() || "Untitled"
}

export function cleanNoteTitle(title: string) {
  return title.replace(/\s+/g, " ").trim().slice(0, NOTE_TITLE_MAX)
}

/** A name with its extra spaces taken out; capitals are compared by the database. */
export function cleanName(name: string, max: number, empty: string) {
  const cleaned = name.replace(/\s+/g, " ").trim()
  if (!cleaned) throw new Error(empty)
  return cleaned.slice(0, max)
}

/** A tag as it is kept: one line, trimmed, lowercased so "Hooks" and "hooks" are one tag. */
export function cleanTag(tag: string) {
  const cleaned = tag.replace(/\s+/g, " ").trim().toLowerCase().slice(0, TAG_MAX)
  if (!cleaned) throw new Error(LIBRARY_SAYS.tagEmpty)
  return cleaned
}

/**
 * An author's name as it is stored: one line, every kind of space made a
 * plain one, trimmed. Every write goes through this, so the database can group
 * and match on `lower(author_name)` alone and agree with `authorKey`.
 */
export function cleanAuthorName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, AUTHOR_NAME_MAX)
}

/** The key an author groups under: the cleaned name, in lowercase. */
export function authorKey(name: string) {
  return cleanAuthorName(name).toLowerCase()
}

/** "1:05", or "1:02:03" past an hour. */
export function formatTimecode(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`
}

/**
 * The name to show beside a handle, or null when it would only repeat it:
 * some people's display name is their handle ("@levelsio").
 */
export function distinctName(name: string | null | undefined, handle: string | null | undefined) {
  const clean = name?.trim()
  if (!clean) return null
  return handle && clean.replace(/^@/, "").toLowerCase() === handle.toLowerCase() ? null : clean
}

/**
 * The shell's codes for a saved key it cannot unscramble, which happens when
 * the server's scrambling secret changed since the key was saved.
 */
export function isUnreadableKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /SECRET_UNREADABLE|ENCRYPTION_NOT_CONFIGURED/.test(message)
}
