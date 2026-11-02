import { and, asc, count, eq, inArray } from "drizzle-orm"
import type { z } from "zod"

import {
  parseSavedViewScreen,
  SAVED_VIEW_ERRORS,
  SAVED_VIEW_LIMITS,
  type SavedView,
  type saveSavedViewSchema,
  type updateSavedViewSchema,
} from "@/lib/saved-views"
import { appSavedViewScreens, type SavedViewScreen } from "@/server/app-options"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSavedViews } from "@/server/schema"

/**
 * Saved views: a person's own named filters on one dashboard. Only their
 * person lists, saves, edits or deletes them, and the app that owns the
 * screen's kind decides who may keep views on which record and which filters
 * a view keeps (`savedViews.screens` in `src/app/server-options.ts`).
 */

type Database =
  | CustomShellDb
  | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

type Screens = Record<string, SavedViewScreen>

/**
 * The person's views on one screen, oldest first. No access check of its own:
 * the screen's loader has already decided the person may see the record.
 */
export async function listSavedViews(
  userId: string,
  screen: string,
  database: Database = db
): Promise<SavedView[]> {
  return database
    .select({
      id: customShellSavedViews.id,
      name: customShellSavedViews.name,
      filters: customShellSavedViews.filters,
      names: customShellSavedViews.names,
    })
    .from(customShellSavedViews)
    .where(and(eq(customShellSavedViews.userId, userId), eq(customShellSavedViews.screen, screen)))
    .orderBy(asc(customShellSavedViews.createdAt))
}

/** The screen's own rules for a key, or a refusal for a kind the app never named. */
function screenFor(screen: string, screens: Screens) {
  const parsed = parseSavedViewScreen(screen)
  const rules = parsed ? screens[parsed.kind] : undefined
  if (!parsed || !rules) throw new Error(SAVED_VIEW_ERRORS.unknownScreen)
  return { recordId: parsed.recordId, rules }
}

/** The filters the screen keeps, refused when that is nothing, and the names they point at. */
async function keptView(
  userId: string,
  recordId: string,
  rules: SavedViewScreen,
  given: z.output<typeof saveSavedViewSchema>["filters"],
  database: Database
) {
  await rules.authorize({ userId, recordId, database })
  const filters = rules.keep({ recordId, filters: given })
  if (Object.keys(filters).length === 0) throw new Error(SAVED_VIEW_ERRORS.needsFilters)
  const names = rules.namesOf ? await rules.namesOf({ userId, recordId, filters, database }) : {}
  return { filters, names }
}

export async function saveSavedView(
  userId: string,
  input: z.output<typeof saveSavedViewSchema>,
  database: Database = db,
  screens: Screens = appSavedViewScreens()
): Promise<SavedView> {
  const { recordId, rules } = screenFor(input.screen, screens)
  const { filters, names } = await keptView(userId, recordId, rules, input.filters, database)

  const [{ total }] = await database
    .select({ total: count() })
    .from(customShellSavedViews)
    .where(
      and(eq(customShellSavedViews.userId, userId), eq(customShellSavedViews.screen, input.screen))
    )
  if (total >= SAVED_VIEW_LIMITS.perScreen) throw new Error(SAVED_VIEW_ERRORS.tooMany)

  const at = now()
  const view = {
    id: uuid(),
    userId,
    screen: input.screen,
    name: input.name,
    filters,
    names,
    createdAt: at,
    updatedAt: at,
  }
  await database.insert(customShellSavedViews).values(view)
  return { id: view.id, name: view.name, filters, names }
}

/**
 * Edit view: the name and filters of one of the person's own views. It stays
 * on its screen, and the person must still be allowed there.
 */
export async function updateSavedView(
  userId: string,
  input: z.output<typeof updateSavedViewSchema>,
  database: Database = db,
  screens: Screens = appSavedViewScreens()
): Promise<SavedView> {
  const [row] = await database
    .select({ screen: customShellSavedViews.screen })
    .from(customShellSavedViews)
    .where(and(eq(customShellSavedViews.id, input.viewId), eq(customShellSavedViews.userId, userId)))
  if (!row) throw new Error(SAVED_VIEW_ERRORS.notFound)
  const { recordId, rules } = screenFor(row.screen, screens)
  const { filters, names } = await keptView(userId, recordId, rules, input.filters, database)
  await database
    .update(customShellSavedViews)
    .set({ name: input.name, filters, names, updatedAt: now() })
    .where(and(eq(customShellSavedViews.id, input.viewId), eq(customShellSavedViews.userId, userId)))
  return { id: input.viewId, name: input.name, filters, names }
}

export async function deleteSavedView(userId: string, viewId: string, database: Database = db) {
  const deleted = await database
    .delete(customShellSavedViews)
    .where(and(eq(customShellSavedViews.id, viewId), eq(customShellSavedViews.userId, userId)))
    .returning({ id: customShellSavedViews.id })
  if (deleted.length === 0) throw new Error(SAVED_VIEW_ERRORS.notFound)
}

/**
 * Clears the views on screens whose record has gone, or that one person can no
 * longer reach (they left a project or a team). The table cannot cascade from
 * an app's record, so the app calls this where it deletes or removes.
 */
export async function deleteSavedViewsFor(
  { userId, screens }: { userId?: string; screens: string[] },
  database: Database = db
) {
  if (screens.length === 0) return
  await database
    .delete(customShellSavedViews)
    .where(
      and(
        inArray(customShellSavedViews.screen, screens),
        userId ? eq(customShellSavedViews.userId, userId) : undefined
      )
    )
}
