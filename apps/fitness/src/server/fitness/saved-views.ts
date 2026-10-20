import { and, asc, count, eq } from "drizzle-orm"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { HistoryFilters } from "@/lib/fitness/history-filters"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { programFor, type FitnessDb } from "@/server/fitness/access"
import { fitnessSavedViews } from "@/server/fitness/schema"

/** Enough for every way a person slices one program's History, few enough to read in one menu. */
export const SAVED_VIEW_LIMIT = 30

export type SavedView = { id: string; name: string; filters: HistoryFilters }

/**
 * The actor's own saved History views on one program, oldest first. A coach
 * sees their own, never their client's, and the client never sees a coach's.
 */
export async function listSavedViews(actorId: string, programId: string, database: FitnessDb = db): Promise<SavedView[]> {
  await programFor(actorId, programId, database)
  return database
    .select({ id: fitnessSavedViews.id, name: fitnessSavedViews.name, filters: fitnessSavedViews.filters })
    .from(fitnessSavedViews)
    .where(and(eq(fitnessSavedViews.userId, actorId), eq(fitnessSavedViews.programId, programId)))
    .orderBy(asc(fitnessSavedViews.createdAt))
}

export async function saveView(
  actorId: string,
  programId: string,
  name: string,
  filters: HistoryFilters,
  database: FitnessDb = db
): Promise<SavedView> {
  await programFor(actorId, programId, database)
  const trimmed = name.trim()
  if (!trimmed) throw new Error(FITNESS_ERRORS.nameNeeded)
  const [{ total }] = await database
    .select({ total: count() })
    .from(fitnessSavedViews)
    .where(and(eq(fitnessSavedViews.userId, actorId), eq(fitnessSavedViews.programId, programId)))
  if (total >= SAVED_VIEW_LIMIT) throw new Error(FITNESS_ERRORS.tooManyViews)
  const view = { id: uuid(), name: trimmed, filters }
  await database.insert(fitnessSavedViews).values({ ...view, userId: actorId, programId, createdAt: now() })
  return view
}

/** Deletes one of the actor's own views. Anyone else's answers as missing. */
export async function deleteView(actorId: string, viewId: string, database: FitnessDb = db) {
  const removed = await database
    .delete(fitnessSavedViews)
    .where(and(eq(fitnessSavedViews.id, viewId), eq(fitnessSavedViews.userId, actorId)))
    .returning({ id: fitnessSavedViews.id })
  if (removed.length === 0) throw new Error(FITNESS_ERRORS.viewNotFound)
}
