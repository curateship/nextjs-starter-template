import { and, eq, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoAccounts, promoProjects } from "./schema"

/**
 * Pausing an account or a whole project.
 *
 * A paused account stays in every list and does not post, warm up or take a
 * health reading until it is resumed. Pausing a project pauses every account
 * in it. Unlike retiring, a pause is meant to end, and resuming puts
 * everything back as it was. A comment pressed before the pause waits, and can
 * still be cancelled.
 */

type PauseFields = Pick<typeof promoAccounts.$inferSelect, "pausedAt" | "projectId">

/** Whether the account is paused, by itself or through its project, or null when it runs. */
export async function pausedBy(
  userId: string,
  account: PauseFields,
  db: CustomShellDb = defaultDb
): Promise<"account" | "project" | null> {
  if (account.pausedAt) return "account"
  if (!account.projectId) return null
  const [project] = await db
    .select({ pausedAt: promoProjects.pausedAt })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, account.projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  return project?.pausedAt ? "project" : null
}

/**
 * Pauses or resumes accounts, in one request. A retired account, or one that
 * is not the person's, is left out and reported as skipped.
 */
export async function setAccountsPaused(
  userId: string,
  accountIds: string[],
  paused: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ completed: string[]; skipped: string[] }> {
  const ids = [...new Set(accountIds)]
  const changed: string[] = []
  for (const id of ids) {
    const rows = await db
      .update(promoAccounts)
      .set({ pausedAt: paused ? now : null, updatedAt: now })
      .where(
        and(
          eq(promoAccounts.id, id),
          eq(promoAccounts.userId, userId),
          isNull(promoAccounts.retiredAt)
        )
      )
      .returning({ id: promoAccounts.id })
    if (rows.length) changed.push(id)
  }
  return { completed: changed, skipped: ids.filter((id) => !changed.includes(id)) }
}

/** Pauses or resumes a whole project, which pauses or resumes every account in it. */
export async function setProjectPaused(
  userId: string,
  projectId: string,
  paused: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const rows = await db
    .update(promoProjects)
    .set({ pausedAt: paused ? now : null, updatedAt: now })
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .returning({ id: promoProjects.id })
  if (!rows.length) throw new Error("That project does not exist.")
}
