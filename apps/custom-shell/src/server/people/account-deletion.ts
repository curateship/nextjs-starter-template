import { and, eq, gt, inArray, lte, ne } from "drizzle-orm"

import { ACCOUNT_RESTORE_DAYS, PENDING_DELETION } from "@/lib/account-deletion"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellSessions,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"
import { now } from "@/server/auth/security"

/**
 * Deleting an account marks it instead of removing it, and a marked account can
 * be brought back for the length of the restore window. Once the window has
 * passed the row is really deleted, and everything that hangs off it goes with
 * it, exactly as an immediate delete always did.
 *
 * A marked account cannot be signed in to — that is what makes the window safe
 * to offer. The account is unreachable from the moment it is marked, so nothing
 * can be done with it in the meantime; the only two outcomes are restore and
 * purge.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Marks accounts for deletion and signs them out everywhere.
 *
 * `actorId` is stored rather than just noted: an account somebody deleted
 * themselves can be brought back by signing in, and one an admin deleted cannot
 * — otherwise a member could undo a moderation decision on their own.
 *
 * Already-marked accounts are left alone rather than re-marked, so a second
 * delete never restarts somebody's window and quietly buys them another month.
 */
export async function markAccountsForDeletion(
  actorId: string,
  userIds: string[],
  database: CustomShellDb = db
) {
  const timestamp = now()

  const marked = await database
    .update(customShellUsers)
    .set({
      status: PENDING_DELETION,
      deletedAt: timestamp,
      deletedBy: actorId,
      updatedAt: timestamp,
    })
    .where(
      and(
        inArray(customShellUsers.id, userIds),
        ne(customShellUsers.status, PENDING_DELETION)
      )
    )
    .returning({ id: customShellUsers.id })

  if (marked.length > 0) {
    // Same as suspending: nothing keeps working on an open tab.
    await database.delete(customShellSessions).where(
      inArray(
        customShellSessions.userId,
        marked.map((row) => row.id)
      )
    )
  }

  return marked.map((row) => row.id)
}

/**
 * Brings accounts back: active again, with the deletion clock cleared.
 *
 * The window is part of the match, not a check beforehand, so an account whose
 * window ran out while nothing had got round to purging it still cannot be
 * restored. It is already gone as far as everyone is concerned.
 *
 * "Active" is the only thing an account comes back as. A suspended account that
 * was then deleted returns unsuspended, because the deletion clock took the
 * status column and nothing remembers what was there before. The admin's
 * confirmation says so in as many words, so it is stated rather than silent.
 */
export async function restoreAccounts(
  userIds: string[],
  database: CustomShellDb = db
) {
  const timestamp = now()

  const restored = await database
    .update(customShellUsers)
    .set({
      status: "active",
      deletedAt: null,
      deletedBy: null,
      updatedAt: timestamp,
    })
    .where(and(inArray(customShellUsers.id, userIds), stillRestorable(timestamp)))
    .returning()

  return restored
}

/**
 * The owner bringing their own account back, from the sign-in page.
 *
 * Refuses an account an admin marked. The person has proved who they are by
 * this point, so this is not about identity — it is that an admin's decision is
 * not the member's to reverse.
 */
export async function restoreOwnAccount(
  user: Pick<CustomShellUser, "id" | "deletedBy">,
  database: CustomShellDb = db
): Promise<CustomShellUser> {
  if (user.deletedBy !== user.id) {
    throw new Error("DELETED_BY_ADMIN")
  }

  const [restored] = await restoreAccounts([user.id], database)
  if (!restored) {
    throw new Error("RESTORE_WINDOW_PASSED")
  }

  return restored
}

/**
 * Really deletes every account whose restore window has passed, and answers how
 * many went.
 *
 * There is no background job in this app, so this runs on the two everyday
 * write paths that care: registering (an address only frees up once the account
 * holding it is gone) and signing in. Between them a live app sweeps constantly,
 * and an app nobody is using has nothing to sweep.
 *
 * **What goes with a person, and what stays.** The row is deleted and the
 * database takes the things that are genuinely theirs with it: sessions, tokens,
 * passkeys, known devices, connected logins, their media, their feedback.
 *
 * **Workspaces stay.** They used to go — the foreign key cascaded — which meant
 * deleting one account also deleted its workspaces and, through them, every
 * contact, segment, broadcast, template, delivery and email setting inside. That
 * was invisible from here: nothing in this file said it, and nothing had to fail
 * for it to happen. A workspace is a thing the deployment has, not a thing a
 * person has, so the key sets the owner to empty instead and the workspace is
 * left standing with nobody's name on it. See `0045_custom_shell_shared_workspaces.sql`.
 *
 * A workspace nobody owns is still listed — `listUserWorkspaces` shows it beside
 * your own so it can be looked at or removed — and is never picked as the
 * workspace anybody is currently in.
 */
export async function purgeExpiredDeletions(database: CustomShellDb = db) {
  const purged = await database
    .delete(customShellUsers)
    .where(expiredDeletion(now()))
    .returning({ id: customShellUsers.id })

  return purged.length
}

/** Marked, and the restore window has run out. */
function expiredDeletion(timestamp: Date) {
  return and(
    eq(customShellUsers.status, PENDING_DELETION),
    lte(customShellUsers.deletedAt, windowOpenedOn(timestamp))
  )
}

/** Marked, and still inside the restore window. */
function stillRestorable(timestamp: Date) {
  return and(
    eq(customShellUsers.status, PENDING_DELETION),
    gt(customShellUsers.deletedAt, windowOpenedOn(timestamp))
  )
}

/**
 * The date an account still just inside its window was marked on. Anything
 * marked before that is out of time.
 */
function windowOpenedOn(timestamp: Date) {
  return new Date(timestamp.getTime() - ACCOUNT_RESTORE_DAYS * DAY_MS)
}
