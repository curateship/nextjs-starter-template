import {
  ANALYSED_FILTERS,
  AUTHOR_NAME_MAX,
  isFixedScope,
  NOTE_PRIORITIES,
  NOTE_SOURCES,
  PROGRESS_FILTERS,
  TAG_MAX,
  type NoteFilters,
  type NoteScope,
} from "@/lib/note/library/notes"

/**
 * The library dashboard's address: which folder (or author) is showing, the
 * search, the Filter popover's picks, the saved view and the open note
 * (UI standard: "The filters live in the address, so a pasted link opens the
 * same view"). Anything that does not read as one of these is left out.
 */
export type LibrarySearch = NoteFilters & {
  /** A folder's id, or loose, archived or trash. Absent is All notes. */
  folder?: string
  view?: string
  q?: string
  open?: string
}

const ID = /^[\w-]{1,36}$/

function oneOf<const T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : undefined
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : undefined
}

export function readLibrarySearch(search: Record<string, unknown>): LibrarySearch {
  const folder = typeof search.folder === "string" && (isFixedScope(search.folder) || ID.test(search.folder)) ? search.folder : undefined
  return {
    folder: folder === "all" ? undefined : folder,
    view: typeof search.view === "string" && ID.test(search.view) ? search.view : undefined,
    q: text(search.q, 200),
    open: typeof search.open === "string" && ID.test(search.open) ? search.open : undefined,
    source: oneOf(NOTE_SOURCES, search.source),
    priority: oneOf(NOTE_PRIORITIES, search.priority),
    tag: text(search.tag, TAG_MAX),
    author: text(search.author, AUTHOR_NAME_MAX),
    analysed: oneOf(ANALYSED_FILTERS, search.analysed),
    progress: oneOf(PROGRESS_FILTERS, search.progress),
  }
}

export function scopeOf(search: LibrarySearch): NoteScope {
  return search.folder ?? "all"
}

export function filtersOf(search: LibrarySearch): NoteFilters {
  const { source, priority, tag, author, analysed, progress } = search
  return Object.fromEntries(
    Object.entries({ source, priority, tag, author, analysed, progress }).filter(([, value]) => value !== undefined)
  ) as NoteFilters
}

/** Everything that decides which notes the middle list shows, as one string. */
export function listKeyOf(search: LibrarySearch) {
  return JSON.stringify({ scope: scopeOf(search), q: search.q ?? "", filters: filtersOf(search) })
}

/** Whether the address says anything at all, so a remembered place should not replace it. */
export function saysAnything(search: LibrarySearch) {
  return Object.values(search).some((value) => value !== undefined)
}
