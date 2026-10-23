import { and, eq, gt, isNotNull } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { customShellSessions, customShellUsers } from "@/server/schema"
import { hashSessionToken, isAdmin, now } from "@/server/auth/security"

/**
 * Viewing the app as a member, for chasing "it looks broken for me".
 *
 * There is no second session and no second cookie. The admin keeps the session
 * they signed in with; one column on that row names the person the app should
 * treat them as. That is what makes this safe to hand out:
 *
 * - the real owner of the session is never lost, so exiting cannot fail
 * - the view cannot outlive the exit — it is one column, cleared in one write
 * - signing out or the session expiring ends it for free
 * - while it is on, `requireAdmin` sees the member, so the admin genuinely has
 *   no admin powers until they exit
 *
 * Every start and every exit is written to the activity log, without exception.
 */

/** Starts the view. Admins only, members only, and never yourself. */
export async function startViewingAs(
  adminId: string,
  sessionToken: string,
  targetUserId: string,
  database: CustomShellDb = db
) {
  if (targetUserId === adminId) {
    throw new Error("VIEW_AS_SELF")
  }

  const [target] = await database
    .select()
    .from(customShellUsers)
    .where(eq(customShellUsers.id, targetUserId))
    .limit(1)

  if (!target) {
    throw new Error("USER_NOT_FOUND")
  }
  // Impersonating another admin is refused outright — it would be a way to
  // borrow someone else's admin powers without their password.
  if (isAdmin(target)) {
    throw new Error("VIEW_AS_ADMIN")
  }
  // A suspended account reads as signed out everywhere, so there would be
  // nothing to look at.
  if (target.status !== "active") {
    throw new Error("VIEW_AS_SUSPENDED")
  }

  // The where clause is the guard: it only matches a live session that this
  // admin owns, so the column can never be set on somebody else's session.
  const [session] = await database
    .update(customShellSessions)
    .set({ viewingAsUserId: target.id })
    .where(
      and(
        eq(customShellSessions.tokenHash, hashSessionToken(sessionToken)),
        eq(customShellSessions.userId, adminId),
        gt(customShellSessions.expiresAt, now())
      )
    )
    .returning({ id: customShellSessions.id })

  if (!session) {
    throw new Error("AUTH_REQUIRED")
  }

  return { userId: target.id, name: target.name, email: target.email }
}

/**
 * Ends the view and hands the session back to its owner.
 *
 * Deliberately not behind `requireAdmin`: while the view is on, the app treats
 * the caller as the member, so an admin check here would lock them in. The
 * guard instead is the session row itself — only the browser holding the
 * session that started this can clear it, and the audit entry is written
 * against the admin who owns that row, not whoever was being viewed.
 */
export async function stopViewingAs(
  sessionToken: string,
  database: CustomShellDb = db
) {
  const tokenHash = hashSessionToken(sessionToken)
  // Read first: an update returns the value it just wrote, and the whole point
  // here is to record who was being viewed before it was cleared.
  const [session] = await database
    .select({
      adminId: customShellSessions.userId,
      viewedUserId: customShellSessions.viewingAsUserId,
    })
    .from(customShellSessions)
    .where(
      and(
        eq(customShellSessions.tokenHash, tokenHash),
        gt(customShellSessions.expiresAt, now()),
        isNotNull(customShellSessions.viewingAsUserId)
      )
    )
    .limit(1)

  if (!session?.viewedUserId) {
    throw new Error("VIEW_AS_NOT_ACTIVE")
  }

  // Matching on the id we just read is what settles a race between two tabs:
  // exactly one of them clears it.
  await database
    .update(customShellSessions)
    .set({ viewingAsUserId: null })
    .where(
      and(
        eq(customShellSessions.tokenHash, tokenHash),
        eq(customShellSessions.viewingAsUserId, session.viewedUserId)
      )
    )

  return { userId: session.viewedUserId }
}
