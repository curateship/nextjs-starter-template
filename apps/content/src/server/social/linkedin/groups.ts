import { and, asc, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { linkedinGroupId, linkedinGroupUrl } from "@/lib/social/linkedin/options"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { linkedinGroup } from "./calls"
import { promoLinkedinGroups } from "./schema"
import type { LinkedinReader } from "./search"
import { spendLinkedinViews, waitingLinkedinJobs } from "./searchers"

/**
 * LinkedIn groups a project posts in (part 37), each with its rules. A group
 * is added by pasting its address; a search account reads its name, about
 * words and rules, which the AI is handed before it writes a post there, and
 * a post the rules forbid is refused by the rules check. Rules may also be
 * pasted by hand. Whether the account is a member is only known when it
 * posts: a group that has not let it in refuses Post with one sentence
 * (`publish` in `docker/browser/routines/linkedin.py`).
 */

export type LinkedinGroupView = {
  id: string
  groupId: string
  url: string
  name: string
  description: string
  rules: string
  members: number | null
  rulesReadAt: Date | null
  /** Its rules are being read now. */
  reading: boolean
}

export async function listLinkedinGroups(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<LinkedinGroupView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select()
    .from(promoLinkedinGroups)
    .where(and(eq(promoLinkedinGroups.userId, userId), eq(promoLinkedinGroups.projectId, projectId)))
    .orderBy(asc(promoLinkedinGroups.createdAt))
  const reading = await waitingLinkedinJobs(userId, "linkedin_group", "groupRowId", db)
  return rows.map((row) => ({
    id: row.id,
    groupId: row.groupId,
    url: linkedinGroupUrl(row.groupId),
    name: row.name,
    description: row.description,
    rules: row.rules,
    members: row.members,
    rulesReadAt: row.rulesReadAt,
    reading: reading.has(row.id),
  }))
}

/** Adds a group from its pasted address and asks a search account to read its rules. */
export async function addLinkedinGroup(
  userId: string,
  projectId: string,
  address: string,
  db: CustomShellDb = defaultDb
): Promise<{ id: string; readRefused: string | null }> {
  await ownedProject(userId, projectId, db)
  const groupId = linkedinGroupId(address)
  if (!groupId) throw new Error("Paste the group's address, the one with /groups/ and a number in it.")
  const id = uuid()
  const inserted = await db
    .insert(promoLinkedinGroups)
    .values({ id, userId, projectId, groupId })
    .onConflictDoNothing()
    .returning({ id: promoLinkedinGroups.id })
  if (!inserted.length) throw new Error("This project has that group already.")
  try {
    await queueJob(userId, "linkedin_group", { groupRowId: id }, db)
    return { id, readRefused: null }
  } catch (error) {
    if (error instanceof Refusal) return { id, readRefused: error.message }
    throw error
  }
}

/** Reads a group's rules again. */
export async function queueLinkedinGroupRead(userId: string, groupRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const [row] = await db
    .select({ id: promoLinkedinGroups.id })
    .from(promoLinkedinGroups)
    .where(and(eq(promoLinkedinGroups.id, groupRowId), eq(promoLinkedinGroups.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That group is not saved any more.")
  if ((await waitingLinkedinJobs(userId, "linkedin_group", "groupRowId", db)).has(row.id)) throw new Refusal("Its rules are being read already.")
  await queueJob(userId, "linkedin_group", { groupRowId: row.id }, db)
}

/** Writes rules pasted by hand, for a group whose rules LinkedIn shows only to members. */
export async function saveLinkedinGroupRules(userId: string, groupRowId: string, rules: string, db: CustomShellDb = defaultDb): Promise<void> {
  const updated = await db
    .update(promoLinkedinGroups)
    .set({ rules: rules.trim().slice(0, 8_000) })
    .where(and(eq(promoLinkedinGroups.id, groupRowId), eq(promoLinkedinGroups.userId, userId)))
    .returning({ id: promoLinkedinGroups.id })
  if (!updated.length) throw new Error("That group is not saved any more.")
}

export async function removeLinkedinGroup(userId: string, groupRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoLinkedinGroups)
    .where(and(eq(promoLinkedinGroups.id, groupRowId), eq(promoLinkedinGroups.userId, userId)))
    .returning({ id: promoLinkedinGroups.id })
  if (!removed.length) throw new Error("That group is not saved any more.")
}

/** Reads a group's name, about words and rules through a search account. */
export async function readLinkedinGroup(
  userId: string,
  groupRowId: string,
  reader: LinkedinReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoLinkedinGroups)
    .where(and(eq(promoLinkedinGroups.id, groupRowId), eq(promoLinkedinGroups.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That group is not saved any more.")
  const read = await linkedinGroup(reader.target, { groupId: row.groupId })
  await spendLinkedinViews(reader.searcher.id, read, db, now)
  await db
    .update(promoLinkedinGroups)
    .set({
      name: read.name.slice(0, 200),
      description: read.description.slice(0, 4_000),
      // Rules pasted by hand stay when LinkedIn shows none to a stranger.
      ...(read.rules.trim() ? { rules: read.rules.slice(0, 8_000) } : {}),
      members: read.members,
      rulesReadAt: now,
    })
    .where(eq(promoLinkedinGroups.id, row.id))
}

/** A group of the project, with its rules, for a post going into it. */
export async function projectGroup(
  userId: string,
  projectId: string | null,
  groupId: string,
  db: CustomShellDb = defaultDb
): Promise<typeof promoLinkedinGroups.$inferSelect | null> {
  if (!projectId || !groupId) return null
  const [row] = await db
    .select()
    .from(promoLinkedinGroups)
    .where(and(eq(promoLinkedinGroups.userId, userId), eq(promoLinkedinGroups.projectId, projectId), eq(promoLinkedinGroups.groupId, groupId)))
    .limit(1)
  return row ?? null
}
