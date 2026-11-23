import {
  ANALYSED_FILTERS,
  AUTHOR_NAME_MAX,
  NOTE_PRIORITIES,
  NOTE_SOURCES,
  PROGRESS_FILTERS,
  readNoteSort,
  TAG_MAX,
  writeNoteSort,
  type NoteFilters,
  type NoteScope,
  type NoteSort,
} from "@/lib/note/library/notes"

/**
 * The middle header's tabs (Tyler, 15 Nov 2026), after All notes: Pinned
 * ("remove the pinned block and move them as middle tab"), Plan steps and
 * Quotes. Absent is All notes.
 */
export const LIBRARY_TABS = ["pinned", "steps", "quotes"] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

/** Filter's Show choice: which notes of the library the table holds. Absent is every note not archived or in Trash. */
export const SHOW_CHOICES = ["archived", "trash"] as const
export type ShowChoice = (typeof SHOW_CHOICES)[number]

/**
 * The library dashboard's address: the tab (All notes, Pinned, Plan steps,
 * Quotes), Filter's Show choice, the search,
 * the Filter popover's picks, the saved view, the column the table is sorted
 * by and the open note (UI standard: "The filters live in the address, so a
 * pasted link opens the same view"). Anything that does not read as one of
 * these is left out.
 */
export type LibrarySearch = NoteFilters & {
  /** Pinned, Plan steps or Quotes. Absent is All notes. */
  tab?: LibraryTab
  /** Archived or Trash. Absent is the rest. */
  show?: ShowChoice
  view?: string
  q?: string
  /** "priority" or "-edited": a column, and "-" for the other way round. Absent is newest edited first. */
  sort?: string
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
  return {
    tab: oneOf(LIBRARY_TABS, search.tab),
    show: oneOf(SHOW_CHOICES, search.show),
    view: typeof search.view === "string" && ID.test(search.view) ? search.view : undefined,
    q: text(search.q, 200),
    sort: readNoteSort(search.sort) ? (search.sort as string) : undefined,
    open: typeof search.open === "string" && ID.test(search.open) ? search.open : undefined,
    source: oneOf(NOTE_SOURCES, search.source),
    priority: oneOf(NOTE_PRIORITIES, search.priority),
    tag: text(search.tag, TAG_MAX),
    author: text(search.author, AUTHOR_NAME_MAX),
    analysed: oneOf(ANALYSED_FILTERS, search.analysed),
    progress: oneOf(PROGRESS_FILTERS, search.progress),
  }
}

/** What the server is asked for: a tab, else a Show choice, else All notes. */
export function scopeOf(search: LibrarySearch): NoteScope {
  return search.tab ?? search.show ?? "all"
}

export function filtersOf(search: LibrarySearch): NoteFilters {
  const { source, priority, tag, author, analysed, progress } = search
  return Object.fromEntries(
    Object.entries({ source, priority, tag, author, analysed, progress }).filter(([, value]) => value !== undefined)
  ) as NoteFilters
}

export function sortOf(search: LibrarySearch): NoteSort | undefined {
  return readNoteSort(search.sort)
}

export function sortParam(sort: NoteSort | undefined) {
  return sort ? writeNoteSort(sort) : undefined
}

/** Everything that decides which notes the middle list shows, as one string. */
export function listKeyOf(search: LibrarySearch) {
  return JSON.stringify({ scope: scopeOf(search), q: search.q ?? "", filters: filtersOf(search), sort: search.sort ?? "" })
}
