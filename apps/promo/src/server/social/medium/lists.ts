import { and, desc, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { mediumStoryUrl } from "@/lib/social/medium/options"
import { mediumPostingRefusal } from "@/lib/social/medium/wording"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { promoAccounts, promoProjects } from "../schema"
import { mediumAddToList } from "./calls"
import { ownedMediumFind } from "./finds"
import { promoMediumArticles, promoMediumListItems } from "./schema"
import { readMediumPostingState, refuseOnPhone, writingAccount } from "./posting"

/**
 * A public Medium list on the project's topic (part 34): each Medium account
 * keeps a reading list of good stories, its own articles among them. The
 * list is named after the project. Most of it should be other writers'
 * stories, or it reads as an advert, so the section says how many of the
 * list are the account's own.
 */

export type ListItemView = {
  id: string
  account: { id: string; handle: string }
  title: string
  storyUrl: string
  own: boolean
  status: typeof promoMediumListItems.$inferSelect.status
  lastError: string
  addedAt: Date | null
}

export async function listMediumListItems(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<ListItemView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ item: promoMediumListItems, handle: promoAccounts.handle })
    .from(promoMediumListItems)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoMediumListItems.accountId))
    .where(and(eq(promoMediumListItems.userId, userId), eq(promoAccounts.projectId, projectId)))
    .orderBy(desc(promoMediumListItems.createdAt))
    .limit(300)
  return rows.map(({ item, handle }) => ({
    id: item.id,
    account: { id: item.accountId, handle },
    title: item.title,
    storyUrl: item.storyUrl,
    own: item.own,
    status: item.status,
    lastError: item.lastError,
    addedAt: item.addedAt,
  }))
}

/** Puts a found story, or one of the account's own articles, on the account's Medium list. */
export async function queueAddToList(
  userId: string,
  input: { accountId: string; findId?: string; articleId?: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const account = await writingAccount(userId, input.accountId, db)
  refuseOnPhone(account, "Putting a story on a Medium list")
  // A public list is writing on Medium, so it waits out the warm-up and the pace too.
  const state = await readMediumPostingState(userId, account, db)
  const refusal = mediumPostingRefusal(state, new Date(), state.timeZone)
  if (refusal) throw new Refusal(refusal)
  let story: { storyId: string; url: string; title: string; own: boolean }
  if (input.findId) {
    const find = await ownedMediumFind(userId, input.findId, db)
    if (!find) throw new Error("That Medium story is no longer saved.")
    if (find.projectId !== account.projectId) throw new Refusal("That account is not in this story's project.")
    story = { storyId: find.storyId, url: find.url, title: find.title, own: false }
  } else if (input.articleId) {
    const [article] = await db
      .select()
      .from(promoMediumArticles)
      .where(and(eq(promoMediumArticles.id, input.articleId), eq(promoMediumArticles.userId, userId)))
      .limit(1)
    if (!article || article.status !== "published" || !article.storyId) throw new Refusal("Only a published article can go on a list.")
    story = { storyId: article.storyId, url: article.url || mediumStoryUrl(article.storyId), title: article.title, own: article.accountId === account.id }
  } else {
    throw new Error("Name the story to put on the list.")
  }
  const [already] = await db
    .select({ id: promoMediumListItems.id, status: promoMediumListItems.status })
    .from(promoMediumListItems)
    .where(and(eq(promoMediumListItems.accountId, account.id), eq(promoMediumListItems.storyId, story.storyId)))
    .limit(1)
  if (already && already.status !== "failed") throw new Refusal("That story is on this account's list already, or on its way there.")
  const id = already?.id ?? uuid()
  const jobId = uuid()
  if (already) {
    await db.update(promoMediumListItems).set({ status: "waiting", jobId, lastError: "" }).where(eq(promoMediumListItems.id, id))
  } else {
    await db.insert(promoMediumListItems).values({
      id,
      userId,
      accountId: account.id,
      storyId: story.storyId,
      storyUrl: story.url.slice(0, 600),
      title: story.title.slice(0, 600),
      own: story.own,
      jobId,
    })
  }
  await queueJob(userId, "medium_list_add", { listItemId: id, accountId: account.id }, db, null, jobId)
  return id
}

/** Runs one add in the account's browser. The list is named after the account's project. */
export async function runAddToList(
  userId: string,
  listItemId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select({ item: promoMediumListItems, projectName: promoProjects.name })
    .from(promoMediumListItems)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoMediumListItems.accountId))
    .leftJoin(promoProjects, eq(promoProjects.id, promoAccounts.projectId))
    .where(and(eq(promoMediumListItems.id, listItemId), eq(promoMediumListItems.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That list item was taken away.")
  try {
    const { done } = await mediumAddToList(target, { storyId: row.item.storyId, list: row.projectName || "Reading list" })
    if (!done) throw new Error("The list did not say the story was added.")
    await db.update(promoMediumListItems).set({ status: "added", addedAt: now, lastError: "" }).where(eq(promoMediumListItems.id, listItemId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(promoMediumListItems).set({ status: "failed", lastError: message.slice(0, 1_000) }).where(eq(promoMediumListItems.id, listItemId))
    throw error
  }
}
