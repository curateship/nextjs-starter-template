import {
  buildUrlHref,
  sanitizeContactHref,
} from "@/lib/directory/contact-links"
import { isSafeMediaUrl } from "@/lib/directory/listing-details"
import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * Fields a site invents for its own listings.
 *
 * A site's admin defines a section — "The wine", "Classes" — and the fields in
 * it. Every listing's edit form then shows those fields, and every listing page
 * shows that section. Nothing here is a page template: a section always renders
 * in the same place, after the listing's write-up, and the only choice is how
 * its own fields are arranged. The directory app this is ported from hangs its
 * custom sections off a template engine; that layer stays cut.
 *
 * **This file decides what may be stored and what may be drawn**, so it is the
 * security surface of the feature. Two rules hold it together:
 *
 * - A value is only ever cleaned *against a definition*. A field the site has
 *   not defined has no value, and a value of the wrong kind for its field is
 *   dropped rather than coerced into something the page then draws.
 * - Anything the browser would follow or render goes through the cleaners that
 *   already exist — `sanitizeContactHref` for links, `isSafeMediaUrl` for
 *   pictures, `cleanWrittenPageBody` for written text. There is no second
 *   sanitizer in here to fall out of step with those.
 *
 * Browser-safe on purpose: the admin screen, the listing form and the public
 * page all import it, so nothing that reaches the database may live here.
 */

export const CUSTOM_SECTION_LAYOUTS = ["stack", "card", "two-column"] as const

export type CustomSectionLayout = (typeof CUSTOM_SECTION_LAYOUTS)[number]

export const CUSTOM_SECTION_LAYOUT_LABELS: Record<CustomSectionLayout, string> =
  {
    stack: "One under another",
    card: "In a card",
    "two-column": "Two columns",
  }

/** Everything but a repeater. A repeater's rows are made of these. */
export const CUSTOM_SIMPLE_FIELD_TYPES = [
  "text",
  "textarea",
  "richText",
  "image",
  "link",
  "number",
  "tags",
  "toggle",
  "select",
] as const

export type CustomSimpleFieldType = (typeof CUSTOM_SIMPLE_FIELD_TYPES)[number]

export const CUSTOM_FIELD_TYPES = [
  ...CUSTOM_SIMPLE_FIELD_TYPES,
  "repeater",
] as const

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  richText: "Written text",
  image: "Picture",
  link: "Link",
  number: "Number",
  tags: "Tags",
  toggle: "Yes or no",
  select: "Choice",
  repeater: "Repeating rows",
}

/** How many of each thing a site may have, so nothing here can run away. */
export const MAX_CUSTOM_SECTIONS = 12
export const MAX_CUSTOM_FIELDS_PER_SECTION = 20
export const MAX_CUSTOM_OPTIONS = 40
export const MAX_CUSTOM_REPEATER_FIELDS = 8
export const MAX_CUSTOM_REPEATER_ROWS = 50
export const MAX_CUSTOM_TAGS = 30

export const CUSTOM_SECTION_NAME_MAX = 80
export const CUSTOM_FIELD_LABEL_MAX = 80
const CUSTOM_FIELD_KEY_MAX = 60
export const CUSTOM_TEXT_MAX = 300
export const CUSTOM_TEXTAREA_MAX = 2000
export const CUSTOM_TAG_MAX = 60
/** Long on purpose: a maps or booking URL blows past a shorter cap. */
const CUSTOM_LINK_MAX = 2000
const CUSTOM_IMAGE_MAX = 600

export type CustomFieldOption = {
  id: string
  label: string
  /** What gets stored when this option is picked. Fixed once it is in use. */
  value: string
}

export type CustomSimpleField = {
  id: string
  /** Stable name in the stored values. Made from the label once, then fixed. */
  key: string
  label: string
  type: CustomSimpleFieldType
  /** Only a choice field uses these; every other type keeps an empty list. */
  options: CustomFieldOption[]
}

export type CustomRepeaterField = {
  id: string
  key: string
  label: string
  type: "repeater"
  /** A row's own fields. Never another repeater — one level, deliberately. */
  fields: CustomSimpleField[]
}

export type CustomField = CustomSimpleField | CustomRepeaterField

export type CustomSection = {
  id: string
  name: string
  /** Fixed at creation, which is what lets a rename keep every saved value. */
  slug: string
  layout: CustomSectionLayout
  displayOrder: number
  fields: CustomField[]
}

/** One row inside a repeating field: its simple fields' values, by key. */
export type CustomRepeaterRow = Record<string, CustomSimpleValue>

export type CustomSimpleValue =
  | string
  | number
  | boolean
  | string[]
  | WrittenPageNode
  | null

export type CustomFieldValue = CustomSimpleValue | CustomRepeaterRow[]

/** One listing's answers: section slug → field key → value. */
export type CustomValues = Record<string, Record<string, CustomFieldValue>>

export function isCustomSectionLayout(
  value: unknown
): value is CustomSectionLayout {
  return (CUSTOM_SECTION_LAYOUTS as readonly unknown[]).includes(value)
}

function isCustomSimpleFieldType(
  value: unknown
): value is CustomSimpleFieldType {
  return (CUSTOM_SIMPLE_FIELD_TYPES as readonly unknown[]).includes(value)
}

/**
 * A label turned into the name it is stored under. Letters, digits and
 * underscores only, because a key ends up as a JSON property and as part of a
 * form control's id.
 */
export function customKeyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CUSTOM_FIELD_KEY_MAX)
}

/** The first key not already used here, numbered past any clash. */
export function freeCustomKey(wanted: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = wanted || "field"
  if (!used.has(base)) return base
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, CUSTOM_FIELD_KEY_MAX - 4)}_${suffix}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error("Too many fields share that name. Give this one another.")
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function cleanOptions(value: unknown): CustomFieldOption[] {
  if (!Array.isArray(value)) return []
  const options: CustomFieldOption[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as Record<string, unknown>
    const label = cleanText(entry.label, CUSTOM_FIELD_LABEL_MAX)
    // An option that already has a stored value keeps it, so rewording a
    // choice does not un-answer every listing that had picked it. A new one
    // takes its value from its wording, once.
    const optionValue =
      cleanText(entry.value, CUSTOM_TEXT_MAX) || customKeyFromLabel(label)
    if (!optionValue || seen.has(optionValue)) continue
    seen.add(optionValue)
    options.push({
      id: cleanText(entry.id, 36) || optionValue,
      label: label || optionValue,
      value: optionValue,
    })
    if (options.length === MAX_CUSTOM_OPTIONS) break
  }
  return options
}

/**
 * The name this field keeps.
 *
 * A field that already has one keeps it, even when its label has since been
 * rewritten — the key is what every listing's answers are filed under, so a
 * rename that moved it would lose them. Only a field arriving without one gets
 * a key made from its label, and it avoids every key already spoken for,
 * including the ones fields further down the list are still holding.
 */
function keyForField(
  entry: Record<string, unknown>,
  label: string,
  taken: Set<string>,
  reserved: Set<string>
): string {
  const existing = customKeyFromLabel(
    cleanText(entry.key, CUSTOM_FIELD_KEY_MAX)
  )
  if (existing && !taken.has(existing)) return existing
  return freeCustomKey(customKeyFromLabel(label), [...taken, ...reserved])
}

/** Every key the incoming list already claims, so a new field avoids them. */
function reservedKeys(fields: unknown[]): Set<string> {
  const keys = new Set<string>()
  for (const raw of fields) {
    if (!raw || typeof raw !== "object") continue
    const key = customKeyFromLabel(
      cleanText((raw as Record<string, unknown>).key, CUSTOM_FIELD_KEY_MAX)
    )
    if (key) keys.add(key)
  }
  return keys
}

function cleanSimpleField(
  value: unknown,
  taken: Set<string>,
  reserved: Set<string>
): CustomSimpleField | null {
  if (!value || typeof value !== "object") return null
  const entry = value as Record<string, unknown>
  if (!isCustomSimpleFieldType(entry.type)) return null

  const label = cleanText(entry.label, CUSTOM_FIELD_LABEL_MAX)
  if (!label) return null
  const key = keyForField(entry, label, taken, reserved)
  taken.add(key)

  return {
    id: cleanText(entry.id, 36) || key,
    key,
    label,
    type: entry.type,
    // A choice with nothing to choose from is still a definition; the form
    // says so rather than the cleaner quietly turning it into a text box.
    options: entry.type === "select" ? cleanOptions(entry.options) : [],
  }
}

/**
 * The stored definition of a section's fields, made safe to work with.
 *
 * Anything unrecognisable is dropped rather than repaired: a definition row
 * hand-edited in the database can only ever describe fields this app knows how
 * to draw and clean.
 */
export function cleanCustomFields(value: unknown): CustomField[] {
  if (!Array.isArray(value)) return []
  const taken = new Set<string>()
  const reserved = reservedKeys(value)
  const fields: CustomField[] = []

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as Record<string, unknown>

    if (entry.type === "repeater") {
      const label = cleanText(entry.label, CUSTOM_FIELD_LABEL_MAX)
      if (!label) continue
      const key = keyForField(entry, label, taken, reserved)
      taken.add(key)

      const rowSource = Array.isArray(entry.fields) ? entry.fields : []
      const rowKeys = new Set<string>()
      const rowReserved = reservedKeys(rowSource)
      const rowFields: CustomSimpleField[] = []
      for (const rawRowField of rowSource) {
        const field = cleanSimpleField(rawRowField, rowKeys, rowReserved)
        if (field) rowFields.push(field)
        if (rowFields.length === MAX_CUSTOM_REPEATER_FIELDS) break
      }

      fields.push({
        id: cleanText(entry.id, 36) || key,
        key,
        label,
        type: "repeater",
        fields: rowFields,
      })
    } else {
      const field = cleanSimpleField(raw, taken, reserved)
      if (field) fields.push(field)
    }

    if (fields.length === MAX_CUSTOM_FIELDS_PER_SECTION) break
  }

  return fields
}

/**
 * Every field the form draws, with what has been saved under it and a blank
 * for the rest.
 *
 * The stored value deliberately holds only answers, so a form fed it straight
 * would have half its controls arrive with nothing to show and flip from
 * uncontrolled to controlled the moment somebody typed. Filling the gaps in
 * once, here, is what keeps the form's own comparison of "has anything
 * changed" comparing two things of the same shape.
 */
export function formCustomValues(
  sections: CustomSection[],
  saved: CustomValues
): CustomValues {
  const values: CustomValues = {}
  for (const section of sections) {
    const answers = saved[section.slug] ?? {}
    const filled: Record<string, CustomFieldValue> = {}
    for (const field of section.fields) {
      filled[field.key] = answers[field.key] ?? blankCustomValue(field)
    }
    values[section.slug] = filled
  }
  return values
}

/** What a field holds before anybody types in it. */
export function blankCustomValue(field: CustomField): CustomFieldValue {
  if (field.type === "repeater") return []
  return blankSimpleValue(field.type)
}

export function blankSimpleValue(
  type: CustomSimpleFieldType
): CustomSimpleValue {
  switch (type) {
    case "toggle":
      return false
    case "tags":
      return []
    case "number":
      return null
    case "richText":
      return emptyWrittenPageBody()
    case "select":
      return ""
    default:
      return ""
  }
}

function cleanSimpleValue(
  field: CustomSimpleField,
  value: unknown
): CustomSimpleValue {
  switch (field.type) {
    case "text":
      return cleanText(value, CUSTOM_TEXT_MAX)
    case "textarea":
      return cleanText(value, CUSTOM_TEXTAREA_MAX)
    case "richText":
      return cleanWrittenPageBody(value)
    case "image": {
      const url = cleanText(value, CUSTOM_IMAGE_MAX)
      return isSafeMediaUrl(url) ? url : ""
    }
    case "link": {
      // The same two steps the contact links take: a bare domain becomes a
      // real address, and anything the browser would treat as a script is
      // dropped rather than escaped.
      const typed = cleanText(value, CUSTOM_LINK_MAX)
      return typed ? sanitizeContactHref(buildUrlHref(typed)) : ""
    }
    case "number": {
      if (value === null || value === undefined || value === "") return null
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }
    case "tags": {
      if (!Array.isArray(value)) return []
      const tags: string[] = []
      const seen = new Set<string>()
      for (const raw of value) {
        const tag = cleanText(raw, CUSTOM_TAG_MAX)
        if (!tag || seen.has(tag)) continue
        seen.add(tag)
        tags.push(tag)
        if (tags.length === MAX_CUSTOM_TAGS) break
      }
      return tags
    }
    case "toggle":
      return value === true
    case "select": {
      // Only one of the offered answers. An option that was removed from the
      // definition takes its saved answers with it rather than leaving a value
      // the page would draw with no label to explain it.
      const chosen = cleanText(value, CUSTOM_TEXT_MAX)
      return field.options.some((option) => option.value === chosen)
        ? chosen
        : ""
    }
  }
}

/**
 * A listing's answers, cleaned against what its site actually defines.
 *
 * Sections and fields that are not in the definitions are dropped, which is
 * what makes deleting a field a real deletion: whatever was saved under it
 * stops reaching a page the moment the definition goes.
 *
 * **Nothing blank is stored.** A field nobody filled in has no entry and a
 * section nobody filled in has no key at all, so "this listing has an answer
 * in this section" is the plain question of whether the key is there — which
 * is what the admin screen's counts ask, and they would be meaningless if
 * every listing carried an empty shell of every section.
 */
export function cleanCustomValues(
  sections: CustomSection[],
  raw: unknown
): CustomValues {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const values: CustomValues = {}

  for (const section of sections) {
    const sectionRaw = source[section.slug]
    const sectionSource =
      sectionRaw && typeof sectionRaw === "object" && !Array.isArray(sectionRaw)
        ? (sectionRaw as Record<string, unknown>)
        : {}
    const cleaned: Record<string, CustomFieldValue> = {}

    for (const field of section.fields) {
      const fieldRaw = sectionSource[field.key]
      const value =
        field.type === "repeater"
          ? cleanRepeaterRows(field, fieldRaw)
          : cleanSimpleValue(field, fieldRaw)
      if (!isBlankValue(field, value)) cleaned[field.key] = value
    }

    if (Object.keys(cleaned).length) values[section.slug] = cleaned
  }

  return values
}

function cleanRepeaterRows(
  field: CustomRepeaterField,
  value: unknown
): CustomRepeaterRow[] {
  if (!Array.isArray(value)) return []
  const rows: CustomRepeaterRow[] = []
  for (const raw of value) {
    const source =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {}
    const row: CustomRepeaterRow = {}
    for (const rowField of field.fields) {
      row[rowField.key] = cleanSimpleValue(rowField, source[rowField.key])
    }
    // A row where nothing was filled in is not a row. Without this, adding a
    // row and changing your mind would save a blank one the page then draws.
    if (field.fields.some((rowField) => !isBlankValue(rowField, row[rowField.key]))) {
      rows.push(row)
    }
    if (rows.length === MAX_CUSTOM_REPEATER_ROWS) break
  }
  return rows
}

/** Nothing was filled in — the page skips it and the section may skip too. */
export function isBlankValue(
  field: CustomField,
  value: CustomFieldValue | undefined
): boolean {
  if (value === undefined || value === null) return true
  if (field.type === "repeater") {
    return !Array.isArray(value) || value.length === 0
  }
  switch (field.type) {
    case "tags":
      return !Array.isArray(value) || value.length === 0
    case "toggle":
      // A "no" is an answer, but drawing "Wheelchair access: No" for every
      // listing that never opened the field would be noise. Only a yes shows.
      return value !== true
    case "number":
      return typeof value !== "number"
    case "richText":
      return (
        typeof value !== "object" ||
        Array.isArray(value) ||
        writtenPageBodyIsEmpty(value as WrittenPageNode)
      )
    default:
      return typeof value !== "string" || value.trim() === ""
  }
}

/** One field, ready to draw: its label, its kind and the answer given. */
export type CustomFieldView = {
  key: string
  label: string
  type: CustomFieldType
  value: CustomFieldValue
  /** A repeating field's rows, already flattened into label/value pairs. */
  rows: { key: string; label: string; type: CustomSimpleFieldType; value: CustomSimpleValue }[][]
}

export type CustomSectionView = {
  slug: string
  name: string
  layout: CustomSectionLayout
  fields: CustomFieldView[]
}

/**
 * The sections a listing's page actually shows: definitions and answers put
 * together, with everything blank left out. A section whose fields are all
 * empty does not come back at all, which is what keeps the page free of
 * headings with nothing under them.
 */
export function customSectionsForDisplay(
  sections: CustomSection[],
  values: CustomValues
): CustomSectionView[] {
  const views: CustomSectionView[] = []

  for (const section of sections) {
    const answers = values[section.slug] ?? {}
    const fields: CustomFieldView[] = []

    for (const field of section.fields) {
      const value = answers[field.key]
      if (value === undefined || isBlankValue(field, value)) continue

      if (field.type === "repeater") {
        const rows = (value as CustomRepeaterRow[]).map((row) =>
          field.fields
            .filter((rowField) => !isBlankValue(rowField, row[rowField.key]))
            .map((rowField) => ({
              key: rowField.key,
              label: rowField.label,
              type: rowField.type,
              // Through the same reader as a field outside a row, so a choice
              // in a repeating row shows its wording rather than the value it
              // is stored under.
              value: displayValue(rowField, row[rowField.key]) as CustomSimpleValue,
            }))
        )
        const filled = rows.filter((row) => row.length > 0)
        if (!filled.length) continue
        fields.push({
          key: field.key,
          label: field.label,
          type: field.type,
          value,
          rows: filled,
        })
      } else {
        fields.push({
          key: field.key,
          label: field.label,
          type: field.type,
          value: displayValue(field, value),
          rows: [],
        })
      }
    }

    if (fields.length) {
      views.push({
        slug: section.slug,
        name: section.name,
        layout: section.layout,
        fields,
      })
    }
  }

  return views
}

/** A choice shows the wording the admin gave it, not the stored value. */
function displayValue(
  field: CustomSimpleField,
  value: CustomFieldValue
): CustomFieldValue {
  if (field.type !== "select") return value
  const option = field.options.find((entry) => entry.value === value)
  return option ? option.label : value
}
