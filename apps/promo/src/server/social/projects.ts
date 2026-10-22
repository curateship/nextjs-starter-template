import { and, asc, count, eq, isNull, max, notInArray } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { AccountImportance } from "@/lib/social/importance"
import { postPhone, type PostPhone } from "@/server/phones/phones"
import { promoProfiles } from "@/server/browser/schema"
import { isOwnedImageUrl } from "@/server/media/library"
import { commentReadiness, type AccountStatusView } from "@/lib/social/account-status"
import { isNetwork, NETWORK_NAMES, type Network } from "@/lib/social/networks"

import { accountStatuses } from "./account-list"
import { refuseMixedProject } from "./apart"
import { jobCounts, type JobCounts } from "./jobs"
import { shownFind } from "./keywords"
import { readPostingState, type PostingState } from "./posting"
import { promoMediumKeywords } from "./medium/schema"
import { promoXKeywords } from "./x/schema"
import {
  promoAccounts,
  promoComments,
  promoFinds,
  promoKeywords,
  promoProjects,
  promoVoices,
} from "./schema"

/**
 * Projects: one thing being promoted, with its description, its Reddit
 * accounts and its keywords. The Projects dashboard is where they come
 * together.
 *
 * Tyler, 12 Oct 2026: keywords belong to the project, so every account in it
 * sees the same posts, and clicking an account only changes who comments. An
 * account belongs to one project only. The description is what the AI is told
 * about what you make, in place of the voice's old product box.
 *
 * Every query is scoped by the person's id, and that filter is the ownership
 * check: a foreign id finds nothing and changes nothing.
 */

const NAME_MAX = 120
const DESCRIPTION_MAX = 4_000

/** One project as a row on the Projects table dashboard. */
export type ProjectRow = {
  id: string
  name: string
  description: string
  /** Accounts in use; a retired account is not counted. */
  accountCount: number
  keywordCount: number
  /** Posts under its keywords neither skipped nor replied to: the To look at tab's count. */
  waitingCount: number
  /** Comments sent from its accounts that reached Reddit. */
  commentCount: number
  lastCommentAt: Date | null
  updatedAt: Date
}

/**
 * Every project with what it holds, for the Projects table dashboard. One
 * read per figure across every project, never one per row.
 */
export async function listProjectRows(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<ProjectRow[]> {
  const projects = await db
    .select()
    .from(promoProjects)
    .where(eq(promoProjects.userId, userId))
    .orderBy(asc(promoProjects.createdAt), asc(promoProjects.id))
  if (!projects.length) return []

  const accounts = await db
    .select({ projectId: promoAccounts.projectId, n: count() })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), isNull(promoAccounts.retiredAt)))
    .groupBy(promoAccounts.projectId)
  const keywords = await db
    .select({ projectId: promoKeywords.projectId, n: count() })
    .from(promoKeywords)
    .where(eq(promoKeywords.userId, userId))
    .groupBy(promoKeywords.projectId)
  const waiting = await db
    .select({ projectId: promoKeywords.projectId, n: count() })
    .from(promoFinds)
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(
      and(
        eq(promoFinds.userId, userId),
        notInArray(promoFinds.status, ["commented", "skipped"]),
        shownFind(userId)
      )
    )
    .groupBy(promoKeywords.projectId)
  // Counted by the account that sent each comment, so a comment stays with
  // the project its account is in now.
  const comments = await db
    .select({ projectId: promoAccounts.projectId, n: count(), last: max(promoComments.postedAt) })
    .from(promoComments)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(and(eq(promoComments.userId, userId), eq(promoComments.status, "posted")))
    .groupBy(promoAccounts.projectId)

  const byProject = <T extends { projectId: string | null }>(rows: T[]) =>
    new Map(rows.filter((row) => row.projectId).map((row) => [row.projectId as string, row]))
  const accountsBy = byProject(accounts)
  const keywordsBy = byProject(keywords)
  const waitingBy = byProject(waiting)
  const commentsBy = byProject(comments)

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    accountCount: accountsBy.get(project.id)?.n ?? 0,
    keywordCount: keywordsBy.get(project.id)?.n ?? 0,
    waitingCount: waitingBy.get(project.id)?.n ?? 0,
    commentCount: commentsBy.get(project.id)?.n ?? 0,
    lastCommentAt: commentsBy.get(project.id)?.last ?? null,
    updatedAt: project.updatedAt,
  }))
}

function cleanName(name: string): string {
  const cleaned = name.trim().slice(0, NAME_MAX)
  if (!cleaned) throw new Error("A project needs a name.")
  return cleaned
}

/**
 * Makes a project using the networks ticked in the New project window. A
 * project may start with none and have them added on its dashboard.
 */
export async function createProject(
  userId: string,
  name: string,
  db: CustomShellDb = defaultDb,
  networks: Network[] = []
): Promise<string> {
  const id = uuid()
  await db.insert(promoProjects).values({ id, userId, name: cleanName(name), networks: [...new Set(networks)] })
  return id
}

/** The networks a project uses, leaving out any Promo no longer offers. */
function usedNetworks(project: typeof promoProjects.$inferSelect): Network[] {
  return project.networks.filter(isNetwork)
}

/** Adds a network to a project, at the end of its list. */
export async function addProjectNetwork(
  userId: string,
  projectId: string,
  network: Network,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!isNetwork(network)) throw new Error("Promo cannot use that network yet.")
  const project = await ownedProject(userId, projectId, db)
  const networks = usedNetworks(project)
  if (networks.includes(network)) {
    throw new Error(`${project.name} already uses ${NETWORK_NAMES[network]}.`)
  }
  await db
    .update(promoProjects)
    .set({ networks: [...networks, network], updatedAt: new Date() })
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
}

/**
 * Takes a network off a project. Refused, with how many of each, while the
 * project still holds that network's accounts or keywords, worded like
 * deleting a project. Reddit, Medium and X have keywords; the phone apps none.
 */
export async function removeProjectNetwork(
  userId: string,
  projectId: string,
  network: Network,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const project = await ownedProject(userId, projectId, db)
  const networks = usedNetworks(project)
  if (!networks.includes(network)) return
  const [accounts] = await db
    .select({ n: count() })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.projectId, projectId),
        eq(promoAccounts.platform, network),
        isNull(promoAccounts.retiredAt)
      )
    )
  const [keywords] =
    network === "reddit"
      ? await db.select({ n: count() }).from(promoKeywords).where(eq(promoKeywords.projectId, projectId))
      : network === "medium"
        ? await db.select({ n: count() }).from(promoMediumKeywords).where(eq(promoMediumKeywords.projectId, projectId))
        : network === "x"
          ? await db.select({ n: count() }).from(promoXKeywords).where(eq(promoXKeywords.projectId, projectId))
          : [{ n: 0 }]
  const held = [
    accounts.n ? `${accounts.n} ${NETWORK_NAMES[network]} ${accounts.n === 1 ? "account" : "accounts"}` : "",
    keywords.n ? `${keywords.n} ${keywords.n === 1 ? "keyword" : "keywords"}` : "",
  ].filter(Boolean)
  if (held.length) {
    const steps = [accounts.n ? "take its accounts out" : "", keywords.n ? "remove its keywords" : ""].filter(Boolean)
    const first = steps.join(" and ")
    throw new Error(
      `${project.name} still holds ${held.join(" and ")}. ${first.charAt(0).toUpperCase()}${first.slice(1)} first, then take ${NETWORK_NAMES[network]} off.`
    )
  }
  await db
    .update(promoProjects)
    .set({ networks: networks.filter((item) => item !== network), updatedAt: new Date() })
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
}

/**
 * Saves the name, the description or the picture. Used as each one changes.
 *
 * The picture is drawn back on the dashboard, so like the shell's own profile
 * photo it has to be an image this person uploaded, never any address the
 * browser sent. "" takes it off.
 */
export async function updateProject(
  userId: string,
  projectId: string,
  input: { name?: string; description?: string; imageUrl?: string },
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (input.imageUrl && !(await isOwnedImageUrl(userId, input.imageUrl, db))) {
    throw new Error("That picture is not one of your uploaded images.")
  }
  const updated = await db
    .update(promoProjects)
    .set({
      ...(input.name === undefined ? {} : { name: cleanName(input.name) }),
      ...(input.description === undefined
        ? {}
        : { description: input.description.slice(0, DESCRIPTION_MAX) }),
      ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
      updatedAt: new Date(),
    })
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .returning({ id: promoProjects.id })
  if (!updated.length) throw new Error("That project does not exist.")
}

/**
 * Deletes a project that holds nothing. Refused, with how many of each, while
 * it holds accounts in use or keywords. Nothing is deleted along with it. A
 * retired account still pointing at it is let go, by the database.
 */
export async function deleteProject(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const project = await ownedProject(userId, projectId, db)
  const [accounts] = await db
    .select({ n: count() })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.projectId, projectId), isNull(promoAccounts.retiredAt)))
  const [redditKeywords] = await db
    .select({ n: count() })
    .from(promoKeywords)
    .where(eq(promoKeywords.projectId, projectId))
  const [mediumKeywords] = await db
    .select({ n: count() })
    .from(promoMediumKeywords)
    .where(eq(promoMediumKeywords.projectId, projectId))
  const [xKeywords] = await db
    .select({ n: count() })
    .from(promoXKeywords)
    .where(eq(promoXKeywords.projectId, projectId))
  const keywords = { n: redditKeywords.n + mediumKeywords.n + xKeywords.n }
  const held = [
    accounts.n ? `${accounts.n} ${accounts.n === 1 ? "account" : "accounts"}` : "",
    keywords.n ? `${keywords.n} ${keywords.n === 1 ? "keyword" : "keywords"}` : "",
  ].filter(Boolean)
  if (held.length) {
    const steps = [
      accounts.n ? "take its accounts out" : "",
      keywords.n ? "remove its keywords" : "",
    ].filter(Boolean)
    const first = steps.join(" and ")
    throw new Error(
      `${project.name} still holds ${held.join(" and ")}. ${first.charAt(0).toUpperCase()}${first.slice(1)} first, then delete it.`
    )
  }
  await db
    .delete(promoProjects)
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
}

/**
 * Deletes several projects in one request. Each one holding accounts or
 * keywords is kept, with why, and the rest go.
 */
export async function deleteProjects(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<{ deleted: string[]; kept: Array<{ id: string; reason: string }> }> {
  const deleted: string[] = []
  const kept: Array<{ id: string; reason: string }> = []
  for (const id of [...new Set(ids)]) {
    try {
      await deleteProject(userId, id, db)
      deleted.push(id)
    } catch (error) {
      kept.push({ id, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { deleted, kept }
}

/** The project, or a refusal a person can act on. */
export async function ownedProject(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<typeof promoProjects.$inferSelect> {
  const [project] = await db
    .select()
    .from(promoProjects)
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error("That project does not exist.")
  return project
}

/** One of the project's accounts, as it is listed in the dropdown beside Post. */
export type ProjectAccount = {
  id: string
  /** Empty when the browser was never seen signed in. */
  handle: string
  profile: { id: string; name: string } | null
  /**
   * The phone it runs on instead of a browser profile, or null, with what
   * Post needs to say about it (`postPhone`).
   */
  phone: PostPhone | null
  /** Important or throwaway (part 22 of the phone farm). */
  importance: AccountImportance
  voice: { id: string; name: string } | null
  /** Reddit is asking the browser something only a person can answer. */
  blocked: boolean
  reason: string
  status: AccountStatusView
  /** Warm-up, pace, waking hours and the comments waiting for its morning. */
  posting: PostingState
  /** Last karma reading. Null when nothing has read it, which is not the same as 0. */
  karma: number | null
  /** When Reddit says the account was made. Null until read. */
  redditCreatedAt: Date | null
  /** When its last comment reached Reddit. Null when it has sent none. */
  lastPostedAt: Date | null
}

export type ProjectView = {
  /** `pausedAt` is set while the whole project is paused. */
  project: {
    id: string
    name: string
    description: string
    imageUrl: string
    pausedAt: Date | null
    /** The networks it uses, each a row in its left column, in the order they were added. */
    networks: Network[]
    /** The networks paused on their own while the rest of the project runs. */
    pausedNetworks: Network[]
  }
  /**
   * What waits on each network's row in the left column: strong stories and
   * unanswered responses. Only Medium has one so far; the endpoint fills it
   * (`src/lib/api/social/projects.ts`), so this file needs no network's own code.
   */
  networkCounts?: Partial<Record<Network, number>>
  /**
   * The project's accounts, best to comment from first: awake with room left
   * in today's pace, then awake with none, then asleep, then warming up, then
   * banned. Only ordered; nothing is picked for the person.
   */
  accounts: ProjectAccount[]
  /** Accounts in no project and not retired, for the Add account picker. */
  freeAccounts: Array<{ id: string; handle: string; profileName: string | null }>
  /** What the queue is doing, so the dashboard asks again while it works. */
  jobs: JobCounts
}

export async function readProjectView(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<ProjectView> {
  const project = await ownedProject(userId, projectId, db)

  const rows = await db
    .select({
      account: promoAccounts,
      profileName: promoProfiles.name,
      voiceName: promoVoices.name,
    })
    .from(promoAccounts)
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.platform, "reddit"),
        isNull(promoAccounts.retiredAt)
      )
    )
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))

  const mine = rows.filter((row) => row.account.projectId === projectId)
  const statuses = await accountStatuses(userId, mine.map((row) => row.account), db, now)

  const accounts: Array<ProjectAccount & { rank: number }> = []
  for (const { account, profileName, voiceName } of mine) {
    const posting = await readPostingState(userId, account, db, now)
    const status = statuses.get(account.id) ?? { status: null, byHand: false, warning: null }
    accounts.push({
      id: account.id,
      handle: account.handle,
      profile: account.profileId && profileName !== null ? { id: account.profileId, name: profileName } : null,
      phone: await postPhone(userId, account.phoneId, db, now),
      importance: account.importance,
      voice: account.voiceId && voiceName !== null ? { id: account.voiceId, name: voiceName } : null,
      blocked: account.blocked,
      reason: account.blockedReason,
      status,
      posting,
      karma: account.karma,
      redditCreatedAt: account.redditCreatedAt,
      lastPostedAt: account.lastPostedAt,
      rank: commentReadiness(status, posting, now),
    })
  }
  // A stable sort, so accounts that rank the same stay oldest first.
  accounts.sort((a, b) => a.rank - b.rank)

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      imageUrl: project.imageUrl,
      pausedAt: project.pausedAt,
      networks: usedNetworks(project),
      pausedNetworks: project.pausedNetworks.filter(isNetwork),
    },
    accounts: accounts.map(({ rank: _rank, ...account }) => account),
    freeAccounts: rows
      .filter((row) => row.account.projectId === null)
      .map((row) => ({ id: row.account.id, handle: row.account.handle, profileName: row.profileName })),
    jobs: await jobCounts(userId, db),
  }
}

/**
 * Puts an account in a project. Only an account in no project is taken: an
 * account belongs to one project, so moving one means taking it out first.
 */
export async function addAccountToProject(
  userId: string,
  projectId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  await ownedProject(userId, projectId, db)
  const [account] = await db
    .select({
      id: promoAccounts.id,
      handle: promoAccounts.handle,
      importance: promoAccounts.importance,
      movingToPhoneId: promoAccounts.movingToPhoneId,
      projectId: promoAccounts.projectId,
      retiredAt: promoAccounts.retiredAt,
    })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.retiredAt) throw new Error("That account is not there any more.")
  if (account.projectId === projectId) return
  if (account.projectId) {
    throw new Error("That account is already in another project. An account belongs to one project only.")
  }
  await refuseMixedProject(userId, account, projectId, db)
  await db
    .update(promoAccounts)
    .set({ projectId, updatedAt: new Date() })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
}

/** Takes an account out of its project. Its comments and settings stay. */
export async function removeAccountFromProject(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const updated = await db
    .update(promoAccounts)
    .set({ projectId: null, updatedAt: new Date() })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .returning({ id: promoAccounts.id })
  if (!updated.length) throw new Error("That account is not there any more.")
}

/**
 * Who a found post belongs to: its keyword's project, or the project a
 * self-promotion thread was found for, or for a post in an account's own
 * everyday subreddits, that account and no project.
 */
async function ownerOfFind(
  userId: string,
  findId: string,
  db: CustomShellDb
): Promise<{ projectId: string | null; helpAccountId: string | null }> {
  const [row] = await db
    .select({
      keywordProject: promoKeywords.projectId,
      threadProject: promoFinds.threadProjectId,
      helpAccountId: promoFinds.helpAccountId,
    })
    .from(promoFinds)
    .leftJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(and(eq(promoFinds.id, findId), eq(promoFinds.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That post is no longer saved.")
  return { projectId: row.keywordProject ?? row.threadProject, helpAccountId: row.helpAccountId }
}

/** The project a found post belongs to, or null for a help-only post, which belongs to one account. */
export async function projectOfFind(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb
): Promise<string | null> {
  return (await ownerOfFind(userId, findId, db)).projectId
}

/**
 * The account a person clicked, checked against the post it is for. It has
 * to be theirs, in use, and in the post's project, so a comment never goes
 * out from an account working for a different product.
 */
export async function accountForFind(
  userId: string,
  accountId: string,
  findId: string,
  db: CustomShellDb = defaultDb
): Promise<typeof promoAccounts.$inferSelect> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.retiredAt) throw new Error("That account is not there any more.")
  const owner = await ownerOfFind(userId, findId, db)
  // A help-only post was found for one account, and only that account answers it.
  if (owner.helpAccountId) {
    if (owner.helpAccountId !== account.id) {
      throw new Error("That post was found for another account's everyday subreddits, so only that account answers it.")
    }
    return account
  }
  if (account.projectId !== owner.projectId) {
    throw new Error("That account is not in this post's project. Pick one of the project's accounts beside Post comment.")
  }
  return account
}

/** What the AI is told about what you make: the project's description, or nothing. */
export async function projectDescription(
  userId: string,
  projectId: string | null,
  db: CustomShellDb = defaultDb
): Promise<string> {
  if (!projectId) return ""
  const [row] = await db
    .select({ description: promoProjects.description })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  return row?.description.trim() ?? ""
}

/** The screens that were in the left menu before Reddit moved inside the project. */
export type OldScreen = "today" | "comments" | "jobs"

/**
 * Which project an old address now opens: `/admin/today`, `/admin/comments`
 * and `/admin/jobs` were screens of their own until Tyler moved them inside
 * the project's Reddit module on 14 Oct 2026. Bell
 * notices already sent, and bookmarks, still carry those addresses.
 *
 * A comment opens in the project its account is in now, the rule its
 * Comments tab lists it by. A failure with no comment named opens the project
 * of the newest one. Jobs is the same list from any project, so it opens in
 * the first. Anything else opens the only
 * project when there is one. Null means the Projects table, which is where a
 * person picks one.
 */
export async function projectForOldScreen(
  userId: string,
  screen: OldScreen,
  commentId: string | null,
  db: CustomShellDb = defaultDb
): Promise<string | null> {
  if (screen === "comments" && commentId) {
    const [row] = await db
      .select({ projectId: promoAccounts.projectId })
      .from(promoComments)
      .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
      .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
      .limit(1)
    if (row?.projectId) return row.projectId
  }
  const projects = await db
    .select({ id: promoProjects.id })
    .from(promoProjects)
    .where(eq(promoProjects.userId, userId))
    .orderBy(asc(promoProjects.createdAt), asc(promoProjects.id))
  if (screen === "jobs") return projects[0]?.id ?? null
  return projects.length === 1 ? projects[0].id : null
}
