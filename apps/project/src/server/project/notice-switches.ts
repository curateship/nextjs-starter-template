import { and, eq } from "drizzle-orm"

import { isNoticeSwitchId, type NoticeSwitchId } from "@/lib/project/notice-switches"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireMembership, type ProjectDb } from "@/server/project/access"
import { projectNoticesOff } from "@/server/project/schema"

/**
 * Each person's own bell notice switches, on My dashboard. Only the person
 * reads or changes theirs. The bell checks them as each notice is written
 * (`withoutSwitchedOff` in `notices.ts`).
 */

/** The kinds this person has switched off. */
export async function loadNoticesOff(userId: string, database: ProjectDb = db): Promise<NoticeSwitchId[]> {
  const rows = await database
    .select({ kind: projectNoticesOff.kind })
    .from(projectNoticesOff)
    .where(eq(projectNoticesOff.userId, userId))
  return rows.map((row) => row.kind).filter(isNoticeSwitchId)
}

/** Switches one kind on or off for this person. Saving what is already saved changes nothing. */
export async function setNoticeSwitch(
  userId: string,
  input: { id: NoticeSwitchId; on: boolean },
  database = db
) {
  await requireMembership(userId, database)
  if (input.on) {
    await database
      .delete(projectNoticesOff)
      .where(and(eq(projectNoticesOff.userId, userId), eq(projectNoticesOff.kind, input.id)))
    return
  }
  await database
    .insert(projectNoticesOff)
    .values({ userId, kind: input.id, createdAt: now() })
    .onConflictDoNothing()
}
