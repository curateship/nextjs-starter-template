import { asc } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { findCurrentWorkspaceId } from "@/server/people/workspaces"
import { customShellWorkspaces } from "@/server/schema"
import { answerForRequest } from "@/server/workspaces/host"

/**
 * Which site the content on this request belongs to.
 *
 * Announcements, media, feedback and the changelog all have to answer this
 * before they read or write a single row, and they must all answer it the same
 * way — the moment two of them disagree, an admin writes a banner in one place
 * and cannot find it in another.
 *
 * **Signed in, the answer is the workspace you are in**, not the domain you
 * arrived on. It has to be that way round: an admin who picks Beta in the
 * switcher while sitting on Alpha's domain means to work on Beta, and letting
 * the domain win would make the switcher look broken. The domain still gets its
 * say — it chooses the workspace at sign-in, in `pointAtWorkspaceForHost`, so
 * somebody who signed in at Alpha's address is in Alpha to begin with.
 *
 * **Signed out, the domain is the only thing there is**, which is exactly what
 * a visitor reading a written page should get — see `visitorWorkspaceId` at the
 * bottom.
 */

/**
 * The deployment's oldest workspace, and the last thing either answer falls
 * back on.
 *
 * On an app with one site — Trade, Video, and every app before this — there is
 * exactly one workspace, so this is not a guess at all: it is the answer. It
 * only becomes a guess on a deployment with several sites where nobody is
 * pointed anywhere and the domain says nothing, and something has to be read.
 */
async function onlyWorkspaceId(database: CustomShellDb) {
  const [oldest] = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellWorkspaces)
    .orderBy(asc(customShellWorkspaces.createdAt))
    .limit(1)

  return oldest?.id ?? null
}

/**
 * The site this person's content belongs to, or null when the deployment has no
 * site at all.
 *
 * That last case is real rather than theoretical: only an admin is given a
 * workspace, and only when they sign in — so a database where nobody has ever
 * signed in as an admin has none, and every member's page load asks this
 * question. **A read must answer "nothing" there rather than fail**, which is
 * why this returns null and `workspaceIdForRequest` beside it does not.
 */
export async function findWorkspaceIdForRequest(
  userId: string,
  database: CustomShellDb = db
): Promise<string | null> {
  const mine = await findCurrentWorkspaceId(userId, database)
  if (mine) return mine

  // Nobody is given a workspace but an admin, so an ordinary member reaches
  // here on every request. The domain they are on is the honest answer.
  const answer = await answerForRequest(database)
  if (answer.kind === "workspace") return answer.workspace.id

  return onlyWorkspaceId(database)
}

/**
 * The same answer, for the writes.
 *
 * Throws rather than returning null, for the same reason `currentWorkspaceId`
 * does: a write with no site to write into has nowhere to go, and saying so is
 * better than saving a row nobody will ever find.
 */
export async function workspaceIdForRequest(
  userId: string,
  database: CustomShellDb = db
): Promise<string> {
  const workspaceId = await findWorkspaceIdForRequest(userId, database)
  if (!workspaceId) throw new Error("No workspace")
  return workspaceId
}

/**
 * The site a visitor with no account is reading, or null when there is none.
 *
 * **The domain decides, and nothing else.** A public page belongs to the site
 * whose address was typed, whoever is looking at it — an admin browsing Beta's
 * `/about` while signed in to Alpha is reading Beta's page, not Alpha's.
 *
 * Returns null rather than throwing, because a public page has to be able to
 * render something. An address belonging to no site never reaches here: the
 * root route turns that into a dead end before any page runs.
 */
export async function visitorWorkspaceId(
  database: CustomShellDb = db
): Promise<string | null> {
  const answer = await answerForRequest(database)
  if (answer.kind === "workspace") return answer.workspace.id
  if (answer.kind === "unknown") return null

  return onlyWorkspaceId(database)
}
