import { z } from "zod"

/** What a CSV column can hold when the file is leads. */
export type LeadImportField = "email" | "name" | "firstName" | "lastName" | "company" | "phone" | "skip"

export const LEAD_IMPORT_FIELD_LABELS: Record<LeadImportField, string> = {
  email: "Email",
  name: "Full name",
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
  phone: "Phone",
  skip: "Leave out",
}

/** The server takes up to 500 leads a request. */
export const LEAD_IMPORT_BATCH = 500

export type LeadImportRow = {
  email: string
  name: string | null
  company: string | null
  phone: string | null
}

/** What a heading most likely holds, so the usual files need no matching. */
export function guessLeadImportField(heading: string): LeadImportField {
  const words = heading.trim().toLowerCase().replace(/[^a-z]+/g, " ").trim()
  if (/\b(e ?mail|email address|mail)\b/.test(words)) return "email"
  if (/^(first|first name|firstname|given name|forename)$/.test(words)) return "firstName"
  if (/^(last|last name|lastname|surname|family name)$/.test(words)) return "lastName"
  if (/^(name|full name|fullname|contact|contact name|lead|lead name)$/.test(words)) return "name"
  if (/^(company|company name|business|organisation|organization|org|account)$/.test(words)) return "company"
  if (/\b(phone|mobile|cell|tel|telephone)\b/.test(words)) return "phone"
  return "skip"
}

const emailRule = z.email().max(255)

/**
 * The file's rows as leads, under the fields picked for each column. A first
 * and last name column are joined into the lead's one name. A row with no
 * real address is counted, not sent.
 */
export function readLeadImportRows(
  rows: string[][],
  fields: LeadImportField[]
): { rows: LeadImportRow[]; invalid: number } {
  const read: LeadImportRow[] = []
  let invalid = 0
  for (const cells of rows) {
    const cell: Partial<Record<LeadImportField, string>> = {}
    fields.forEach((field, index) => {
      const value = (cells[index] ?? "").trim()
      if (value && field !== "skip" && !cell[field]) cell[field] = value
    })
    const email = (cell.email ?? "").toLowerCase()
    if (!emailRule.safeParse(email).success) {
      invalid += 1
      continue
    }
    const name = cell.name ?? ([cell.firstName, cell.lastName].filter(Boolean).join(" ") || null)
    read.push({
      email,
      name: name?.slice(0, 255) ?? null,
      company: cell.company?.slice(0, 255) ?? null,
      phone: cell.phone?.slice(0, 60) ?? null,
    })
  }
  return { rows: read, invalid }
}
