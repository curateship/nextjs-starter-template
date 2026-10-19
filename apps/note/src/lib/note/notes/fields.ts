import { isOneOf, OPTION_COLOURS, type OptionColour } from "@/lib/note/notes/colours"

/**
 * A folder's own fields, like the columns of a Notion database, and the
 * values a note holds in them.
 *
 * **This file decides what may be stored.** A value is only ever cleaned
 * against a field that exists in the note's folder: a key the folder has not
 * defined has no value, and a value of the wrong kind is refused (when a
 * person typed it) or dropped (when it came from the AI or an old folder),
 * never bent into something else.
 *
 * Browser-safe on purpose: the screen and the server both import it, so
 * nothing here reaches the database.
 */

export const NOTE_FIELD_TYPES = [
  "text",
  "number",
  "checkbox",
  "select",
  "multi_select",
  "date",
  "url",
  "email",
  "phone",
] as const
export type NoteFieldType = (typeof NOTE_FIELD_TYPES)[number]

export const NOTE_FIELD_TYPE_LABELS: Record<NoteFieldType, string> = {
  text: "Text",
  number: "Number",
  checkbox: "Tick box",
  select: "Choice",
  multi_select: "Multi-choice",
  date: "Date",
  url: "Link",
  email: "Email",
  phone: "Phone",
}

export type NoteFieldOption = { id: string; label: string; colour: OptionColour }

export type NoteField = {
  id: string
  /** Fixed when the field is made. Values are stored under it, so a rename keeps them. */
  key: string
  name: string
  type: NoteFieldType
  /** Only the two choice types use these; the rest keep an empty list. */
  options: NoteFieldOption[]
  /** Date fields only: ring the bell on the day. */
  remind: boolean
  position: number
}

export type NoteFieldValue = string | number | boolean | string[]
export type NoteFieldValues = Record<string, NoteFieldValue>

export const MAX_FIELDS_PER_FOLDER = 30
export const MAX_OPTIONS_PER_FIELD = 50
export const FIELD_NAME_MAX = 60
export const OPTION_LABEL_MAX = 60
const FIELD_TEXT_MAX = 2000
const LINK_MAX = 2000
const EMAIL_MAX = 254
const PHONE_MAX = 40

export const FIELDS_SAY = {
  nameEmpty: "Give the field a name",
  nameTaken: "This folder already has a field with that name",
  tooMany: `A folder can have up to ${MAX_FIELDS_PER_FOLDER} fields`,
  tooManyOptions: `A field can have up to ${MAX_OPTIONS_PER_FIELD} options`,
  optionEmpty: "Give every option a name",
  optionTaken: "Two options have the same name",
  typeLocked: "Some notes already have a value in this field. Make a new field instead.",
  fieldNotFound: "That field is not in this folder any more. Reload the note.",
  remindOnlyDates: "Only a date field can remind you",
} as const

export const VALUE_SAYS = {
  notNumber: "That is not a number",
  notDate: "That is not a date",
  notLink: "A link starts with https:// or http://",
  notEmail: "That is not an email address",
  notPhone: "A phone number has digits, spaces, +, - and brackets only",
  notOption: "That option is not on this field any more",
  notTick: "A tick box is ticked or not",
  tooLong: `Up to ${FIELD_TEXT_MAX} characters`,
} as const

/** Collapses spaces and trims, the same way on both sides. */
export function cleanFieldName(name: string) {
  const cleaned = name.replace(/\s+/g, " ").trim()
  if (!cleaned) throw new Error(FIELDS_SAY.nameEmpty)
  return cleaned.slice(0, FIELD_NAME_MAX)
}

/** Field and option names are compared without capitals or extra spaces. */
export function sameName(a: string, b: string) {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * The key a new field's values are stored under: its name, lowercased, with
 * a short tail so two fields that once shared a name never share a key.
 */
export function makeFieldKey(name: string, taken: Iterable<string>) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) {
    const key = `${base}_${n}`
    if (!used.has(key)) return key
  }
}

/** Cleans a field's options: names trimmed, duplicates and blanks refused. */
export function cleanOptions(type: NoteFieldType, options: NoteFieldOption[]): NoteFieldOption[] {
  if (type !== "select" && type !== "multi_select") return []
  if (options.length > MAX_OPTIONS_PER_FIELD) throw new Error(FIELDS_SAY.tooManyOptions)
  const cleaned = options.map((option) => {
    const label = option.label.replace(/\s+/g, " ").trim().slice(0, OPTION_LABEL_MAX)
    if (!label) throw new Error(FIELDS_SAY.optionEmpty)
    return {
      id: option.id,
      label,
      colour: isOneOf(OPTION_COLOURS, option.colour) ? option.colour : "grey",
    }
  })
  const names = cleaned.map((option) => option.label.toLowerCase())
  if (new Set(names).size !== names.length) throw new Error(FIELDS_SAY.optionTaken)
  if (new Set(cleaned.map((option) => option.id)).size !== cleaned.length) {
    throw new Error(FIELDS_SAY.optionTaken)
  }
  return cleaned
}

type Parsed = { ok: true; value: NoteFieldValue | null } | { ok: false; reason: string }

const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[0-9+()\-.\s]+$/

/** Whether a "2026-10-20" or "2026-10-20T14:30" is a real day and time. */
export function isNoteDate(value: string) {
  const match = DATE.exec(value)
  if (!match) return false
  const [, y, m, d, hh, mm] = match
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (
    day.getUTCFullYear() !== Number(y) ||
    day.getUTCMonth() !== Number(m) - 1 ||
    day.getUTCDate() !== Number(d)
  ) {
    return false
  }
  if (hh === undefined) return true
  return Number(hh) < 24 && Number(mm) < 60
}

/**
 * One value checked against its field. Empty means cleared: an empty string,
 * an empty list, null and an unticked box all come back as no value.
 */
export function parseFieldValue(field: NoteField, raw: unknown): Parsed {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  switch (field.type) {
    case "text": {
      if (typeof raw !== "string") return { ok: false, reason: VALUE_SAYS.tooLong }
      const text = raw.trim()
      if (text.length > FIELD_TEXT_MAX) return { ok: false, reason: VALUE_SAYS.tooLong }
      return { ok: true, value: text || null }
    }
    case "number": {
      if (typeof raw === "string" && !raw.trim()) return { ok: true, value: null }
      const value = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim())
      if (!Number.isFinite(value) || Math.abs(value) > 1e15) {
        return { ok: false, reason: VALUE_SAYS.notNumber }
      }
      return { ok: true, value }
    }
    case "checkbox":
      if (typeof raw !== "boolean") return { ok: false, reason: VALUE_SAYS.notTick }
      return { ok: true, value: raw || null }
    case "select": {
      if (raw === "") return { ok: true, value: null }
      if (typeof raw !== "string" || !field.options.some((option) => option.id === raw)) {
        return { ok: false, reason: VALUE_SAYS.notOption }
      }
      return { ok: true, value: raw }
    }
    case "multi_select": {
      if (!Array.isArray(raw)) return { ok: false, reason: VALUE_SAYS.notOption }
      const ids = [...new Set(raw)]
      if (ids.some((id) => typeof id !== "string" || !field.options.some((option) => option.id === id))) {
        return { ok: false, reason: VALUE_SAYS.notOption }
      }
      // Kept in the field's own order, so the same picks always read the same.
      const ordered = field.options.filter((option) => ids.includes(option.id)).map((option) => option.id)
      return { ok: true, value: ordered.length ? ordered : null }
    }
    case "date": {
      if (raw === "") return { ok: true, value: null }
      if (typeof raw !== "string" || !isNoteDate(raw)) return { ok: false, reason: VALUE_SAYS.notDate }
      return { ok: true, value: raw }
    }
    case "url": {
      if (typeof raw !== "string") return { ok: false, reason: VALUE_SAYS.notLink }
      const text = raw.trim()
      if (!text) return { ok: true, value: null }
      if (text.length > LINK_MAX || !isWebLink(text)) return { ok: false, reason: VALUE_SAYS.notLink }
      return { ok: true, value: text }
    }
    case "email": {
      if (typeof raw !== "string") return { ok: false, reason: VALUE_SAYS.notEmail }
      const text = raw.trim()
      if (!text) return { ok: true, value: null }
      if (text.length > EMAIL_MAX || !EMAIL.test(text)) return { ok: false, reason: VALUE_SAYS.notEmail }
      return { ok: true, value: text }
    }
    case "phone": {
      if (typeof raw !== "string") return { ok: false, reason: VALUE_SAYS.notPhone }
      const text = raw.trim()
      if (!text) return { ok: true, value: null }
      if (text.length > PHONE_MAX || !PHONE.test(text) || !/\d/.test(text)) {
        return { ok: false, reason: VALUE_SAYS.notPhone }
      }
      return { ok: true, value: text }
    }
  }
}

function isWebLink(text: string) {
  try {
    const url = new URL(text)
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname)
  } catch {
    return false
  }
}

/**
 * A whole set of stored values, kept only where the folder has a field and
 * the value still fits it. Used whenever values are read back after the
 * fields may have changed under them.
 */
export function cleanFieldValues(fields: NoteField[], values: unknown): NoteFieldValues {
  const out: NoteFieldValues = {}
  if (!values || typeof values !== "object" || Array.isArray(values)) return out
  const bag = values as Record<string, unknown>
  for (const field of fields) {
    if (!(field.key in bag)) continue
    const parsed = parseFieldValue(field, bag[field.key])
    if (parsed.ok && parsed.value !== null) out[field.key] = parsed.value
  }
  return out
}

/** Whether a value counts as filled in. */
export function hasValue(value: NoteFieldValue | undefined | null) {
  if (value === undefined || value === null || value === "" || value === false) return false
  return !(Array.isArray(value) && value.length === 0)
}

/**
 * What happens to a note's values when it moves to another folder. A field
 * with the same name and type in the new folder keeps the value; a choice
 * keeps only the options that have a same-named option there too (Tyler,
 * 18 Oct 2026). Everything else is lost, and `lost` names the fields that
 * held something which did not come across, for the warning.
 */
export function carryFieldValues(
  from: NoteField[],
  to: NoteField[],
  values: NoteFieldValues
): { values: NoteFieldValues; lost: string[] } {
  const carried: NoteFieldValues = {}
  const lost: string[] = []
  for (const old of from) {
    const value = values[old.key]
    if (!hasValue(value)) continue
    const target = to.find((field) => field.type === old.type && sameName(field.name, old.name))
    if (!target) {
      lost.push(old.name)
      continue
    }
    if (old.type === "select" || old.type === "multi_select") {
      const ids = Array.isArray(value) ? value : [value as string]
      const mapped = ids
        .map((id) => old.options.find((option) => option.id === id))
        .map((option) =>
          option ? target.options.find((each) => sameName(each.label, option.label))?.id : undefined
        )
      const kept = mapped.filter((id): id is string => Boolean(id))
      if (kept.length < ids.length) lost.push(old.name)
      if (!kept.length) continue
      carried[target.key] = old.type === "select" ? kept[0] : kept
      continue
    }
    carried[target.key] = value as NoteFieldValue
  }
  return { values: cleanFieldValues(to, carried), lost }
}

/** A value as words: what search reads, what the export writes, what a card shows. */
export function fieldValueText(field: NoteField, value: NoteFieldValue | undefined): string {
  if (!hasValue(value)) return ""
  switch (field.type) {
    case "checkbox":
      return "Yes"
    case "select":
      return field.options.find((option) => option.id === value)?.label ?? ""
    case "multi_select":
      return (value as string[])
        .map((id) => field.options.find((option) => option.id === id)?.label)
        .filter(Boolean)
        .join(", ")
    case "number":
      return formatFieldNumber(value as number)
    default:
      return String(value)
  }
}

/** Every value of a note joined, with each field's name, for the search box. */
export function fieldsSearchText(fields: NoteField[], values: NoteFieldValues) {
  return fields
    .map((field) => {
      const text = fieldValueText(field, values[field.key])
      return text ? `${field.name}: ${text}` : ""
    })
    .filter(Boolean)
    .join("\n")
}

export function formatFieldNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(value)
}

/** A date value for reading: "20 Oct 2026" or "20 Oct 2026, 14:30". */
export function formatNoteDate(value: string) {
  const match = DATE.exec(value)
  if (!match) return value
  const [, y, m, d, hh, mm] = match
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  const words = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(day)
  return hh === undefined ? words : `${words}, ${hh}:${mm}`
}
