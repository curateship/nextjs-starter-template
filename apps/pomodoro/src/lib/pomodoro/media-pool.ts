import type {
  CatalogSound,
  CatalogTheme,
  MediaCatalog,
} from "@/lib/pomodoro/catalog"
import type { MediaCredit } from "@/lib/pomodoro/shared-media"

/**
 * A choice that is a group rather than one item: every sound (or theme), or
 * the ones with some tags. See `workspace/docs/shuffle-and-tags.md`.
 *
 * Tyler, 8 Oct 2026: members pick tags as the first tab, or switch on
 * shuffle. Shuffle draws from everything the member's plan allows, never only
 * their tags; picking tags draws from those tags only. The next one comes when
 * the sound ends, and each device picks for itself.
 *
 * Stored in the same columns a single item is, as `shuffle` or
 * `tags:rain,nature`, so nothing that already holds `curated:<key>` changes.
 */

export type MediaPool = { mode: "shuffle" } | { mode: "tags"; tags: string[] }

/** Lower case, digits, spaces and dashes, short enough to be a chip. */
export const TAG_PATTERN = /^[a-z0-9][a-z0-9 -]{0,23}$/
/** The most tags one item carries. */
export const MAX_ITEM_TAGS = 8
/** The longest stored choice, matching the 200-character columns. */
export const MAX_CHOICE_LENGTH = 200

/** " Lo-Fi  Beats " → "lo-fi beats", or null when nothing usable is left. */
export function normalizeTag(raw: string) {
  const tag = raw.trim().toLowerCase().replace(/\s+/g, " ")
  return TAG_PATTERN.test(tag) ? tag : null
}

export function parseMediaPool(value: unknown): MediaPool | null {
  if (value === "shuffle") return { mode: "shuffle" }
  if (typeof value !== "string" || !value.startsWith("tags:")) return null
  const tags = value
    .slice("tags:".length)
    .split(",")
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is string => tag !== null)
  // As many tags as fit the column, which is about twenty of ordinary length.
  const kept: string[] = []
  for (const tag of new Set(tags)) {
    if (!tagsFit([...kept, tag])) break
    kept.push(tag)
  }
  return kept.length ? { mode: "tags", tags: kept } : null
}

/**
 * Whether these tags fit one stored choice. Tyler's 9 Oct design starts with
 * every tag ticked, so the limit is the 200-character column, not a count.
 */
export function tagsFit(tags: string[]) {
  return serializeMediaPool({ mode: "tags", tags }).length <= MAX_CHOICE_LENGTH
}

export function serializeMediaPool(pool: MediaPool) {
  return pool.mode === "shuffle" ? "shuffle" : `tags:${[...pool.tags].sort().join(",")}`
}

export function samePool(a: MediaPool | null, b: MediaPool | null) {
  if (!a || !b) return a === b
  return serializeMediaPool(a) === serializeMediaPool(b)
}

function inPool<T extends { tags: string[]; locked: boolean }>(
  items: T[],
  pool: MediaPool,
  canUsePremium: boolean
) {
  return items.filter(
    (item) =>
      (canUsePremium || !item.locked) &&
      (pool.mode === "shuffle" || item.tags.some((tag) => pool.tags.includes(tag)))
  )
}

export function poolSounds(
  catalog: MediaCatalog,
  pool: MediaPool,
  canUsePremium: boolean
): CatalogSound[] {
  return inPool(catalog.sounds, pool, canUsePremium)
}

export function poolThemes(
  catalog: MediaCatalog,
  pool: MediaPool,
  canUsePremium: boolean
): CatalogTheme[] {
  return inPool(catalog.themes, pool, canUsePremium)
}

/**
 * One of the member's own ready files, as shuffle sees it (uploads-and-sharing
 * task 08, Part 1). Only files with at least one tag are sent, because a file
 * joins a group through its tags and nothing else.
 */
export type OwnPoolFile = {
  mediaId: string
  name: string
  tags: string[]
  url: string
  kind: "image" | "video" | "audio"
  /** Who made a saved file, so the player credits them (task 03, part 4). */
  credit?: MediaCredit | null
}

export type OwnPoolMedia = { sounds: OwnPoolFile[]; backgrounds: OwnPoolFile[] }

export const NO_OWN_POOL_MEDIA: OwnPoolMedia = { sounds: [], backgrounds: [] }

/**
 * The member's own files in a group. Only a ticked tag brings them in: plain
 * shuffle ("All tags") stays the catalogue's, so nobody who has not ticked
 * one of their own tags hears or sees anything different from before.
 */
export function poolOwnFiles(files: OwnPoolFile[], pool: MediaPool) {
  return pool.mode === "tags"
    ? files.filter((file) => file.tags.some((tag) => pool.tags.includes(tag)))
    : []
}

/**
 * The tags only the member's own files carry, for the "Your files" group of
 * the filter. A tag the catalogue also has is one tag, listed with the
 * catalogue's, so it is left out here.
 */
export function ownOnlyTags(files: OwnPoolFile[], catalogTagNames: string[]) {
  const counts = new Map<string, number>()
  for (const file of files) {
    for (const tag of file.tags) {
      if (catalogTagNames.includes(tag)) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
}

/** How many of the member's own files carry a tag. */
export function ownTagCount(files: OwnPoolFile[], tag: string) {
  return files.filter((file) => file.tags.includes(tag)).length
}

/**
 * One item from a group, never the one playing now when there is another to
 * play, so shuffle never repeats itself back to back.
 */
export function pickFromPool<T extends { key: string }>(
  items: T[],
  random: () => number = Math.random,
  avoidKey: string | null = null
): T | null {
  const choices =
    items.length > 1 && avoidKey ? items.filter((item) => item.key !== avoidKey) : items
  if (!choices.length) return null
  return choices[Math.floor(random() * choices.length) % choices.length] ?? null
}

/**
 * Every tag on Live items, for the chips: how many items carry it, and how
 * many of those are free, so a free account can be told which are Pro only.
 */
export function catalogTags(items: { tags: string[]; locked: boolean }[]) {
  const counts = new Map<string, { count: number; free: number }>()
  for (const item of items) {
    for (const tag of item.tags) {
      const entry = counts.get(tag) ?? { count: 0, free: 0 }
      entry.count += 1
      if (!item.locked) entry.free += 1
      counts.set(tag, entry)
    }
  }
  return [...counts.entries()]
    .map(([tag, entry]) => ({ tag, ...entry }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
}

/** "rain or nature", for the line that says what the tags will play. */
export function describeTags(tags: string[]) {
  if (tags.length <= 1) return tags[0] ?? ""
  return `${tags.slice(0, -1).join(", ")} or ${tags.at(-1)}`
}

/**
 * The cards with any ticked tag, or every card when every tag is ticked (null).
 * A ticked tag no card carries is one of the member's own (see
 * `ownOnlyTags`) and filters nothing, so ticking only those keeps every card.
 */
export function filterByTags<T extends { tags: string[] }>(
  items: T[],
  ticked: string[] | null
) {
  const known = ticked?.filter((tag) => items.some((item) => item.tags.includes(tag))) ?? []
  return known.length
    ? items.filter((item) => item.tags.some((tag) => known.includes(tag)))
    : items
}

/** The tags a page opens with ticked: the shuffle's own, else every tag (null). */
export function tickedFromPool(pool: MediaPool | null) {
  return pool?.mode === "tags" ? pool.tags : null
}
