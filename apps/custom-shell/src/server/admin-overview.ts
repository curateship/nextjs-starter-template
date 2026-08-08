import { loadNewestAccounts, type AccountRow } from "@/server/people/accounts"
import { listUserAutomations } from "@/server/automations/flows"
import { db, type CustomShellDb } from "@/server/db"
import { loadFeedsSummary, type FeedsSummary } from "@/server/content/feeds"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"
import { loadMembershipSummary, type MembershipSummary } from "@/server/people/membership"
import { getDefaultPlan } from "@/server/billing/plans"

/**
 * Everything the admin Overview draws. Nothing here is new data: it is the
 * Membership figures, recent activity, feedback figures, the newest handful
 * of accounts, and the automations as they stand.
 *
 * This module exists for one reason — how many queries are in flight at once
 * can only be decided in one place. The pool falls over past five, and the two
 * summaries it calls each take four or five on their own, so a plain
 * `Promise.all` of the four reads would put ten in flight and take the page
 * down. See `loadAdminOverview` for how it is paced.
 */

/** How many of the newest accounts the table lists. */
const NEWEST_MEMBERS = 5

/** One automation as the Overview lists it, with its date already a string. */
export type OverviewAutomation = {
  id: string
  name: string
  summary: string
  isValid: boolean
  nodeCount: number
  updatedAt: string
}

export type AdminOverview = {
  membership: MembershipSummary
  feeds: FeedsSummary
  newestMembers: AccountRow[]
  automations: OverviewAutomation[]
}

export async function loadAdminOverview(
  userId: string,
  database: CustomShellDb = db
): Promise<AdminOverview> {
  // Wave one. The membership read takes four of the five slots the pool will
  // stand, so the three cheap reads share the fifth strictly one after
  // another — never a `Promise.all` of their own, which would make it seven.
  const [membership, extras] = await Promise.all([
    loadMembershipSummary(database),
    (async () => {
      const automations = await listUserAutomations(userId, database)
      // The Overview's table shows what plan somebody is on, which needs the
      // default plan for everyone who is not paying for one.
      const defaultPlan = await getDefaultPlan(database)
      const newestMembers = await loadNewestAccounts(
        NEWEST_MEMBERS,
        defaultPlan,
        database
      )
      return { automations, newestMembers }
    })(),
  ])

  // Wave two runs on its own. The feeds read has a second stage of its own
  // that peaks at five in flight, so there is no room for anything beside it.
  const feeds = await loadFeedsSummary(
    await workspaceIdForRequest(userId, database),
    database
  )

  return {
    membership,
    feeds,
    newestMembers: extras.newestMembers,
    automations: extras.automations.map((row) => ({
      id: row.id,
      name: row.name,
      summary: row.summary,
      isValid: row.isValid,
      nodeCount: row.nodeCount,
      updatedAt: row.updatedAt.toISOString(),
    })),
  }
}
