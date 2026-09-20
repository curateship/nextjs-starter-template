export const FRONT_PAGE_ROW_KINDS = [
  "text",
  "plans",
  "testimonials",
  "faq",
  "logos",
  "screenshots",
] as const

export type FrontPageRowKind = (typeof FRONT_PAGE_ROW_KINDS)[number]

export const FRONT_PAGE_ROW_KIND_LABELS: Record<FrontPageRowKind, string> = {
  text: "Plain text",
  plans: "Plans",
  testimonials: "Testimonials",
  faq: "FAQ",
  logos: "Logo strip",
  screenshots: "Screenshots",
}

export const FRONT_PAGE_ROW_KIND_HINTS: Record<FrontPageRowKind, string> = {
  text: "A heading and one short introduction line.",
  plans: "The app's current public plans beneath the row heading.",
  testimonials: "Customer quotes with a name, role, and optional picture.",
  faq: "Questions and answers shown together.",
  logos: "Customer or partner logos with accessible names.",
  screenshots: "Product images with short captions.",
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
export const MAX_FRONT_PAGE_TESTIMONIALS = 6
export const MAX_FRONT_PAGE_FAQ_ITEMS = 12
export const MAX_FRONT_PAGE_LOGOS = 12
export const MAX_FRONT_PAGE_SCREENSHOTS = 6
export const MAX_FRONT_PAGE_ITEM_NAME_LENGTH = 120
export const MAX_FRONT_PAGE_ITEM_ROLE_LENGTH = 160
export const MAX_FRONT_PAGE_TESTIMONIAL_QUOTE_LENGTH = 1_000
export const MAX_FRONT_PAGE_FAQ_QUESTION_LENGTH = 200
export const MAX_FRONT_PAGE_FAQ_ANSWER_LENGTH = 2_000
export const MAX_FRONT_PAGE_IMAGE_ALT_LENGTH = 160
export const MAX_FRONT_PAGE_SCREENSHOT_CAPTION_LENGTH = 300
export const MAX_FRONT_PAGE_IMAGE_URL_LENGTH = 2_048

export const FRONT_PAGE_ROW_HEADING_MESSAGE = "Give the row a heading."
export const FRONT_PAGE_ROWS_FULL_MESSAGE =
  `A front page can have ${MAX_FRONT_PAGE_ROWS} rows. Delete one before adding another.`

type FrontPageRowBase = {
  id: string
  heading: string
  intro: string
  layout: FrontPageRowLayout
}

export type FrontPageTestimonial = {
  id: string
  quote: string
  name: string
  role: string
  picture: string
}

export type FrontPageFaqItem = {
  id: string
  question: string
  answer: string
}

export type FrontPageLogo = {
  id: string
  image: string
  alt: string
}

export type FrontPageScreenshot = {
  id: string
  image: string
  caption: string
}

export type FrontPageRow =
  | (FrontPageRowBase & { kind: "text" | "plans" })
  | (FrontPageRowBase & {
      kind: "testimonials"
      items: FrontPageTestimonial[]
    })
  | (FrontPageRowBase & { kind: "faq"; items: FrontPageFaqItem[] })
  | (FrontPageRowBase & { kind: "logos"; items: FrontPageLogo[] })
  | (FrontPageRowBase & {
      kind: "screenshots"
      items: FrontPageScreenshot[]
    })

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never

export type FrontPageRowDraft = WithoutId<FrontPageRow>

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function safeId(value: unknown, fallback: string, used: Set<string>) {
  const candidate = typeof value === "string" ? value.trim() : ""
  const safe =
    candidate.length <= MAX_FRONT_PAGE_ROW_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidate)
      ? candidate
      : fallback
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

export function normalizeFrontPageImageUrl(value: unknown) {
  const image = cleanText(value, MAX_FRONT_PAGE_IMAGE_URL_LENGTH)
  if (!image) return ""

  try {
    const parsed = new URL(image)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? image
      : ""
  } catch {
    return ""
  }
}

function normalizeTestimonials(value: unknown): FrontPageTestimonial[] {
  if (!Array.isArray(value)) return []
  const items: FrontPageTestimonial[] = []
  const usedIds = new Set<string>()

  for (const [index, raw] of value.entries()) {
    if (items.length >= MAX_FRONT_PAGE_TESTIMONIALS) break
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const quote = cleanText(
      source.quote,
      MAX_FRONT_PAGE_TESTIMONIAL_QUOTE_LENGTH
    )
    const name = cleanText(source.name, MAX_FRONT_PAGE_ITEM_NAME_LENGTH)
    if (!quote || !name) continue

    items.push({
      id: safeId(source.id, `front-page-testimonial-${index + 1}`, usedIds),
      quote,
      name,
      role: cleanText(source.role, MAX_FRONT_PAGE_ITEM_ROLE_LENGTH),
      picture: normalizeFrontPageImageUrl(source.picture),
    })
  }

  return items
}

function normalizeFaqItems(value: unknown): FrontPageFaqItem[] {
  if (!Array.isArray(value)) return []
  const items: FrontPageFaqItem[] = []
  const usedIds = new Set<string>()

  for (const [index, raw] of value.entries()) {
    if (items.length >= MAX_FRONT_PAGE_FAQ_ITEMS) break
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const question = cleanText(
      source.question,
      MAX_FRONT_PAGE_FAQ_QUESTION_LENGTH
    )
    const answer = cleanText(source.answer, MAX_FRONT_PAGE_FAQ_ANSWER_LENGTH)
    if (!question || !answer) continue

    items.push({
      id: safeId(source.id, `front-page-faq-${index + 1}`, usedIds),
      question,
      answer,
    })
  }

  return items
}

function normalizeLogos(value: unknown): FrontPageLogo[] {
  if (!Array.isArray(value)) return []
  const items: FrontPageLogo[] = []
  const usedIds = new Set<string>()

  for (const [index, raw] of value.entries()) {
    if (items.length >= MAX_FRONT_PAGE_LOGOS) break
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const image = normalizeFrontPageImageUrl(source.image)
    const alt = cleanText(source.alt, MAX_FRONT_PAGE_IMAGE_ALT_LENGTH)
    if (!image || !alt) continue

    items.push({
      id: safeId(source.id, `front-page-logo-${index + 1}`, usedIds),
      image,
      alt,
    })
  }

  return items
}

function normalizeScreenshots(value: unknown): FrontPageScreenshot[] {
  if (!Array.isArray(value)) return []
  const items: FrontPageScreenshot[] = []
  const usedIds = new Set<string>()

  for (const [index, raw] of value.entries()) {
    if (items.length >= MAX_FRONT_PAGE_SCREENSHOTS) break
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const image = normalizeFrontPageImageUrl(source.image)
    const caption = cleanText(
      source.caption,
      MAX_FRONT_PAGE_SCREENSHOT_CAPTION_LENGTH
    )
    if (!image || !caption) continue

    items.push({
      id: safeId(source.id, `front-page-screenshot-${index + 1}`, usedIds),
      image,
      caption,
    })
  }

  return items
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

    const base = {
      heading,
      intro: cleanText(source.intro, MAX_FRONT_PAGE_ROW_INTRO_LENGTH),
      layout: FRONT_PAGE_ROW_LAYOUTS.includes(
        source.layout as FrontPageRowLayout
      )
        ? (source.layout as FrontPageRowLayout)
        : "wide",
    } as const
    const rowBase = () => ({
      id: safeId(source.id, `front-page-row-${index + 1}`, usedIds),
      ...base,
    })
    const kind = FRONT_PAGE_ROW_KINDS.includes(source.kind as FrontPageRowKind)
      ? (source.kind as FrontPageRowKind)
      : "text"

    if (kind === "testimonials") {
      const items = normalizeTestimonials(source.items)
      if (items.length) rows.push({ ...rowBase(), kind, items })
    } else if (kind === "faq") {
      const items = normalizeFaqItems(source.items)
      if (items.length) rows.push({ ...rowBase(), kind, items })
    } else if (kind === "logos") {
      const items = normalizeLogos(source.items)
      if (items.length) rows.push({ ...rowBase(), kind, items })
    } else if (kind === "screenshots") {
      const items = normalizeScreenshots(source.items)
      if (items.length) rows.push({ ...rowBase(), kind, items })
    } else {
      rows.push({ ...rowBase(), kind })
    }
  }

  return rows
}

export function frontPageHasPlans(rows: readonly FrontPageRow[]) {
  return rows.some((row) => row.kind === "plans")
}

export function frontPageRowImageUrls(rows: readonly FrontPageRow[]) {
  return rows.flatMap((row) => {
    if (row.kind === "testimonials") {
      return row.items.flatMap((item) => (item.picture ? [item.picture] : []))
    }
    if (row.kind === "logos" || row.kind === "screenshots") {
      return row.items.map((item) => item.image)
    }
    return []
  })
}
