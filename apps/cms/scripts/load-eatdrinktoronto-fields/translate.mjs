/**
 * Turning the old app's leftovers into the shapes CMS stores.
 *
 * Pure functions only: no database, no filesystem, so every rule here is
 * testable on its own. `index.mjs` does the reading and writing.
 */

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

const DAY_BY_NAME = new Map(WEEKDAYS.map((day) => [day, day]))

/** Two stretches is all a day can hold, which is lunch and then dinner. */
const MAX_SHIFTS_PER_DAY = 2

/**
 * One line's times, as `HH:MM`, or null for a day that is shut.
 *
 * The old app kept hours as the sentence Google gave it — "11:30 AM to 10 PM",
 * "12 to 2:30 PM, 5 to 10 PM", "Closed", "Open 24 hours". Everything below is
 * about reading those four shapes and refusing anything else rather than
 * guessing at it.
 */
export function parseHoursLine(text) {
  const value = String(text ?? "").trim()
  if (!value) return { shifts: [], understood: false }
  if (/^closed$/i.test(value)) return { shifts: [], understood: true }
  if (/^open 24 hours$/i.test(value)) {
    // Midnight to midnight. Opening and closing at the same minute is how the
    // page and the status line both recognise a day that never shuts.
    return { shifts: [{ open: "00:00", close: "00:00" }], understood: true }
  }

  const parts = value.split(",")
  const shifts = []
  for (const part of parts) {
    const shift = parseShift(part)
    if (!shift) return { shifts: [], understood: false }
    if (shifts.length < MAX_SHIFTS_PER_DAY) shifts.push(shift)
  }
  return { shifts, understood: shifts.length > 0 }
}

function parseShift(text) {
  const match = String(text)
    .trim()
    .match(/^(.+?)\s+(?:to|–|-|—)\s+(.+)$/i)
  if (!match) return null

  const close = parseClock(match[2], null)
  if (!close) return null
  const open = parseClock(match[1], close)
  if (!open) return null
  return { open: open.time, close: close.time }
}

/**
 * "11:30 AM", "5 PM", or a bare "12" that takes its meaning from the closing
 * time beside it.
 *
 * A bare start becomes the latest reading that still falls before the close:
 * "12 to 10 PM" is noon, "5 to 10 PM" is five in the afternoon. When neither
 * reading fits — the place shuts after midnight — the later one wins, because
 * a bar opening at 8 and closing at 2 opens in the evening.
 */
function parseClock(text, close) {
  const match = String(text)
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\.?$/i)
  if (!match) return null

  const hour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  if (hour < 1 || hour > 12 || minute > 59) return null

  const meridiem = match[3]?.toLowerCase()
  if (meridiem) return { time: clockTime(hour, minute, meridiem) }
  // A closing time with no AM or PM cannot be read at all: nothing beside it
  // says which half of the day it is in.
  if (!close) return null

  const morning = clockTime(hour, minute, "am")
  const afternoon = clockTime(hour, minute, "pm")
  const closeMinutes = minutesOf(close.time)
  const fits = [afternoon, morning].find(
    (candidate) => minutesOf(candidate) < closeMinutes
  )
  return { time: fits ?? afternoon }
}

function clockTime(hour, minute, meridiem) {
  const hours24 =
    meridiem === "pm" ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour
  return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function minutesOf(time) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * A whole `hoursText` block as the week CMS stores.
 *
 * Lines it cannot read are counted and left out rather than guessed at, and
 * the count travels back to the report so a bad shape shows up as a number
 * instead of as a quietly wrong page.
 */
export function parseHoursText(text) {
  const hours = Object.fromEntries(WEEKDAYS.map((day) => [day, null]))
  let unreadable = 0
  let read = 0

  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf(":")
    if (separator === -1) {
      unreadable += 1
      continue
    }
    const day = DAY_BY_NAME.get(
      trimmed.slice(0, separator).trim().toLowerCase()
    )
    if (!day) {
      unreadable += 1
      continue
    }

    const { shifts, understood } = parseHoursLine(trimmed.slice(separator + 1))
    if (!understood) {
      unreadable += 1
      continue
    }
    read += 1
    hours[day] = shifts.length
      ? { ...shifts[0], second: shifts[1] ?? null }
      : null
  }

  return { hours, unreadable, read }
}

/** Every old field type, and what it becomes here. Null means it is dropped. */
const FIELD_TYPES = {
  tags: "tags",
  text: "text",
  textarea: "textarea",
  link: "link",
  number: "number",
  toggle: "toggle",
  select: "select",
  image: "image",
  "rich-text": null,
  repeater: null,
}

/** Letters, digits and underscores, the way `customKeyFromLabel` makes them. */
export function fieldKey(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
}

/**
 * The old template's fields as a CMS section's fields, plus the map from the
 * old field's key to the new one so a listing's answers can follow.
 *
 * A field CMS has no home for — a written-text field, a repeating one — is
 * left out and named in the report. Silently dropping one would be a page
 * missing something nobody knew was missing.
 */
export function translateTemplateFields(fields, newId) {
  const translated = []
  const keyMap = new Map()
  const skipped = []
  const taken = new Set()

  for (const field of Array.isArray(fields) ? fields : []) {
    const type = FIELD_TYPES[field?.type] ?? null
    const label = String(field?.label ?? "").trim()
    if (!type || !label) {
      skipped.push({ label: label || "(no label)", type: field?.type ?? "" })
      continue
    }

    let key = fieldKey(label) || "field"
    let attempt = 2
    while (taken.has(key)) {
      key = `${fieldKey(label)}_${attempt}`
      attempt += 1
    }
    taken.add(key)
    keyMap.set(String(field.key), { key, type })

    translated.push({
      id: newId(),
      key,
      label: label.slice(0, 80),
      type,
      options: Array.isArray(field.options)
        ? field.options.map((option) => ({
            id: newId(),
            label: String(option?.label ?? "").slice(0, 80),
            value: String(option?.value ?? "").slice(0, 80),
          }))
        : [],
    })
  }

  return { fields: translated, keyMap, skipped }
}

/**
 * One listing's answers, under the new keys.
 *
 * The old app stored a tags field as one comma-separated string. CMS stores a
 * list, so the string is split here and nowhere else.
 */
export function translateValues(values, keyMap) {
  const result = {}
  for (const [oldKey, raw] of Object.entries(values ?? {})) {
    const target = keyMap.get(oldKey)
    if (!target) continue

    if (target.type === "tags") {
      const tags = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
        .map((tag) => String(tag).trim())
        .filter(Boolean)
      if (tags.length) result[target.key] = tags
      continue
    }
    if (target.type === "toggle") {
      if (typeof raw === "boolean") result[target.key] = raw
      continue
    }
    if (target.type === "number") {
      const number = Number(raw)
      if (Number.isFinite(number)) result[target.key] = number
      continue
    }
    const text = String(raw ?? "").trim()
    if (text) result[target.key] = text
  }
  return result
}

export { WEEKDAYS }
