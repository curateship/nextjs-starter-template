import { count, eq } from "drizzle-orm"

import { listAccounts } from "@/server/people/accounts"
import { db, type CustomShellDb } from "@/server/db"
import { customShellFeedback, customShellMedia, customShellUsers } from "@/server/schema"

/**
 * The counts beside the Dashboards block's rows (Tyler, 8 Nov 2026: picked
 * "Dashboards, with counts"). Each is what its section lists with nothing
 * filtered, so a count always agrees with the list it opens:
 *
 * - **Users:** every account, as the Users list's "All" counts them.
 * - **Feedback:** the site's own board.
 * - **Media library:** every file with an owner, as the library lists them.
 */
export type AdminSectionCounts = { users: number; feedback: number; media: number }

export async function adminSectionCounts(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<AdminSectionCounts> {
  const [users, [feedback], [media]] = await Promise.all([
    listAccounts(
      { search: "", role: "all", status: "all", page: 1, pageSize: 1, sort: "created", direction: "desc" },
      database
    ),
    database
      .select({ total: count() })
      .from(customShellFeedback)
      .where(eq(customShellFeedback.workspaceId, workspaceId)),
    database
      .select({ total: count() })
      .from(customShellMedia)
      .innerJoin(customShellUsers, eq(customShellUsers.id, customShellMedia.userId)),
  ])
  return { users: users.total, feedback: feedback?.total ?? 0, media: media?.total ?? 0 }
}
