import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"
import {
  normalizePublicDevice,
  type PublicDevice,
} from "@/lib/pages/public-device"

export const FRONT_PAGE_ROW_KINDS = [
  "text",
  "hero",
  "plans",
  "testimonials",
  "faq",
  "logos",
  "screenshots",
] as const

export type FrontPageRowKind = (typeof FRONT_PAGE_ROW_KINDS)[number]

export const FRONT_PAGE_ROW_KIND_LABELS: Record<FrontPageRowKind, string> = {
  text: "Plain text",
  hero: "Hero",
  plans: "Plans",
  testimonials: "Testimonials",
  faq: "FAQ",
  logos: "Logo strip",
  screenshots: "Screenshots",
}

export const FRONT_PAGE_ROW_KIND_HINTS: Record<FrontPageRowKind, string> = {
  text: "A heading and one short introduction line.",
  hero: "A large heading, a line beneath it, a button, and an optional picture beside them.",
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

/**
 * Where a row's words and content sit across the page. `inherit` follows
 * Settings > Styling > Content alignment, which is what every row saved before
 * this choice existed does.
 */
export const FRONT_PAGE_ROW_ALIGNMENTS = [
  "inherit",
  "left",
  "center",
  "right",
] as const

export type FrontPageRowAlignment = (typeof FRONT_PAGE_ROW_ALIGNMENTS)[number]

export const FRONT_PAGE_ROW_ALIGNMENT_LABELS: Record<
  FrontPageRowAlignment,
  string
> = {
  inherit: "Follow the site",
  left: "Left",
  center: "Centred",
  right: "Right",
}

export const FRONT_PAGE_ROW_ALIGNMENT_HINTS: Record<
  FrontPageRowAlignment,
  string
> = {
  inherit: "Uses the site's own content alignment setting.",
  left: "This row sits on the left, whatever the site setting says.",
  center: "This row is centred, whatever the site setting says.",
  right: "This row sits on the right, whatever the site setting says.",
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
export const MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH = 60
export const MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH = 2_048
export const MAX_FRONT_PAGE_HERO_NOTE_LENGTH = 160
export const MAX_FRONT_PAGE_HERO_STARS = 5

/** What the hero asks a visitor to do. */
export const FRONT_PAGE_HERO_ACTIONS = ["button", "email"] as const
export type FrontPageHeroAction = (typeof FRONT_PAGE_HERO_ACTIONS)[number]

export const FRONT_PAGE_HERO_ACTION_LABELS: Record<
  FrontPageHeroAction,
  string
> = {
  button: "A button",
  email: "An email form",
}

export const FRONT_PAGE_HERO_ACTION_HINTS: Record<
  FrontPageHeroAction,
  string
> = {
  button: "One button with its own wording and link.",
  email: "A box for an address with the button beside it.",
}

export const FRONT_PAGE_ROW_HEADING_MESSAGE = "Give the row a heading."
export const FRONT_PAGE_HERO_LINK_MESSAGE =
  "A button link starts with /, https://, mailto: or tel:."
export const FRONT_PAGE_ROWS_FULL_MESSAGE =
  `A front page can have ${MAX_FRONT_PAGE_ROWS} rows. Delete one before adding another.`

type FrontPageRowBase = {
  id: string
  heading: string
  intro: string
  layout: FrontPageRowLayout
  /** Where this row sits across the page, or `inherit` to follow the site. */
  alignment: FrontPageRowAlignment
  /**
   * Which parts of the row are drawn. Only an explicit `false` switches a part
   * off, so a row saved before one of these switches existed keeps showing it.
   */
  showHeading: boolean
  showIntro: boolean
  /** Hero only: the picture beside the words. */
  showImage: boolean
  /** Hero only: the button, or the email box and its button. */
  showAction: boolean
  /** Hero only. */
  showStars: boolean
  showNote: boolean
  /** Testimonials only: the face beside each name. */
  showPictures: boolean
  /** Testimonials only: the line under each name. */
  showRoles: boolean
  /** FAQ only: the Q1, Q2 badges. */
  showNumbers: boolean
  /** Screenshots only: the caption under each picture. */
  showCaptions: boolean
  /**
   * Kept out of the public page entirely, so a row can be built over several
   * sittings without visitors watching it take shape. The editor still lists
   * it, marked.
   */
  hidden: boolean
  /** Which screens the row is drawn on. */
  device: PublicDevice
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

/**
 * The stored kind of a row an app added, as opposed to one of the shell's own.
 *
 * One value for all of them, with the app's own key beside it, so the shell's
 * list of kinds stays closed and an app can never take a name the shell later
 * wants. What the row holds is the app's business: the shell keeps it, hands it
 * back to the app's editor and to the app's component, and never reads it.
 */
export const APP_FRONT_PAGE_ROW_KIND = "app"

export const MAX_APP_FRONT_PAGE_ROW_KEY_LENGTH = 64

/** 4,000 characters of JSON per row, which is a page of settings, not a page. */
export const MAX_APP_FRONT_PAGE_ROW_SETTINGS_LENGTH = 4_000

/**
 * What an app row's settings may hold: anything that survives being written to
 * the settings row as JSON and read back out of it. Spelled out rather than
 * `unknown` because that is what it is — a date, a function or a class does not
 * come back as itself, so none of them belongs in a saved row.
 */
export type AppFrontPageRowValue =
  | string
  | number
  | boolean
  | null
  | AppFrontPageRowValue[]
  | { [key: string]: AppFrontPageRowValue }

export type AppFrontPageRowSettings = { [key: string]: AppFrontPageRowValue }

/**
 * What an app's server-side reader fills one of its rows with.
 *
 * The same values as a row's settings, plus a date, because the answer travels
 * through the shell's own serializer rather than through the settings row and
 * that one carries dates. Anything else — a function, a class, a database
 * handle — is not page data.
 */
export type AppFrontPageRowData =
  | AppFrontPageRowValue
  | Date
  | AppFrontPageRowData[]
  | { [key: string]: AppFrontPageRowData }

export type FrontPageRow =
  | (FrontPageRowBase & {
      kind: typeof APP_FRONT_PAGE_ROW_KIND
      /** Which of the app's kinds this is, from its own options. */
      appKind: string
      /** The app's own fields, untouched and unread by the shell. */
      settings: AppFrontPageRowSettings
    })
  | (FrontPageRowBase & { kind: "text" | "plans" })
  | (FrontPageRowBase & {
      kind: "hero"
      /** A button to somewhere, or a box that takes an address. */
      action: FrontPageHeroAction
      /** Empty draws the hero as one column across the page. */
      image: string
      alt: string
      buttonLabel: string
      buttonHref: string
      /** The short line of proof under the button, such as a customer count. */
      note: string
      /** 0 to 5. Drawn before the note, and 0 draws none. */
      stars: number
    })
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

/**
 * A hero button may point at a page in this app or at another site. Anything
 * else, `javascript:` above all, is dropped rather than handed to a browser.
 */
export function normalizeFrontPageHeroHref(value: unknown) {
  const href = cleanText(value, MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH)
  return href && isSafeWrittenPageLink(href) ? href : ""
}

function normalizeFrontPageHeroStars(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(MAX_FRONT_PAGE_HERO_STARS, Math.max(0, Math.round(value)))
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
 * An app row's settings, or null when they are not a plain object this app
 * could have written. Kept as they are — the shell has no idea what they mean —
 * but bounded, because they travel to every visitor inside the page's data.
 */
function appRowSettings(value: unknown): AppFrontPageRowSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return null
  }
  if (json.length > MAX_APP_FRONT_PAGE_ROW_SETTINGS_LENGTH) return null
  return JSON.parse(json) as AppFrontPageRowSettings
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
      alignment: FRONT_PAGE_ROW_ALIGNMENTS.includes(
        source.alignment as FrontPageRowAlignment
      )
        ? (source.alignment as FrontPageRowAlignment)
        : "inherit",
      showHeading: source.showHeading !== false,
      showIntro: source.showIntro !== false,
      showImage: source.showImage !== false,
      showAction: source.showAction !== false,
      showStars: source.showStars !== false,
      showNote: source.showNote !== false,
      showPictures: source.showPictures !== false,
      showRoles: source.showRoles !== false,
      showNumbers: source.showNumbers !== false,
      showCaptions: source.showCaptions !== false,
      // Only an explicit true hides a row. Every row saved before this switch
      // existed has no value at all and has to stay on the page.
      hidden: source.hidden === true,
      device: normalizePublicDevice(source.device),
    } as const
    const rowBase = () => ({
      id: safeId(source.id, `front-page-row-${index + 1}`, usedIds),
      ...base,
    })
    if (source.kind === APP_FRONT_PAGE_ROW_KIND) {
      const appKind = cleanText(
        source.appKind,
        MAX_APP_FRONT_PAGE_ROW_KEY_LENGTH
      )
      // A row whose app kind is not a plain key, or whose settings are not a
      // plain object, is dropped rather than drawn: the app is handed what it
      // saved or nothing at all, never something half-read.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(appKind)) continue
      const settings = appRowSettings(source.settings)
      if (!settings) continue
      rows.push({ ...rowBase(), kind: APP_FRONT_PAGE_ROW_KIND, appKind, settings })
      continue
    }

    const kind = FRONT_PAGE_ROW_KINDS.includes(source.kind as FrontPageRowKind)
      ? (source.kind as FrontPageRowKind)
      : "text"

    if (kind === "hero") {
      const action = FRONT_PAGE_HERO_ACTIONS.includes(
        source.action as FrontPageHeroAction
      )
        ? (source.action as FrontPageHeroAction)
        : "button"
      const buttonHref = normalizeFrontPageHeroHref(source.buttonHref)
      const buttonLabel = cleanText(
        source.buttonLabel,
        MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH
      )
      // An email form needs only its wording; its address box is the link.
      // A button with only half its pair would be a word nobody can press, or
      // a press with no word on it, so there both go or neither does.
      const pairedLabel =
        action === "email" ? buttonLabel : buttonHref ? buttonLabel : ""
      rows.push({
        ...rowBase(),
        kind,
        action,
        image: normalizeFrontPageImageUrl(source.image),
        alt: cleanText(source.alt, MAX_FRONT_PAGE_IMAGE_ALT_LENGTH),
        buttonLabel: pairedLabel,
        buttonHref: action === "email" ? "" : buttonLabel ? buttonHref : "",
        note: cleanText(source.note, MAX_FRONT_PAGE_HERO_NOTE_LENGTH),
        stars: normalizeFrontPageHeroStars(source.stars),
      })
    } else if (kind === "testimonials") {
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

/**
 * The rows a visitor may see. A hidden row is dropped here rather than left in
 * and hidden with a class: a row that is not on the page cannot have its words
 * read out of the page source before it is ready.
 */
export function visibleFrontPageRows(
  rows: readonly FrontPageRow[]
): FrontPageRow[] {
  return rows.filter((row) => !row.hidden)
}

export function frontPageHasPlans(rows: readonly FrontPageRow[]) {
  return rows.some((row) => row.kind === "plans")
}

/**
 * Every picture a row has stored, whether or not it is drawn. The save checks
 * these against the admin's own media library, so a picture switched off in the
 * Visibility card still has to be theirs. Switching it back on must never be a
 * way to show a file that was never checked.
 */
export function frontPageRowImageUrls(rows: readonly FrontPageRow[]) {
  return rows.flatMap((row) => {
    if (row.kind === "hero") {
      return row.image ? [row.image] : []
    }
    if (row.kind === "testimonials") {
      return row.items.flatMap((item) => (item.picture ? [item.picture] : []))
    }
    if (row.kind === "logos" || row.kind === "screenshots") {
      return row.items.map((item) => item.image)
    }
    return []
  })
}
