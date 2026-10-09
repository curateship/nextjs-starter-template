import { labelFromFilename, type CatalogKind } from "@/lib/pomodoro/admin-catalog"

/**
 * Reading a pasted pixabay.com link, in the browser as the admin types and
 * again on the server. See "Import from Pixabay" in
 * `workspace/docs/catalog-admin.md`.
 *
 * A link is `pixabay.com/<section>/<slug>-<id>/`, with an optional two-letter
 * language in front of the section. The query string is ignored. Every refusal
 * is worded to follow "Line 4", so the window and the result line say
 * "Line 4 is not a pixabay.com link."
 */

/** Pictures, films and sounds each count their ids on their own. */
type PixabayFamily = "image" | "video" | "audio"

type Section = {
  family: PixabayFamily
  /** The page the link belongs on, or null when no page takes it. */
  page: CatalogKind | null
  descriptor: "static" | "video" | "music" | "ambient"
  /** How the item is named in a refusal: "is a photo, paste it on Themes". */
  noun: string
}

const SECTIONS: Record<string, Section> = {
  photos: { family: "image", page: "theme", descriptor: "static", noun: "a photo" },
  illustrations: {
    family: "image",
    page: "theme",
    descriptor: "static",
    noun: "an illustration",
  },
  vectors: { family: "image", page: null, descriptor: "static", noun: "a vector" },
  videos: { family: "video", page: "theme", descriptor: "video", noun: "a film" },
  music: { family: "audio", page: "sound", descriptor: "music", noun: "a music link" },
  // Pixabay's rain and fire loops live here, so they come in as ambient.
  "sound-effects": {
    family: "audio",
    page: "sound",
    descriptor: "ambient",
    noun: "a sound effect",
  },
}

type PixabayLink = {
  id: string
  family: PixabayFamily
  /** `https://pixabay.com/<section>/<slug>-<id>/`, stored as the source link. */
  pageUrl: string
  label: string
  descriptor: Section["descriptor"]
}

type PixabayAddress =
  | { ok: true; link: PixabayLink; section: Section }
  | { ok: false; reason: string }

type PixabayLinkResult =
  | { ok: true; link: PixabayLink }
  | { ok: false; reason: string }

const NOT_PIXABAY = "is not a pixabay.com link"
const NOT_ONE_ITEM = "is a search, not one item"

/** The item a link names, whatever page it was pasted on. */
export function readPixabayAddress(raw: string): PixabayAddress {
  const text = raw.trim()
  if (/^\d+$/.test(text)) return { ok: false, reason: "is a number, not the page link" }

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return { ok: false, reason: NOT_PIXABAY }
  }
  const host = url.hostname.toLowerCase()
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    (host !== "pixabay.com" && host !== "www.pixabay.com")
  )
    return { ok: false, reason: NOT_PIXABAY }

  let segments: string[]
  try {
    segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment).toLowerCase())
  } catch {
    return { ok: false, reason: NOT_PIXABAY }
  }
  if (segments.length === 3 && /^[a-z]{2}$/.test(segments[0])) segments.shift()
  if (segments.length !== 2) return { ok: false, reason: NOT_ONE_ITEM }

  const [sectionName, item] = segments
  const match = /^([\p{L}\p{N}-]+?)-(\d+)$/u.exec(item)
  // A profile, `/users/<name>-<id>/`, has the shape of an item and is a list.
  if (!match || sectionName === "users") return { ok: false, reason: NOT_ONE_ITEM }
  const section = SECTIONS[sectionName]
  if (!section)
    return { ok: false, reason: "is a kind of Pixabay item neither page takes" }

  const [, slug, id] = match
  return {
    ok: true,
    section,
    link: {
      id,
      family: section.family,
      pageUrl: `https://pixabay.com/${sectionName}/${slug}-${id}/`,
      // Pixabay's own API answers with `/videos/id-11722/`, which has no words.
      label: slug === "id" ? `Pixabay ${id}` : labelFromSlug(slug),
      descriptor: section.descriptor,
    },
  }
}

/** The item a link names, or why the Themes or Sounds page refuses it. */
export function readPixabayLink(raw: string, kind: CatalogKind): PixabayLinkResult {
  const address = readPixabayAddress(raw)
  if (!address.ok) return address
  const { section, link } = address
  // Tyler, 9 Oct 2026: a vector is refused on both pages.
  if (section.page === null)
    return { ok: false, reason: "is a vector, and vectors are not used as themes" }
  if (section.page !== kind)
    return {
      ok: false,
      reason: `is ${section.noun}, paste it on ${section.page === "theme" ? "Themes" : "Sounds"}`,
    }
  return { ok: true, link }
}

/** One key per Pixabay item, for spotting the same item pasted twice. */
export function pixabayItemKey(link: Pick<PixabayLink, "family" | "id">) {
  return `${link.family}:${link.id}`
}

export type PixabayLine = { line: number; url: string }
type PixabayLineResult = PixabayLine & PixabayLinkResult

/**
 * Every line of a pasted list, in order. The second copy of an item is
 * refused with the line it repeats, so the first copy is the one imported.
 */
export function readPixabayLines(
  lines: PixabayLine[],
  kind: CatalogKind
): PixabayLineResult[] {
  const seen = new Map<string, number>()
  return lines.map(({ line, url }) => {
    const result = readPixabayLink(url, kind)
    if (!result.ok) return { line, url, ...result }
    const key = pixabayItemKey(result.link)
    const first = seen.get(key)
    if (first !== undefined) return { line, url, ok: false, reason: `repeats line ${first}` }
    seen.set(key, line)
    return { line, url, ...result }
  })
}

/** The textarea's lines that hold anything, numbered as the admin sees them. */
export function splitPixabayText(text: string): PixabayLine[] {
  return text
    .split("\n")
    .map((url, index) => ({ line: index + 1, url: url.trim() }))
    .filter((entry) => entry.url)
}

/** "Line 4 is not a pixabay.com link." */
export function describePixabayRefusal(refusal: { line: number; reason: string }) {
  return `Line ${refusal.line} ${refusal.reason}.`
}

/**
 * A sound imported from a Pixabay link that still has no file. Pixabay's
 * music cannot be fetched, so the admin downloads the MP3 from the link and
 * drops it in the sound's window.
 */
export function waitsForPixabayFile(item: {
  kind: CatalogKind
  fileUrl: string | null
  fileStatus: string
  sourceUrl: string | null
}) {
  return (
    item.kind === "sound" &&
    !item.fileUrl &&
    // Not while an MP3 the admin dropped is being prepared; again if it was refused.
    item.fileStatus !== "queued" &&
    item.fileStatus !== "processing" &&
    Boolean(item.sourceUrl && readPixabayAddress(item.sourceUrl).ok)
  )
}

/**
 * The name a Draft starts with: the slug as a filename would be read, with a
 * word repeated back to back said once, because a music slug starts with its
 * genre ("lofi-lofi-chill-vlog-beats" reads "Lofi chill vlog beats").
 */
function labelFromSlug(slug: string) {
  const words = slug.split("-").filter(Boolean)
  const once = words.filter((word, index) => word !== words[index - 1])
  return labelFromFilename(once.join(" "))
}
