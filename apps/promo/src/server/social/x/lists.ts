import { and, desc, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { xAccountUrl } from "@/lib/social/x/options"
import { xPostingRefusal } from "@/lib/social/x/wording"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { promoAccounts, promoProjects } from "../schema"
import { xListAdd } from "./calls"
import { ownedXFind } from "./finds"
import { readXPostingState, refuseXOnPhone, xWritingAccount } from "./posting"
import { promoXListItems } from "./schema"

/**
 * A public X list on the project's topic (part 36): each X account keeps a
 * list of good accounts on its topic, which is what a real person curating
 * their corner of X looks like. The list is named after the project, and is
 * made the first time an account is put on it. An account goes on from a
 * post it wrote, with Add to list.
 */

export type XListItemView = {
  id: string
  account: { id: string; handle: string }
  handle: string
  name: string
  url: string
  status: typeof promoXListItems.$inferSelect.status
  lastError: string
  addedAt: Date | null
}

export async function listXListItems(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<XListItemView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ item: promoXListItems, handle: promoAccounts.handle })
    .from(promoXListItems)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoXListItems.accountId))
    .where(and(eq(promoXListItems.userId, userId), eq(promoAccounts.projectId, projectId)))
    .orderBy(desc(promoXListItems.createdAt))
    .limit(300)
  return rows.map(({ item, handle }) => ({
    id: item.id,
    account: { id: item.accountId, handle },
    handle: item.handle,
    name: item.name,
    url: xAccountUrl(item.handle),
    status: item.status,
    lastError: item.lastError,
    addedAt: item.addedAt,
  }))
}

/** Puts the account that wrote a found post on the picked account's public list. */
export async function queueXListAdd(
  userId: string,
  input: { accountId: string; findId: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const account = await xWritingAccount(userId, input.accountId, db)
  refuseXOnPhone(account, "Putting an account on an X list")
  // A public list is posting on X, so it waits out the warm-up and the pace too.
  const state = await readXPostingState(userId, account, db)
  const refusal = xPostingRefusal(state, new Date(), state.timeZone)
  if (refusal) throw new Refusal(refusal)
  const find = await ownedXFind(userId, input.findId, db)
  if (!find) throw new Error("That X post is no longer saved.")
  if (find.projectId !== account.projectId) throw new Refusal("That account is not in this post's project.")
  if (!find.authorHandle) throw new Refusal("X did not say who posted this, so they can't be put on a list.")
  if (find.authorHandle.toLowerCase() === account.handle.toLowerCase()) throw new Refusal("That is the account itself.")
  const id = uuid()
  const inserted = await db
    .insert(promoXListItems)
    .values({ id, userId, accountId: account.id, handle: find.authorHandle, name: find.authorName })
    .onConflictDoNothing()
    .returning({ id: promoXListItems.id })
  if (!inserted.length) throw new Refusal(`@${find.authorHandle} is on this account's list already, or on its way.`)
  const jobId = await queueJob(userId, "x_list_add", { listItemId: id, accountId: account.id }, db)
  await db.update(promoXListItems).set({ jobId }).where(eq(promoXListItems.id, id))
  return id
}

/** Adds one account to the list from the account's browser, making the list the first time. */
export async function runXListAdd(
  userId: string,
  listItemId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select({ item: promoXListItems, projectName: promoProjects.name })
    .from(promoXListItems)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoXListItems.accountId))
    .leftJoin(promoProjects, eq(promoProjects.id, promoAccounts.projectId))
    .where(and(eq(promoXListItems.id, listItemId), eq(promoXListItems.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That list entry is not saved any more.")
  if (row.item.status !== "waiting") throw new Refusal("That one has been dealt with already.")
  // X caps a list's name at 25 characters.
  const list = (row.projectName || "Worth following").slice(0, 25)
  try {
    const { done } = await xListAdd(target, { list, handle: row.item.handle })
    if (!done) throw new Error(`Add was pressed, but the list does not show @${row.item.handle}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(promoXListItems).set({ status: "failed", lastError: message.slice(0, 2_000) }).where(eq(promoXListItems.id, row.item.id))
    throw error
  }
  await db.update(promoXListItems).set({ status: "added", addedAt: now, lastError: "" }).where(eq(promoXListItems.id, row.item.id))
}
