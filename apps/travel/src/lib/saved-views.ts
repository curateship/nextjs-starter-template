import { z } from "zod"

/**
 * Saved views: a person's own named filters on one dashboard. Opening one puts
 * the same filters in the address as picking them by hand. Nobody else sees
 * them. The shell keeps the table and the limits; the app that owns a screen
 * says who may see it and which filters it keeps (`savedViews.screens` in
 * `src/server/app-options.ts`).
 */

/** One screen's filters: a flat set of plain values, as the address holds them. */
export type SavedViewValues = Record<string, string | number | boolean>

export type SavedView = {
  id: string
  name: string
  filters: SavedViewValues
  /** What the filters pointed at when saved ("Leo", "AI tools"), so a gone one can be named. */
  names: Record<string, string>
}

export const SAVED_VIEW_LIMITS = {
  /** Views one person keeps on one screen. */
  perScreen: 30,
  name: 60,
}

export const SAVED_VIEW_ERRORS = {
  notFound: "That view no longer exists.",
  needsFilters: "Search or pick a filter first, then save it as a view.",
  tooMany: `You can keep at most ${SAVED_VIEW_LIMITS.perScreen} views here. Delete one to save another.`,
  unknownScreen: "Views can't be saved on this screen.",
}

/**
 * A screen key: the kind of dashboard, a colon, and the record it is about,
 * such as `project:<id>`, `my-tasks:<team id>` or `viral-project:<id>`.
 */
const SCREEN_PATTERN = /^([a-z][a-z0-9-]{0,39}):([\w-]{0,36})$/

export function savedViewScreen(kind: string, recordId: string) {
  return `${kind}:${recordId}`
}

export function parseSavedViewScreen(screen: string): { kind: string; recordId: string } | null {
  const match = SCREEN_PATTERN.exec(screen)
  return match ? { kind: match[1], recordId: match[2] } : null
}

const id = z.string().regex(/^[\w-]{1,36}$/)

const viewName = z
  .string()
  .trim()
  .min(1, "Give the view a name.")
  .max(SAVED_VIEW_LIMITS.name, `A view's name can be at most ${SAVED_VIEW_LIMITS.name} characters.`)

/** The values themselves are checked by the screen's own `keep`. */
const values = z.record(
  z.string().max(40),
  z.union([z.string().max(200), z.number(), z.boolean()])
)

export const saveSavedViewSchema = z.object({
  screen: z.string().regex(SCREEN_PATTERN),
  name: viewName,
  filters: values,
})

/** Edit view: a new name and filters for one of the person's views, which stays on its screen. */
export const updateSavedViewSchema = z.object({
  viewId: id,
  name: viewName,
  filters: values,
})

export const deleteSavedViewSchema = z.object({ viewId: id })

export const listSavedViewsSchema = z.object({ screen: z.string().regex(SCREEN_PATTERN) })
