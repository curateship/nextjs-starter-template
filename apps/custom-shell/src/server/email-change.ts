import { and, desc, eq, gt, isNull } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAuthTokens,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"
import {
  consumeAuthToken,
  createAuthToken,
  findUserByEmail,
  now,
} from "@/server/security"

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

/** Drops the outstanding link, so the account stays where it is. */
export async function cancelEmailChange(
  userId: string,
  database: CustomShellDb = db
) {
  await database
    .delete(customShellAuthTokens)
    .where(
      and(
        eq(customShellAuthTokens.userId, userId),
        eq(customShellAuthTokens.purpose, "change_email")
      )
    )
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
