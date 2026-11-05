import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import type { SavedViewValues } from "@/lib/saved-views"
import type { CreatorPlatform } from "@/lib/viral/creators"
import type { HookLine } from "@/lib/viral/viral-breakdown"
import { cleanTag } from "@/lib/viral/vault"

/**
 * The Library page (`workspace/docs/library.md`): Hooks, the opening line of
 * every analysed video across all projects, and Formats, the structures saved
 * from analyses. Tyler, 4 Nov 2026: "One Library page".
 */

export const LIBRARY_TABS = ["hooks", "formats"] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

export type LibraryHook = {
  savedVideoId: string
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
  tags: string[]
  analysedAt: string
}

/** Saved views on the Library's Hooks tab (`viral-library:` in the shell's saved views). */
export const LIBRARY_SAVED_VIEW_KIND = "viral-library"

export type LibraryFilters = { q?: string; tag?: string; project?: string }

export function libraryFilters(values: SavedViewValues): LibraryFilters {
  const kept: LibraryFilters = {}
  const q = readSearchText(values.q)?.trim()
  if (q) kept.q = q
  const tag = typeof values.tag === "string" ? cleanTag(values.tag) : ""
  if (tag) kept.tag = tag
  const project = typeof values.project === "string" && /^[\w-]{1,36}$/.test(values.project) ? values.project : ""
  if (project) kept.project = project
  return kept
}

export function readLibraryTab(value: unknown): LibraryTab | undefined {
  return readOneOf(value, LIBRARY_TABS)
}

/**
 * The hooks the filters leave: a picked project keeps the ones it analysed,
 * a tag keeps the ones carrying it, and the search looks in the hook's words,
 * the title and the channel.
 */
export function filterLibraryHooks(hooks: LibraryHook[], filters: LibraryFilters): LibraryHook[] {
  const words = filters.q?.toLowerCase() ?? ""
  const tag = filters.tag?.toLowerCase() ?? ""
  return hooks.filter((hook) => {
    if (filters.project && !hook.projects.some((project) => project.id === filters.project)) return false
    if (tag && !hook.tags.some((one) => one.toLowerCase() === tag)) return false
    if (!words) return true
    return [hook.hook.text, hook.title, hook.channelName].some((text) => text.toLowerCase().includes(words))
  })
}

/** `"mistake" · Tag: Q1` */
export function describeLibraryView(filters: LibraryFilters) {
  return [filters.q ? `"${filters.q}"` : "", filters.tag ? `Tag: ${filters.tag}` : ""].filter(Boolean).join(" · ")
}
