export const FRONT_PAGE_ROW_KINDS = ["text", "plans"] as const

export type FrontPageRowKind = (typeof FRONT_PAGE_ROW_KINDS)[number]

export const FRONT_PAGE_ROW_KIND_LABELS: Record<FrontPageRowKind, string> = {
  text: "Plain text",
  plans: "Plans",
}

export const FRONT_PAGE_ROW_KIND_HINTS: Record<FrontPageRowKind, string> = {
  text: "A heading and one short introduction line.",
  plans: "The app's current public plans beneath the row heading.",
}

export const FRONT_PAGE_ROW_LAYOUTS = ["wide", "narrow"] as const

export type FrontPageRowLayout = (typeof FRONT_PAGE_ROW_LAYOUTS)[number]

export const FRONT_PAGE_ROW_LAYOUT_LABELS: Record<
  FrontPageRowLayout,
  string
> = {
  wide: "Full width",
  narrow: "Narrow",
}

export const FRONT_PAGE_ROW_LAYOUT_HINTS: Record<
  FrontPageRowLayout,
  string
> = {
  wide: "Uses the full public content width.",
  narrow: "Caps the row at 768px and follows the site's content alignment.",
}

export const MAX_FRONT_PAGE_ROWS = 6
export const MAX_FRONT_PAGE_ROW_ID_LENGTH = 96
export const MAX_FRONT_PAGE_ROW_HEADING_LENGTH = 120
export const MAX_FRONT_PAGE_ROW_INTRO_LENGTH = 500

export const FRONT_PAGE_ROW_HEADING_MESSAGE = "Give the row a heading."
export const FRONT_PAGE_ROWS_FULL_MESSAGE =
  `A front page can have ${MAX_FRONT_PAGE_ROWS} rows. Delete one before adding another.`

export type FrontPageRow = {
  id: string
  heading: string
  intro: string
  kind: FrontPageRowKind
  layout: FrontPageRowLayout
}

export type FrontPageRowDraft = Omit<FrontPageRow, "id">

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function rowId(value: unknown, index: number, used: Set<string>) {
  const candidate = typeof value === "string" ? value.trim() : ""
  const safe =
    candidate.length <= MAX_FRONT_PAGE_ROW_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidate)
      ? candidate
      : `front-page-row-${index + 1}`
  let id = safe
  let suffix = 2

  while (used.has(id)) {
    const ending = `-${suffix}`
    id = `${safe.slice(0, MAX_FRONT_PAGE_ROW_ID_LENGTH - ending.length)}${ending}`
    suffix += 1
  }
  used.add(id)
  return id
}

/**
 * Reads the app-wide rows field by field. A row without its required heading
 * is left out, so incomplete or hand-edited settings never leave a blank strip
 * on the public page.
 */
export function normalizeFrontPageRows(value: unknown): FrontPageRow[] {
  if (!Array.isArray(value)) return []

  const rows: FrontPageRow[] = []
  const usedIds = new Set<string>()

  for (const [index, raw] of value.entries()) {
    if (rows.length >= MAX_FRONT_PAGE_ROWS) break
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue

    const source = raw as Record<string, unknown>
    const heading = cleanText(
      source.heading,
      MAX_FRONT_PAGE_ROW_HEADING_LENGTH
    )
    if (!heading) continue

    rows.push({
      id: rowId(source.id, index, usedIds),
      heading,
      intro: cleanText(source.intro, MAX_FRONT_PAGE_ROW_INTRO_LENGTH),
      kind: FRONT_PAGE_ROW_KINDS.includes(source.kind as FrontPageRowKind)
        ? (source.kind as FrontPageRowKind)
        : "text",
      layout: FRONT_PAGE_ROW_LAYOUTS.includes(
        source.layout as FrontPageRowLayout
      )
        ? (source.layout as FrontPageRowLayout)
        : "wide",
    })
  }

  return rows
}

export function frontPageHasPlans(rows: readonly FrontPageRow[]) {
  return rows.some((row) => row.kind === "plans")
}
