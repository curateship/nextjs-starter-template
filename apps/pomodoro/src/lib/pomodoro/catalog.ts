/**
 * The themes and sounds members pick from, as a page receives them. See
 * `workspace/docs/catalog-admin.md`.
 *
 * The list lives in the database (`pomodoro_catalog_items`) and an admin edits
 * it. A page never imports it: the server reads it and sends it with the rest
 * of the page's data, inside the room media bootstrap, so the server and the
 * browser draw from the same list and a Draft or deleted item is simply not in
 * it. Only Live items with a finished file ever reach a member.
 *
 * Nothing here reads the database or the clock; the caller passes what it means
 * by "now".
 */

export type CatalogTheme = {
  key: string
  label: string
  hint: string
  /** "video", "animated" or "static", shown small on the card. */
  descriptor: string
  locked: boolean
  /** Lower-case words members pick by. */
  tags: string[]
  /** The still: the card picture, and what is drawn when a film cannot play. */
  stillUrl: string
  /** A film that loops behind the page, or null for a still. */
  videoUrl: string | null
  publishedAt: string | null
}

export type CatalogSound = {
  key: string
  label: string
  hint: string
  /** "music", "ambient" or "noise". */
  descriptor: string
  locked: boolean
  tags: string[]
  fileUrl: string
  pictureUrl: string | null
  /** Out of 100, multiplied into the member's own volume. */
  volume: number
  publishedAt: string | null
}

export type MediaCatalog = {
  themes: CatalogTheme[]
  sounds: CatalogSound[]
}

export const EMPTY_CATALOG: MediaCatalog = { themes: [], sounds: [] }

/** What a stored key may look like: lower case, digits and dashes. */
export const CATALOG_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

export function findTheme(catalog: MediaCatalog, key: string) {
  return catalog.themes.find((theme) => theme.key === key) ?? null
}

export function findSound(catalog: MediaCatalog, key: string) {
  return catalog.sounds.find((sound) => sound.key === key) ?? null
}

/** How long an item that just went Live wears the NEW label. */
export const NEW_ITEM_DAYS = 14

export function isNewItem(publishedAt: string | null, now: Date) {
  if (!publishedAt) return false
  const age = now.getTime() - new Date(publishedAt).getTime()
  return age >= 0 && age < NEW_ITEM_DAYS * 24 * 60 * 60 * 1000
}

/** The words for a key a new item gets from its name: "Rain on a tin roof" → "rain-on-a-tin-roof". */
export function keyFromLabel(label: string) {
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "")
  return slug || "item"
}
