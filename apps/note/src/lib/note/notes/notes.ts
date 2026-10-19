import type { JSONContent } from "@tiptap/core"

import type { NoteField, NoteFieldValues } from "@/lib/note/notes/fields"
import type { NoteView } from "@/lib/note/notes/views"

/**
 * What a written note is, in the words and shapes both sides need. The
 * browser draws these and the server writes them, so they live here: a value
 * the browser imports out of `@/server/*` drags the database driver along.
 */

export const NOTE_TITLE_MAX = 200
export const NOTES_FOLDER_NAME_MAX = 80
export const TEMPLATE_NAME_MAX = 80
export const VIEW_NAME_MAX = 60
/** How many notes one list brings. A folder with more says so under the list. */
export const NOTES_LIST_MAX = 1000
/** How many earlier copies of a note are kept (Tyler, 18 Oct 2026). */
export const VERSIONS_KEPT = 100
/** At most one earlier copy per this many minutes of editing (Tyler, 18 Oct 2026). */
export const VERSION_EVERY_MINUTES = 5
/** How long Trash keeps a note or a folder (Tyler, 18 Oct 2026). */
export const TRASH_DAYS = 30
/** How many recently opened notes sit at the top of the folders panel. */
export const RECENT_NOTES = 3
/** Folders inside folders, at most this deep, so the tree stays readable. */
export const MAX_FOLDER_DEPTH = 6

/** The rows at the top and foot of the folders panel that are not folders. */
export const NOTE_SCOPES = ["all", "loose", "archived", "trash"] as const
type NoteFixedScope = (typeof NOTE_SCOPES)[number]
/** A fixed row, or a folder's id. */
export type NoteScope = NoteFixedScope | string

export function isFixedScope(scope: NoteScope): scope is NoteFixedScope {
  return (NOTE_SCOPES as readonly string[]).includes(scope)
}

export const NOTES_SAY = {
  noteNotFound: "Note not found",
  folderNotFound: "Folder not found",
  folderTaken: "A folder with that name is already here",
  folderNameEmpty: "Give the folder a name",
  folderIntoItself: "A folder cannot go inside itself or one of its own folders",
  folderTooDeep: `Folders go up to ${MAX_FOLDER_DEPTH} deep`,
  folderInTrash: "That folder is in Trash. Restore it first.",
  titleEmpty: "Give the note a title",
  changedElsewhere: "This note changed in another tab",
  templateNotFound: "Template not found",
  templateNameEmpty: "Give the template a name",
  viewNotFound: "View not found",
  viewNameEmpty: "Give the view a name",
  versionNotFound: "That earlier copy is not there any more",
  videoNotFound: "Video not found",
  inTrash: "That note is in Trash. Restore it first.",
  restoreItsFolder: "That note went to Trash with its folder. Restore the folder to bring it back.",
  noGeminiKey: "Save a Gemini key in Settings → AI first",
  geminiKeyUnreadable:
    "The saved Gemini key cannot be read on this server. Paste it again in Settings → AI.",
  aiLimitReached: "This month's AI allowance is used up. It starts fresh on the 1st.",
  noEmptyFields: "Every field on this note already has a value",
  aiNoAnswer: "The AI did not suggest anything this time. Try again in a moment.",
} as const

export type NoteFolder = {
  id: string
  parentId: string | null
  name: string
  icon: string | null
  position: number
  /** Notes directly in this folder, not counting archived ones or Trash. */
  noteCount: number
  fields: NoteField[]
  views: NoteView[]
  templates: NoteTemplateSummary[]
}

export type NoteFolderTree = {
  /** Every folder not in Trash, in tree order is up to the screen. */
  folders: NoteFolder[]
  counts: { all: number; loose: number; archived: number; trash: number }
}

export type NoteTemplateSummary = { id: string; name: string; position: number }

export type NoteTemplate = NoteTemplateSummary & {
  folderId: string
  title: string
  body: JSONContent
  values: NoteFieldValues
}

export type NoteCard = {
  id: string
  folderId: string | null
  title: string
  icon: string | null
  firstLine: string
  values: NoteFieldValues
  checklist: { done: number; total: number }
  pinned: boolean
  archived: boolean
  /** When it went to Trash, or null. */
  deletedAt: string | null
  /** Set when the note went to Trash with its folder, so restoring the folder brings it back. */
  trashedWithFolderId: string | null
  updatedAt: string
  lastOpenedAt: string | null
  /** The folder's name, for lists that mix folders (All notes, search, Trash). */
  folderName: string | null
}

export type NoteList = {
  notes: NoteCard[]
  /** True when there were more than `NOTES_LIST_MAX`, so the list is cut. */
  more: boolean
  /** Folders in Trash, shown on the Trash row with the notes. */
  trashedFolders: { id: string; name: string; deletedAt: string; noteCount: number }[]
}

export type LinkedNoteState = "ok" | "trash" | "gone"

export type NoteDetail = NoteCard & {
  body: JSONContent
  coverUrl: string | null
  revision: number
  words: number
  /** Notes that link to this one. */
  linkedFrom: { id: string; title: string }[]
  /** The notes this one links to, as they are now, so a link shows the current title. */
  linkTitles: Record<string, { title: string; state: LinkedNoteState }>
  video: LinkedVideo | null
  /** A video was linked and has been deleted since. */
  videoGone: boolean
}

export type LinkedVideo = {
  id: string
  title: string
  coverUrl: string | null
  summary: string[]
}

export type NoteVersionSummary = { id: string; createdAt: string; title: string; words: number }
export type NoteVersion = NoteVersionSummary & { body: JSONContent; values: NoteFieldValues }

/** What a save sends: only the parts that changed, and the revision it started from. */
export type NoteSave = {
  id: string
  revision: number
  title?: string
  body?: JSONContent
  icon?: string | null
  coverUrl?: string | null
}

/** One note's title, for the "[[" picker and the video picker. */
export type NoteTitle = { id: string; title: string; folderName: string | null }

/** The note's title as a person reads it. */
export function noteTitle(title: string) {
  return title.trim() || "Untitled"
}

export function cleanNoteTitle(title: string) {
  return title.replace(/\s+/g, " ").trim().slice(0, NOTE_TITLE_MAX)
}

export function cleanFolderName(name: string) {
  const cleaned = name.replace(/\s+/g, " ").trim()
  if (!cleaned) throw new Error(NOTES_SAY.folderNameEmpty)
  return cleaned.slice(0, NOTES_FOLDER_NAME_MAX)
}

/** The folders under one folder, every level down. */
export function folderAndBelow(folders: { id: string; parentId: string | null }[], rootId: string) {
  const ids = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        grew = true
      }
    }
  }
  return ids
}

/** How deep a folder sits: 1 at the top. */
export function folderDepth(folders: { id: string; parentId: string | null }[], id: string) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  let depth = 0
  let at: string | null = id
  const seen = new Set<string>()
  while (at && !seen.has(at)) {
    seen.add(at)
    depth += 1
    at = byId.get(at)?.parentId ?? null
  }
  return depth
}

/** "Author", "Author and Rating", "Author, Rating and Status". */
export function listWords(words: string[]) {
  if (words.length <= 1) return words.join("")
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}
