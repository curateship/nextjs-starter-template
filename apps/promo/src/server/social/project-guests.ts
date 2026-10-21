import { eq, inArray } from "drizzle-orm"

import { findCurrentUser, isAdmin } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import type { JobCounts } from "@/server/social/jobs"
import { findBrowserGuests } from "@/server/social/project-handoff"
import {
  promoAccounts,
  promoComments,
  promoFinds,
  promoInbox,
  promoJobs,
  promoKeywords,
  promoProjects,
  type PromoProjectGuestRow,
} from "@/server/social/schema"

/**
 * The door for the project dashboard calls a guest sent from Project may
 * make (`workspace/docs/project-guests.md`). Everything else stays behind
 * the shell's `adminGet`/`adminPost`, which a guest never passes because a
 * guest has no session.
 *
 * - `editorGet` and `editorPost` (`editor-guards.ts`) let in a signed-in
 *   person or a browser holding a guest sign-in, and hand the handler both
 *   on `context.caller`.
 *   `editorPost` also checks the request came from this app's own pages, as
 *   `adminPost` does.
 * - The handler then asks `actorFor(caller, projectId)`, or one of the
 *   record helpers below, who to act as. A guest sign-in for that project
 *   acts as the project's owner, which is what every owner check below it
 *   expects. Without one, the signed-in person acts as themselves and must
 *   be an admin, exactly as `adminGet` asked. Anyone else is told the
 *   project isn't there.
 * - A record helper looks up the record's project first, so a guest can
 *   never reach another project's keyword, post, comment, account or job by
 *   its id: that record's project has no guest sign-in in this browser.
 */

/** The refusal for a project or record this caller may not reach. */
export const NOT_THERE = "That project does not exist."

export type EditorCaller = {
  user: Awaited<ReturnType<typeof findCurrentUser>>
  guests: PromoProjectGuestRow[]
}

export async function findEditorCaller(): Promise<EditorCaller> {
  const [user, guests] = await Promise.all([findCurrentUser(), findBrowserGuests()])
  if (!user && guests.length === 0) throw new Error("AUTH_REQUIRED")
  return { user, guests }
}

/** Who a call acts as, and the guest behind it if there is one. */
export type EditorActor = {
  userId: string
  /** The guest sign-in for the record's project, or null for the signed-in admin. */
  guest: PromoProjectGuestRow | null
}

/** The signed-in admin, as `adminGet` would have let them in. */
function adminActor(caller: EditorCaller): EditorActor {
  if (!caller.user) throw new Error(NOT_THERE)
  if (!isAdmin(caller.user)) throw new Error("FORBIDDEN")
  return { userId: caller.user.id, guest: null }
}

export async function actorFor(
  caller: EditorCaller,
  projectId: string | null,
  database: CustomShellDb = db
): Promise<EditorActor> {
  const guest = projectId ? caller.guests.find((held) => held.projectId === projectId) : undefined
  if (guest) {
    const [project] = await database
      .select({ userId: promoProjects.userId })
      .from(promoProjects)
      .where(eq(promoProjects.id, guest.projectId))
      .limit(1)
    if (!project) throw new Error(NOT_THERE)
    return { userId: project.userId, guest }
  }
  return adminActor(caller)
}

/**
 * For a call about several records at once: a guest only when every one of
 * them is in the same guest project, otherwise the signed-in admin.
 */
async function actorForProjects(
  caller: EditorCaller,
  projectIds: (string | null)[],
  database: CustomShellDb
): Promise<EditorActor> {
  const distinct = new Set(projectIds)
  const only = distinct.size === 1 ? [...distinct][0] : null
  return actorFor(caller, only ?? null, database)
}

/** Runs the lookup only when there is a guest it could matter for. */
async function viaLookup(
  caller: EditorCaller,
  lookup: () => Promise<(string | null)[]>,
  database: CustomShellDb
): Promise<EditorActor> {
  if (caller.guests.length === 0) return adminActor(caller)
  const projectIds = await lookup()
  if (projectIds.length === 0) return adminActor(caller)
  return actorForProjects(caller, projectIds, database)
}

/** The project each keyword is in. */
export function actorForKeyword(caller: EditorCaller, keywordId: string, database: CustomShellDb = db) {
  return viaLookup(
    caller,
    async () =>
      (
        await database
          .select({ projectId: promoKeywords.projectId })
          .from(promoKeywords)
          .where(eq(promoKeywords.id, keywordId))
      ).map((row) => row.projectId),
    database
  )
}

/**
 * The project each found post belongs to: its keyword's, the project a
 * self-promotion thread was found for, or for a post found for one
 * account's everyday subreddits, that account's project.
 */
async function projectsOfFinds(findIds: string[], database: CustomShellDb): Promise<(string | null)[]> {
  if (findIds.length === 0) return []
  const rows = await database
    .select({
      keywordProject: promoKeywords.projectId,
      threadProject: promoFinds.threadProjectId,
      helpProject: promoAccounts.projectId,
    })
    .from(promoFinds)
    .leftJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoFinds.helpAccountId))
    .where(inArray(promoFinds.id, findIds))
  // A post that isn't saved counts as no project, so a guest gets nothing.
  const found = rows.map((row) => row.keywordProject ?? row.threadProject ?? row.helpProject)
  return found.length === findIds.length ? found : [...found, null]
}

export function actorForFinds(caller: EditorCaller, findIds: string[], database: CustomShellDb = db) {
  return viaLookup(caller, () => projectsOfFinds(findIds, database), database)
}

export function actorForFind(caller: EditorCaller, findId: string, database: CustomShellDb = db) {
  return actorForFinds(caller, [findId], database)
}

/** The project a sent comment belongs to: the one its account is in now, as the Comments tab counts it. */
export function actorForComments(caller: EditorCaller, commentIds: string[], database: CustomShellDb = db) {
  return viaLookup(
    caller,
    async () => {
      const rows = await database
        .select({ projectId: promoAccounts.projectId })
        .from(promoComments)
        .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
        .where(inArray(promoComments.id, commentIds))
      const found = rows.map((row) => row.projectId)
      return found.length === commentIds.length ? found : [...found, null]
    },
    database
  )
}

export function actorForComment(caller: EditorCaller, commentId: string, database: CustomShellDb = db) {
  return actorForComments(caller, [commentId], database)
}

/** The project an Instagram or TikTok inbox row's account is in. */
export function actorForInbox(caller: EditorCaller, inboxIds: string[], database: CustomShellDb = db) {
  return viaLookup(
    caller,
    async () => {
      const rows = await database
        .select({ projectId: promoAccounts.projectId })
        .from(promoInbox)
        .innerJoin(promoAccounts, eq(promoAccounts.id, promoInbox.accountId))
        .where(inArray(promoInbox.id, inboxIds))
      const found = rows.map((row) => row.projectId)
      return found.length === inboxIds.length ? found : [...found, null]
    },
    database
  )
}

/**
 * The project a job is for: the one its payload names, else its account's,
 * else its post's, else its comment's.
 */
async function projectsOfJobs(jobIds: string[], database: CustomShellDb): Promise<(string | null)[]> {
  const jobs = await database
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(inArray(promoJobs.id, jobIds))
  const found: (string | null)[] = []
  for (const { payload } of jobs) {
    const value = (key: string) => (typeof payload?.[key] === "string" ? (payload[key] as string) : null)
    const named = value("projectId")
    const accountId = value("accountId")
    const findId = value("findId")
    const commentId = value("commentId")
    if (named) {
      found.push(named)
    } else if (accountId) {
      const [account] = await database
        .select({ projectId: promoAccounts.projectId })
        .from(promoAccounts)
        .where(eq(promoAccounts.id, accountId))
      found.push(account?.projectId ?? null)
    } else if (findId) {
      found.push(...(await projectsOfFinds([findId], database)))
    } else if (commentId) {
      const [comment] = await database
        .select({ projectId: promoAccounts.projectId })
        .from(promoComments)
        .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
        .where(eq(promoComments.id, commentId))
      found.push(comment?.projectId ?? null)
    } else {
      found.push(null)
    }
  }
  return found.length === jobIds.length ? found : [...found, null]
}

export function actorForJobs(caller: EditorCaller, jobIds: string[], database: CustomShellDb = db) {
  return viaLookup(caller, () => projectsOfJobs(jobIds, database), database)
}

/** The words a guest's sends are marked with: "Sam via Project". Null for the owner. */
export function guestSenderName(actor: EditorActor) {
  return actor.guest ? `${actor.guest.personName} via Project` : null
}

/**
 * What a guest's dashboard may hold beyond its own project, taken out: the
 * owner's accounts in no project (the Add account picker, which a guest
 * never sees), and the keywords of other projects that are being searched.
 * The queue's counts stay, because the dashboard polls on them.
 */
export async function guestProjectView<View extends { freeAccounts: unknown[]; jobs: JobCounts }>(
  view: View,
  projectId: string,
  database: CustomShellDb = db
): Promise<View> {
  const keywords = await database
    .select({ id: promoKeywords.id })
    .from(promoKeywords)
    .where(eq(promoKeywords.projectId, projectId))
  const own = new Set(keywords.map((row) => row.id))
  return {
    ...view,
    freeAccounts: [],
    jobs: { ...view.jobs, searchingKeywordIds: view.jobs.searchingKeywordIds.filter((id) => own.has(id)) },
  }
}

/** A guest may rewrite the project's description and nothing else about it. */
export function guestOnlyDescription(input: { name?: string; imageUrl?: string }) {
  if (input.name !== undefined || input.imageUrl !== undefined) {
    throw new Error("A guest can change the description only.")
  }
}

/** A guest may correct a sent comment's words; taking it off Reddit is the owner's call. */
export function refuseGuestDelete(actor: EditorActor, kind: "delete" | "edit") {
  if (actor.guest && kind === "delete") throw new Error("A guest cannot delete a comment.")
}

/**
 * The owner's lists span every project; a guest's are cut to their own.
 * `projectOf` names each row's project, or null for none.
 */
export function onlyGuestProject<Row>(actor: EditorActor, rows: Row[], projectOf: (row: Row) => string | null): Row[] {
  const guest = actor.guest
  return guest ? rows.filter((row) => projectOf(row) === guest.projectId) : rows
}
