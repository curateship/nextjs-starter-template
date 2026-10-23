import { z } from "zod"

/**
 * Reading a CSV file of contacts in the browser, for the Contacts dashboard's
 * Import (Tyler, 20 Oct 2026: "Build CSV import now").
 *
 * The file never leaves the browser whole. It is read here, each column is
 * matched to a contact field, and the rows go to the server a batch at a
 * time, each checked again there with the same address rule.
 */

/** Where everybody a CSV import adds says they came from. */
export const CSV_IMPORT_SOURCE = "CSV import"

/** How many rows one import request carries. */
export const CONTACT_IMPORT_BATCH = 500

/** The most rows one file may hold, so a wrong file is refused before it is sent. */
export const CONTACT_IMPORT_MAX_ROWS = 50_000

/** The longest note the open contact's Notes box keeps. */
export const CONTACT_NOTES_MAX = 10_000

/** What a column of the file is read as. */
export type ImportField = "email" | "firstName" | "lastName" | "name" | "tags" | "skip"

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  email: "Email",
  firstName: "First name",
  lastName: "Last name",
  name: "Full name",
  tags: "Tags",
  skip: "Leave out",
}

export type ImportRow = {
  email: string
  firstName: string | null
  lastName: string | null
  tags: string[]
}

/**
 * The cells of a CSV file, a row at a time.
 *
 * Quotes work the usual way: a quoted cell may hold the separator, a line
 * break, or a doubled quote standing for one. The separator is a comma unless
 * the first line has more semicolons or tabs, which is how spreadsheets set to
 * a European locale save. Lines with nothing on them are dropped.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "")
  const firstLine = source.slice(0, source.search(/\r?\n|$/))
  const separator = [",", ";", "\t"].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best
  )

  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  const endRow = () => {
    row.push(cell)
    if (row.some((value) => value.trim() !== "")) rows.push(row)
    row = []
    cell = ""
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === separator) {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1
      endRow()
    } else {
      cell += char
    }
  }
  if (cell !== "" || row.length) endRow()
  return rows
}

/** What a heading most likely holds, so the usual files need no matching by hand. */
export function guessImportField(heading: string): ImportField {
  const words = heading.trim().toLowerCase().replace(/[^a-z]+/g, " ").trim()
  if (/\b(e ?mail|email address|mail)\b/.test(words)) return "email"
  if (/^(first|first name|firstname|given name|forename)$/.test(words)) return "firstName"
  if (/^(last|last name|lastname|surname|family name)$/.test(words)) return "lastName"
  if (/^(name|full name|fullname|contact|contact name)$/.test(words)) return "name"
  if (/^(tags?|labels?|groups?|lists?)$/.test(words)) return "tags"
  return "skip"
}

/** The rule an address must pass, the same one the server checks each row with. */
const emailRule = z.email().max(255)

/**
 * The file's rows as contacts, under the fields picked for each column.
 *
 * `rows` are the data rows, the heading row already taken off. A row whose
 * address is missing or not an address is counted, not sent. A tags cell may
 * hold several, split at commas, semicolons or bars, and `extraTags` go on
 * every row.
 */
export function readImportRows(
  rows: string[][],
  fields: ImportField[],
  extraTags: string[] = []
): { rows: ImportRow[]; invalid: number } {
  const read: ImportRow[] = []
  let invalid = 0
  for (const cells of rows) {
    const person: ImportRow = { email: "", firstName: null, lastName: null, tags: [...extraTags] }
    fields.forEach((field, index) => {
      const value = (cells[index] ?? "").trim()
      if (!value) return
      if (field === "email") person.email = value.toLowerCase()
      else if (field === "firstName") person.firstName = value
      else if (field === "lastName") person.lastName = value
      else if (field === "name") {
        const [first, ...rest] = value.split(/\s+/)
        person.firstName ??= first ?? null
        person.lastName ??= rest.length ? rest.join(" ") : null
      } else if (field === "tags") {
        person.tags.push(...value.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean))
      }
    })
    if (!emailRule.safeParse(person.email).success) {
      invalid += 1
      continue
    }
    read.push({
      email: person.email,
      firstName: person.firstName?.slice(0, 255) ?? null,
      lastName: person.lastName?.slice(0, 255) ?? null,
      // The server keeps 25 a person, each up to 100 characters.
      tags: [...new Set(person.tags.map((tag) => tag.slice(0, 100)))].slice(0, 25),
    })
  }
  return { rows: read, invalid }
}

/** The sample file the Import menu offers, in the headings `guessImportField` knows. */
export const SAMPLE_CONTACTS_CSV = [
  "email,first_name,last_name,tags",
  'maya@example.com,Maya,Chen,"creator, podcast"',
  "jordan@example.com,Jordan,Reyes,course",
  "sam@example.com,Sam,,",
].join("\n")
