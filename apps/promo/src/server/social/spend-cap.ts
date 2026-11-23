import { and, eq, sql } from "drizzle-orm"

import { aiUsageMonthStart } from "@/server/ai/usage"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"
import { dollarsText } from "@/lib/social/spend-cap"

import { promoProjects } from "./schema"

/**
 * A project's monthly AI spend cap, from the project's ⋮ (Tyler picked it on
 * 18 Nov 2026, `workspace/tasks/New features/new-features-18-nov.md` part 2).
 *
 * The spend is read off the shell's own meter, `ai_usage_events`, where every
 * Promo call names its project in the row's metadata (`askModel` in
 * `drafts.ts` writes it). The shell table is only read, and the shell's own
 * monthly allowance per person still applies on top: this cap only ever
 * stops a project sooner.
 */

/** This calendar month's AI spend for one project, in whole cents, every network and kind together. */
export async function projectMonthSpendCents(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const [row] = await db
    .select({ cents: sql<number>`coalesce(sum(${customShellAiUsageEvents.costCents}), 0)::int` })
    .from(customShellAiUsageEvents)
    .where(
      and(
        eq(customShellAiUsageEvents.userId, userId),
        eq(customShellAiUsageEvents.monthStart, aiUsageMonthStart(now)),
        sql`${customShellAiUsageEvents.metadata}->>'projectId' = ${projectId}`
      )
    )
  return row?.cents ?? 0
}

/**
 * Refuses an AI call for a project that has reached its cap this month,
 * before anything is sent or counted. A project with no cap, or a call for no
 * project, is let through.
 */
export async function refuseOverProjectCap(
  userId: string,
  projectId: string | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!projectId) return
  const [project] = await db
    .select({ name: promoProjects.name, capCents: promoProjects.aiCapCents })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (!project || project.capCents === null) return
  if ((await projectMonthSpendCents(userId, projectId, db, now)) < project.capCents) return
  throw new Error(
    `${project.name} has used its ${dollarsText(project.capCents)} of AI this month. Raise the cap in the project's ⋮, under AI spend cap.`
  )
}

/** Saves the cap in whole cents, or null for none. */
export async function setProjectAiCap(
  userId: string,
  projectId: string,
  capCents: number | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (capCents !== null && (!Number.isInteger(capCents) || capCents < 0)) {
    throw new Error("The cap is a number of dollars, such as 20.")
  }
  const updated = await db
    .update(promoProjects)
    .set({ aiCapCents: capCents, updatedAt: new Date() })
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .returning({ id: promoProjects.id })
  if (!updated.length) throw new Error("That project does not exist.")
}
