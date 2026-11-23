import { and, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"

/**
 * Who to tell when something is waiting in a review queue.
 *
 * The app's admins, because that is who the queues are for. There is no
 * per-site membership in this shell — a workspace records who made it and
 * nothing else — so "the admins of this site" is not a question the database can
 * answer today, and pretending otherwise would mean inventing a table this
 * feature does not need.
 *
 * Capped, and deliberately low. This is a courtesy line in somebody's inbox, not
 * a mailing list, and a deployment that somehow has fifty admins should not send
 * fifty emails per submission.
 */
const MAX_ADMINS_TOLD = 5

export async function adminEmails(
  database: CustomShellDb = db
): Promise<{ email: string }[]> {
  return database
    .select({ email: customShellUsers.email })
    .from(customShellUsers)
    .where(
      and(
        eq(customShellUsers.role, "admin"),
        // A suspended account is not somebody to email about work waiting for
        // them.
        eq(customShellUsers.status, "active")
      )
    )
    .limit(MAX_ADMINS_TOLD)
}
