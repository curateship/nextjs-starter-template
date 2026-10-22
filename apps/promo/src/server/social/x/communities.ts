import { and, asc, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { xCommunityId, xCommunityUrl } from "@/lib/social/x/options"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { xCommunity } from "./calls"
import { promoXCommunities } from "./schema"
import type { XReader } from "./search"
import { spendViews, waitingXReads } from "./searchers"

/**
 * X communities a project posts in (part 35), each with its rules. A
 * community is added by pasting its address; a search account reads its
 * name, about words and rules, which the AI is handed before it writes a
 * post there. Rules may also be pasted by hand. Whether the account is a
 * member is only known when it posts: a community that has not let it in
 * refuses Post with one sentence (`publish` in `docker/browser/routines/x.py`).
 */

export type XCommunityView = {
  id: string
  communityId: string
  url: string
  name: string
  description: string
  rules: string
  members: number | null
  rulesReadAt: Date | null
  /** Its rules are being read now. */
  reading: boolean
}

export async function listXCommunities(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<XCommunityView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select()
    .from(promoXCommunities)
    .where(and(eq(promoXCommunities.userId, userId), eq(promoXCommunities.projectId, projectId)))
    .orderBy(asc(promoXCommunities.createdAt))
  const reading = await waitingXReads(userId, "x_community", "communityRowId", db)
  return rows.map((row) => ({
    id: row.id,
    communityId: row.communityId,
    url: xCommunityUrl(row.communityId),
    name: row.name,
    description: row.description,
    rules: row.rules,
    members: row.members,
    rulesReadAt: row.rulesReadAt,
    reading: reading.has(row.id),
  }))
}

/** Adds a community from its pasted address and asks a search account to read its rules. */
export async function addXCommunity(
  userId: string,
  projectId: string,
  address: string,
  db: CustomShellDb = defaultDb
): Promise<{ id: string; readRefused: string | null }> {
  await ownedProject(userId, projectId, db)
  const communityId = xCommunityId(address)
  if (!communityId) throw new Error("Paste the community's address, the one with /i/communities/ and a number in it.")
  const id = uuid()
  const inserted = await db
    .insert(promoXCommunities)
    .values({ id, userId, projectId, communityId })
    .onConflictDoNothing()
    .returning({ id: promoXCommunities.id })
  if (!inserted.length) throw new Error("This project has that community already.")
  try {
    await queueJob(userId, "x_community", { communityRowId: id }, db)
    return { id, readRefused: null }
  } catch (error) {
    if (error instanceof Refusal) return { id, readRefused: error.message }
    throw error
  }
}

/** Reads a community's rules again. */
export async function queueXCommunityRead(userId: string, communityRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const [row] = await db
    .select({ id: promoXCommunities.id })
    .from(promoXCommunities)
    .where(and(eq(promoXCommunities.id, communityRowId), eq(promoXCommunities.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That community is not saved any more.")
  if ((await waitingXReads(userId, "x_community", "communityRowId", db)).has(row.id)) {
    throw new Refusal("Its rules are being read already.")
  }
  await queueJob(userId, "x_community", { communityRowId: row.id }, db)
}

/** Writes rules pasted by hand, for a community whose rules X does not show a stranger. */
export async function saveXCommunityRules(
  userId: string,
  communityRowId: string,
  rules: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const updated = await db
    .update(promoXCommunities)
    .set({ rules: rules.trim().slice(0, 8_000) })
    .where(and(eq(promoXCommunities.id, communityRowId), eq(promoXCommunities.userId, userId)))
    .returning({ id: promoXCommunities.id })
  if (!updated.length) throw new Error("That community is not saved any more.")
}

export async function removeXCommunity(userId: string, communityRowId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoXCommunities)
    .where(and(eq(promoXCommunities.id, communityRowId), eq(promoXCommunities.userId, userId)))
    .returning({ id: promoXCommunities.id })
  if (!removed.length) throw new Error("That community is not saved any more.")
}

/** Reads a community's name, about words and rules through a search account. */
export async function readXCommunity(
  userId: string,
  communityRowId: string,
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoXCommunities)
    .where(and(eq(promoXCommunities.id, communityRowId), eq(promoXCommunities.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That community is not saved any more.")
  const read = await xCommunity(reader.target, { communityId: row.communityId })
  await spendViews(reader.searcher.id, read, db, now)
  await db
    .update(promoXCommunities)
    .set({
      name: read.name.slice(0, 200),
      description: read.description.slice(0, 4_000),
      // Rules pasted by hand stay when X shows none to a stranger.
      ...(read.rules.trim() ? { rules: read.rules.slice(0, 8_000) } : {}),
      members: read.members,
      rulesReadAt: now,
    })
    .where(eq(promoXCommunities.id, row.id))
}

/** A community of the project, with its rules, for a post going into it. */
export async function projectCommunity(
  userId: string,
  projectId: string | null,
  communityId: string,
  db: CustomShellDb = defaultDb
): Promise<typeof promoXCommunities.$inferSelect | null> {
  if (!projectId || !communityId) return null
  const [row] = await db
    .select()
    .from(promoXCommunities)
    .where(
      and(eq(promoXCommunities.userId, userId), eq(promoXCommunities.projectId, projectId), eq(promoXCommunities.communityId, communityId))
    )
    .limit(1)
  return row ?? null
}
