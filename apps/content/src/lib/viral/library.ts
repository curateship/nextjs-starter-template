import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import type { SavedViewValues } from "@/lib/saved-views"
import type { CreatorPlatform } from "@/lib/viral/creators"
import type { HookLine } from "@/lib/viral/viral-breakdown"
import { cleanTag } from "@/lib/viral/vault"

/**
 * The Library page (`workspace/docs/library.md`): Hooks, the opening line of
 * every analysed video across all projects plus the hooks you typed yourself,
 * and Formats, the structures saved from analyses. Tyler, 4 Nov 2026: "One
 * Library page".
 */

export const LIBRARY_TABS = ["hooks", "formats"] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

type HookCommon = {
  /** The saved video's id, or your own hook's id. The page's `?open=`. */
  id: string
  /** The hook's words. */
  text: string
  tags: string[]
  /** A fixed type's key or an own type's id (`hook-types.ts`), or null for no type yet. */
  typeId: string | null
  /** The Outlier badge or a score of 70 or more (`isWinner` in `sounds.ts`). Your own hook is never one, having no numbers. */
  winner: boolean
  /** When it was analysed, or typed, for the newest-first order. */
  at: string
}

/** The opening line of an analysed video. */
export type VideoLibraryHook = HookCommon & {
  kind: "video"
  /** `platform:id`, the project page's open video. */
  key: string
  platform: CreatorPlatform
  title: string
  channelName: string
  thumbnailUrl: string | null
  views: number | null
  hook: HookLine
  /** The projects that analysed it, the latest first. */
  projects: { id: string; name: string }[]
}

/** A hook you typed yourself (task part 8, Tyler: "Words, link, tags"). It is yours, not one project's. */
export type OwnLibraryHook = HookCommon & {
  kind: "own"
  /** Where you heard it, kept only when it starts with http or https. */
  link: string | null
}

export type LibraryHook = VideoLibraryHook | OwnLibraryHook

export type HookKind = LibraryHook["kind"]

export const OWN_HOOK_WORDS_MAX = 500
export const OWN_HOOK_LINK_MAX = 600

/** Only an http or https link is kept, because the panel draws it as a link. */
export function cleanHookLink(value: string): string | null {
  const link = value.trim()
  return /^https?:\/\/\S+$/i.test(link) ? link.slice(0, OWN_HOOK_LINK_MAX) : null
}

/** Five hooks written in a hook's style for one project (task part 6, Tyler: "Kept under the hook"). */
export type HookIdeas = {
  id: string
  projectId: string | null
  projectName: string | null
  hooks: string[]
  createdAt: string
}

/** How many hooks Write hooks like this asks for. */
export const HOOK_IDEAS_COUNT = 5

/** Saved views on the Library's Hooks tab (`viral-library:` in the shell's saved views). */
export const LIBRARY_SAVED_VIEW_KIND = "viral-library"

export type LibraryFilters = { q?: string; tag?: string; type?: string; project?: string }

const ID_SHAPE = /^[\w-]{1,36}$/

export function libraryFilters(values: SavedViewValues): LibraryFilters {
  const kept: LibraryFilters = {}
  const q = readSearchText(values.q)?.trim()
  if (q) kept.q = q
  const tag = typeof values.tag === "string" ? cleanTag(values.tag) : ""
  if (tag) kept.tag = tag
  const type = typeof values.type === "string" && ID_SHAPE.test(values.type) ? values.type : ""
  if (type) kept.type = type
  const project = typeof values.project === "string" && ID_SHAPE.test(values.project) ? values.project : ""
  if (project) kept.project = project
  return kept
}

export function readLibraryTab(value: unknown): LibraryTab | undefined {
  return readOneOf(value, LIBRARY_TABS)
}

/**
 * The hooks the filters leave: a picked project keeps the ones it analysed
 * (your own hooks belong to no project, so they show under All projects
 * only), a tag keeps the ones carrying it, a type the ones of that type, and
 * the search looks in the hook's words, the title, the channel and the link.
 */
export function filterLibraryHooks(hooks: LibraryHook[], filters: LibraryFilters): LibraryHook[] {
  const words = filters.q?.toLowerCase() ?? ""
  const tag = filters.tag?.toLowerCase() ?? ""
  return hooks.filter((hook) => {
    if (filters.project && (hook.kind === "own" || !hook.projects.some((project) => project.id === filters.project))) return false
    if (tag && !hook.tags.some((one) => one.toLowerCase() === tag)) return false
    if (filters.type && hook.typeId !== filters.type) return false
    if (!words) return true
    const texts = hook.kind === "video" ? [hook.text, hook.title, hook.channelName] : [hook.text, hook.link ?? ""]
    return texts.some((text) => text.toLowerCase().includes(words))
  })
}

/** `"mistake" · Tag: Q1 · Type: Question` */
export function describeLibraryView(filters: LibraryFilters, typeLabel?: (id: string) => string | null) {
  const type = filters.type ? (typeLabel?.(filters.type) ?? "a deleted type") : ""
  return [filters.q ? `"${filters.q}"` : "", filters.tag ? `Tag: ${filters.tag}` : "", type ? `Type: ${type}` : ""]
    .filter(Boolean)
    .join(" · ")
}
