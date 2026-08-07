import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm"

import { isPendingDeletion } from "@/lib/account-deletion"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAuthTokens,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"
import {
  consumeAuthToken,
  createAuthToken,
  deleteOtherSessions,
  findUserByEmail,
  now,
} from "@/server/auth/security"

/**
 * Changing the email address on an account, without asking anybody for help.
 *
 * The shape is deliberately the same as every other link in this app: a
 * single-use secret whose hash is all that is stored, with an expiry. The one
 * addition is the destination address, carried on the token row rather than on
 * the account — so an unfinished change leaves the account untouched, and
 * abandoning one costs nothing.
 *
 * The address only moves when the link is opened, which is what makes this
 * safe: the person has to be able to read mail at the new address, or the
 * change simply never happens.
 *
 * Every request issues a second link too, mailed to the *old* address: the
 * "this wasn't me" link, which cancels the change and signs every browser out.
 * It needs no session, because the account it protects may be the one being
 * taken away.
 */

/** A change that has been asked for and not yet confirmed. */
export type PendingEmailChange = {
  newEmail: string
  expiresAt: Date
}

/**
 * The change this account is waiting on, or null.
 *
 * Only one can ever be outstanding — issuing a link clears the last one — so
 * the newest live row is the answer.
 */
export async function findPendingEmailChange(
  userId: string,
  database: CustomShellDb = db
): Promise<PendingEmailChange | null> {
  const [row] = await database
    .select({
      newEmail: customShellAuthTokens.newEmail,
      expiresAt: customShellAuthTokens.expiresAt,
    })
    .from(customShellAuthTokens)
    .where(livePendingChange(userId, now()))
    .orderBy(desc(customShellAuthTokens.createdAt))
    .limit(1)

  // `newEmail` is nullable on the table but never null on a change_email row —
  // the check constraint sees to that. The guard is for the type only.
  return row?.newEmail ? { newEmail: row.newEmail, expiresAt: row.expiresAt } : null
}

/**
 * Issues a confirmation link for a new address and returns the raw secret.
 *
 * Both refusals are checked here so somebody hears about the problem while the
 * form is still in front of them, rather than a day later when the link fails.
 * Uniqueness is checked again at the other end, because an address free now can
 * be taken by somebody else before the link is opened.
 */
export async function createEmailChangeToken(
  user: Pick<CustomShellUser, "id" | "email">,
  newEmail: string,
  database: CustomShellDb = db
) {
  if (newEmail === user.email.toLowerCase()) {
    throw new Error("EMAIL_UNCHANGED")
  }

  const existing = await findUserByEmail(newEmail, database)
  if (existing) {
    throw new Error("EMAIL_TAKEN")
  }

  // The previous link dies here. Two live links would mean the address the
  // Profile tab names and the address a forgotten older email would move the
  // account to could be different ones.
  await cancelEmailChange(user.id, database)

  return createAuthToken(user.id, "change_email", database, newEmail)
}

/**
 * Issues the "this wasn't me" link that stops a change from a signed-out
 * browser, and returns the raw secret.
 *
 * It carries no address of its own: it cancels whatever change the account is
 * waiting on. That is what makes it safe to mail to the *old* address — the
 * only thing holding it can do is put the account back where it was.
 */
export function createEmailChangeRevokeToken(
  userId: string,
  database: CustomShellDb = db
) {
  return createAuthToken(userId, "revoke_email_change", database)
}

/**
 * Drops the outstanding link, so the account stays where it is.
 *
 * The revoke link goes with it. The two are issued together and mean nothing
 * apart: a revoke link outliving the change it was meant to stop is a live
 * secret in an inbox that can no longer do anything.
 */
export async function cancelEmailChange(
  userId: string,
  database: CustomShellDb = db
) {
  await database
    .delete(customShellAuthTokens)
    .where(
      and(
        eq(customShellAuthTokens.userId, userId),
        inArray(customShellAuthTokens.purpose, [
          "change_email",
          "revoke_email_change",
        ])
      )
    )
}

/**
 * Spends a "this wasn't me" link: cancels the outstanding change and signs
 * every browser out of the account.
 *
 * No session is asked for, on purpose. This link exists for the case where the
 * account is being taken away, so requiring a sign-in would lock out exactly
 * the person it is for. The single-use token is the whole proof, the same way
 * it is on the confirm side.
 *
 * Signing everything out is the other half of the job. Cancelling alone would
 * leave whoever asked for the change still holding the session that let them
 * ask, free to try again the moment this page closes.
 *
 * Every refusal throws, which rolls the transaction back and leaves the link
 * unspent — so a person who clicks too late and reads "that already went
 * through" has not also quietly burnt their one link.
 */
export async function revokeEmailChange(
  token: string,
  database: CustomShellDb = db
): Promise<{ cancelledEmail: string; accountEmail: string }> {
  const timestamp = now()

  return database.transaction(async (tx) => {
    const consumed = await consumeAuthToken(
      token,
      "revoke_email_change",
      tx,
      timestamp
    )

    const [account] = await tx
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, consumed.userId))
      .limit(1)

    // The token dies with its account, so a missing one here is as good as an
    // expired link rather than anything to explain.
    if (!account) {
      throw new Error("INVALID_OR_EXPIRED_TOKEN")
    }

    // The newest change row, spent or not. A spent one is the case worth
    // separating out: the change already went through, and this page has to
    // say so instead of pretending it stopped something.
    const [change] = await tx
      .select()
      .from(customShellAuthTokens)
      .where(
        and(
          eq(customShellAuthTokens.userId, account.id),
          eq(customShellAuthTokens.purpose, "change_email")
        )
      )
      .orderBy(desc(customShellAuthTokens.createdAt))
      .limit(1)

    if (change?.usedAt) {
      throw new Error("EMAIL_CHANGE_ALREADY_DONE")
    }
    // Nothing outstanding, or an outstanding link that can no longer be
    // opened. Either way there is nothing left to stop.
    if (!change || change.expiresAt <= timestamp || !change.newEmail) {
      throw new Error("NO_EMAIL_CHANGE_PENDING")
    }

    await tx
      .delete(customShellAuthTokens)
      .where(
        and(
          eq(customShellAuthTokens.userId, account.id),
          eq(customShellAuthTokens.purpose, "change_email")
        )
      )

    // No current session to spare: this browser is not signed in, and the one
    // that asked for the change is the one being shut out.
    await deleteOtherSessions(account.id, undefined, tx)

    return { cancelledEmail: change.newEmail, accountEmail: account.email }
  })
}

/**
 * Spends a confirmation link and moves the account to its new address.
 *
 * One transaction, and the token is spent inside it: if the address turns out
 * to have been taken since the link went out, the whole thing rolls back and
 * the link still works for a second try once that is sorted out.
 *
 * Opening the link proves mail at the new address reaches this person, so the
 * account is marked verified — the same conclusion completing a password reset
 * and using a sign-in link already draw.
 */
export async function consumeEmailChange(
  token: string,
  database: CustomShellDb = db
): Promise<{ user: CustomShellUser; previousEmail: string }> {
  const timestamp = now()

  return database.transaction(async (tx) => {
    const consumed = await consumeAuthToken(
      token,
      "change_email",
      tx,
      timestamp
    )
    const newEmail = consumed.newEmail
    if (!newEmail) {
      throw new Error("INVALID_OR_EXPIRED_TOKEN")
    }

    const [account] = await tx
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, consumed.userId))
      .limit(1)

    // The token dies with its account, so a missing one here means the link is
    // as good as expired rather than anything to explain.
    if (!account) {
      throw new Error("INVALID_OR_EXPIRED_TOKEN")
    }
    if (account.status === "suspended") {
      throw new Error("ACCOUNT_SUSPENDED")
    }
    // A change link outlives the account being deleted, and moving the address
    // on an account on its way out would take the new address down with it.
    if (isPendingDeletion(account)) {
      throw new Error("ACCOUNT_PENDING_DELETION")
    }

    // Somebody else may have registered the address while the link sat in an
    // inbox. `users.email` is unique, so this is belt and braces — but it is
    // the check that gives a plain answer instead of a database error.
    const taken = await findUserByEmail(newEmail, tx)
    if (taken && taken.id !== account.id) {
      throw new Error("EMAIL_TAKEN")
    }

    const [user] = await tx
      .update(customShellUsers)
      .set({
        email: newEmail,
        emailVerifiedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(customShellUsers.id, account.id))
      .returning()

    return { user, previousEmail: account.email }
  })
}

/** A change link this account could still open: unspent and inside its life. */
function livePendingChange(userId: string, timestamp: Date) {
  return and(
    eq(customShellAuthTokens.userId, userId),
    eq(customShellAuthTokens.purpose, "change_email"),
    isNull(customShellAuthTokens.usedAt),
    gt(customShellAuthTokens.expiresAt, timestamp)
  )
}
