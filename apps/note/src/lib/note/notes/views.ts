import {
  fieldValueText,
  hasValue,
  type NoteField,
  type NoteFieldValue,
} from "@/lib/note/notes/fields"
import { noteTitle, type NoteCard } from "@/lib/note/notes/notes"

/**
 * A folder's saved views: a name, a way of looking (list, table or board),
 * and the filters, sort, board grouping and column totals that go with it.
 * The same rules filter the notes on screen and check a view before it is
 * saved, so a view can only name fields its folder has.
 */

export const VIEW_KINDS = ["list", "table", "board"] as const
export type ViewKind = (typeof VIEW_KINDS)[number]

export const VIEW_KIND_LABELS: Record<ViewKind, string> = {
  list: "List",
  table: "Table",
  board: "Board",
}

export const FILTER_OPS = ["contains", "above", "below", "is", "has", "before", "after", "on", "off"] as const
export type FilterOp = (typeof FILTER_OPS)[number]

export type NoteFilter = { fieldKey: string; op: FilterOp; value?: string | number }

/** "title" and "edited" are always there; anything else is a field's key. */
export type NoteSort = { key: string; dir: "asc" | "desc" }

export type TotalKind = "sum" | "average"

export type ViewSettings = {
  filters: NoteFilter[]
  sort: NoteSort | null
  /** A choice field's key, for the board. */
  groupBy: string | null
  /** Number fields' keys, each with what to show under the column. */
  totals: Record<string, TotalKind>
}

export type NoteView = ViewSettings & {
  id: string
  folderId: string
  name: string
  kind: ViewKind
  position: number
}

export const EMPTY_VIEW_SETTINGS: ViewSettings = { filters: [], sort: null, groupBy: null, totals: {} }

export const MAX_FILTERS = 10
export const MAX_VIEWS_PER_FOLDER = 20

export const VIEWS_SAY = {
  tooMany: `A folder can have up to ${MAX_VIEWS_PER_FOLDER} saved views`,
} as const

/** Which filter words each field type offers, in the order they are listed. */
export const FILTER_OPS_FOR: Record<NoteField["type"], FilterOp[]> = {
  text: ["contains"],
  url: ["contains"],
  email: ["contains"],
  phone: ["contains"],
  number: ["above", "below"],
  select: ["is"],
  multi_select: ["has"],
  date: ["before", "after"],
  checkbox: ["on", "off"],
}

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  contains: "contains",
  above: "is above",
  below: "is below",
  is: "is",
  has: "has",
  before: "is before",
  after: "is after",
  on: "is ticked",
  off: "is not ticked",
}

/**
 * A view's settings kept only where they still make sense for these fields:
 * a filter on a field that has gone, a sort on a deleted field, a board
 * grouped by something that is no longer a choice field are all dropped.
 */
export function cleanViewSettings(fields: NoteField[], settings: ViewSettings): ViewSettings {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const filters = settings.filters
    .filter((filter) => {
      const field = byKey.get(filter.fieldKey)
      if (!field || !FILTER_OPS_FOR[field.type].includes(filter.op)) return false
      if (filter.op === "on" || filter.op === "off") return true
      if (field.type === "number") return typeof filter.value === "number" && Number.isFinite(filter.value)
      if (filter.op === "is" || filter.op === "has") {
        return field.options.some((option) => option.id === filter.value)
      }
      if (filter.op === "before" || filter.op === "after") {
        return typeof filter.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(filter.value)
      }
      return typeof filter.value === "string" && filter.value.trim().length > 0 && filter.value.length <= 200
    })
    .slice(0, MAX_FILTERS)
    .map((filter) =>
      filter.op === "on" || filter.op === "off"
        ? { fieldKey: filter.fieldKey, op: filter.op }
        : { fieldKey: filter.fieldKey, op: filter.op, value: filter.value }
    )
  const sort =
    settings.sort &&
    (settings.sort.key === "title" || settings.sort.key === "edited" || byKey.has(settings.sort.key)) &&
    (settings.sort.dir === "asc" || settings.sort.dir === "desc")
      ? { key: settings.sort.key, dir: settings.sort.dir }
      : null
  const groupBy =
    settings.groupBy && byKey.get(settings.groupBy)?.type === "select" ? settings.groupBy : null
  const totals: Record<string, TotalKind> = {}
  for (const [key, kind] of Object.entries(settings.totals ?? {})) {
    if (byKey.get(key)?.type === "number" && (kind === "sum" || kind === "average")) totals[key] = kind
  }
  return { filters, sort, groupBy, totals }
}

function matches(field: NoteField, filter: NoteFilter, value: NoteFieldValue | undefined) {
  switch (filter.op) {
    case "on":
      return value === true
    case "off":
      return value !== true
    case "contains":
      return fieldValueText(field, value).toLowerCase().includes(String(filter.value ?? "").toLowerCase())
    case "above":
      return typeof value === "number" && value > Number(filter.value)
    case "below":
      return typeof value === "number" && value < Number(filter.value)
    case "is":
      return value === filter.value
    case "has":
      return Array.isArray(value) && value.includes(String(filter.value))
    case "before":
      return typeof value === "string" && value.slice(0, 10) < String(filter.value)
    case "after":
      return typeof value === "string" && value.slice(0, 10) > String(filter.value)
  }
}

/** The notes that pass every filter, in the view's order. Pinned notes stay first. */
export function applyView(notes: NoteCard[], fields: NoteField[], settings: ViewSettings): NoteCard[] {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const kept = notes.filter((note) =>
    settings.filters.every((filter) => {
      const field = byKey.get(filter.fieldKey)
      return field ? matches(field, filter, note.values[filter.fieldKey]) : true
    })
  )
  return sortNotes(kept, fields, settings.sort)
}

/**
 * Pinned first, then the view's sort, then newest edited. A note with no
 * value in the sorted field goes last whichever way the sort runs.
 */
function sortNotes(notes: NoteCard[], fields: NoteField[], sort: NoteSort | null): NoteCard[] {
  const field = sort ? fields.find((each) => each.key === sort.key) : undefined
  const direction = sort?.dir === "desc" ? -1 : 1
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sort) {
      const order = compareBy(sort.key, field, a, b)
      if (order.missing) return order.missing
      if (order.value) return order.value * direction
    }
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

function compareBy(
  key: string,
  field: NoteField | undefined,
  a: NoteCard,
  b: NoteCard
): { missing: number; value: number } {
  if (key === "title") return { missing: 0, value: collator.compare(noteTitle(a.title), noteTitle(b.title)) }
  if (key === "edited") return { missing: 0, value: a.updatedAt.localeCompare(b.updatedAt) }
  if (!field) return { missing: 0, value: 0 }
  const av = a.values[key]
  const bv = b.values[key]
  const aHas = hasValue(av)
  const bHas = hasValue(bv)
  if (aHas !== bHas) return { missing: aHas ? -1 : 1, value: 0 }
  if (!aHas) return { missing: 0, value: 0 }
  if (field.type === "number") return { missing: 0, value: (av as number) - (bv as number) }
  if (field.type === "checkbox") return { missing: 0, value: 0 }
  if (field.type === "select") {
    const at = (id: unknown) => field.options.findIndex((option) => option.id === id)
    return { missing: 0, value: at(av) - at(bv) }
  }
  return { missing: 0, value: collator.compare(fieldValueText(field, av), fieldValueText(field, bv)) }
}

/** The figure under a number column: the sum or the average of the notes showing. */
export function columnTotal(notes: NoteCard[], key: string, kind: TotalKind): number | null {
  const numbers = notes
    .map((note) => note.values[key])
    .filter((value): value is number => typeof value === "number")
  if (!numbers.length) return null
  const sum = numbers.reduce((total, value) => total + value, 0)
  return kind === "sum" ? sum : sum / numbers.length
}
