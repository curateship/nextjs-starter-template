import { count, eq } from "drizzle-orm"

import { publicPages } from "@/lib/pages/page-registry"
import { listAccounts } from "@/server/people/accounts"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAnnouncements,
  customShellFeedback,
  customShellMedia,
  customShellUsers,
  customShellWrittenPages,
} from "@/server/schema"

/**
 * The counts beside the Dashboards block's rows (Tyler, 8 Nov 2026: picked
 * "Dashboards, with counts"). Each is what its section lists with nothing
 * filtered, so a count always agrees with the list it opens:
 *
 * - **Users:** every account, as the Users list's "All" counts them.
 * - **Feedback:** the site's own board.
 * - **Announcements:** the site's own, every one whatever its dates.
 * - **Media library:** every file with an owner, as the library lists them.
 * - **Pages:** every public page, both tabs: the ones the code declares and
 *   the ones an admin wrote for the site whose public pages are built
 *   (`pagesWorkspaceId`, which can differ from the admin's own site).
 */
export type AdminSectionCounts = {
  users: number
  feedback: number
  announcements: number
  media: number
  pages: number
}

export async function adminSectionCounts(
  workspaceId: string,
  pagesWorkspaceId: string,
  database: CustomShellDb = db
): Promise<AdminSectionCounts> {
  const [users, [feedback], [announcements], [media], [written]] = await Promise.all([
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
      .from(customShellAnnouncements)
      .where(eq(customShellAnnouncements.workspaceId, workspaceId)),
    database
      .select({ total: count() })
      .from(customShellMedia)
      .innerJoin(customShellUsers, eq(customShellUsers.id, customShellMedia.userId)),
    database
      .select({ total: count() })
      .from(customShellWrittenPages)
      .where(eq(customShellWrittenPages.workspaceId, pagesWorkspaceId)),
  ])
  return {
    users: users.total,
    feedback: feedback?.total ?? 0,
    announcements: announcements?.total ?? 0,
    media: media?.total ?? 0,
    pages: publicPages().length + (written?.total ?? 0),
  }
}
