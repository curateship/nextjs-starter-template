import { eq } from "drizzle-orm"

import { isPendingDeletion } from "@/lib/account-deletion"
import { db, type CustomShellDb } from "@/server/db"
import { customShellUsers, type CustomShellUser } from "@/server/schema"
import { startSessionWithAlert } from "@/server/auth/security-alerts"
import { emitMemberEvent } from "@/server/automations/member-events"
import {
  consumeAuthToken,
  createAuthToken,
  findUserByEmail,
  now,
  type SessionOrigin,
} from "@/server/auth/security"

/**
 * Magic-link sign-in: a one-time link, emailed to the address on the account,
 * that signs that browser in when it is opened.
 *
 * It is the same single-use hashed token the verification and reset links
 * already use, with a shorter life. Nothing new is stored and nothing new can
 * be guessed: the raw secret exists only in the email, and the row holds its
 * SHA-256 hash.
 */

/**
 * Issues a sign-in link for an email address, or answers null when there is
 * nobody to issue one to.
 *
 * Anything but an active account gets nothing — suspended, or marked for
 * deletion. There is no session for either to reach, since the app treats both
 * as signed out on every request, so mailing a link would only be a link that
 * fails after the click. Bringing a deleted account back is the sign-in form's
 * job, and it asks for the password.
 *
 * The caller sends the mail and reports success either way, so this cannot be
 * used to find out which addresses have accounts.
 */
export async function createSignInLinkToken(
  email: string,
  database: CustomShellDb = db
) {
  const user = await findUserByEmail(email, database)
  if (!user || user.status !== "active") {
    return null
  }

  return { email: user.email, token: await createAuthToken(user.id, "login", database) }
}

/**
 * Spends a sign-in link and starts a session for the account it belongs to.
 *
 * The token is spent before anything else happens, which is the order that
 * fails safely: if the session cannot then be created, the link is already
 * dead and the person asks for another one. The reverse order would hand out a
 * session on a link that turned out to be spent.
 *
 * `consumeAuthToken` is the single-use guard — its update matches only a token
 * that is unspent and inside its life, so the same link can never sign two
 * browsers in.
 */
export async function consumeSignInLink(
  token: string,
  origin: SessionOrigin,
  database: CustomShellDb = db
): Promise<{ user: CustomShellUser; sessionToken: string }> {
  const timestamp = now()
  const consumed = await consumeAuthToken(token, "login", database, timestamp)

  const [account] = await database
    .select()
    .from(customShellUsers)
    .where(eq(customShellUsers.id, consumed.userId))
    .limit(1)

  // The token's row is deleted with its account, so a missing account here
  // means the link is as good as expired rather than anything to explain.
  if (!account) {
    throw new Error("INVALID_OR_EXPIRED_TOKEN")
  }
  if (account.status === "suspended") {
    throw new Error("ACCOUNT_SUSPENDED")
  }
  // A link issued before the account was deleted must not still work, and a
  // link must never be what brings one back — the person could be undoing an
  // admin's decision without ever being asked whether they meant to.
  if (isPendingDeletion(account)) {
    throw new Error("ACCOUNT_PENDING_DELETION")
  }

  // Opening a link that was mailed to the address proves the address works, so
  // an unverified account is verified here rather than being sent back to the
  // sign-in page it cannot get past. This is the same conclusion completing a
  // password reset already draws.
  const user = account.emailVerifiedAt
    ? account
    : await database.transaction(async (tx) => {
        const [verified] = await tx
          .update(customShellUsers)
          .set({ emailVerifiedAt: timestamp, updatedAt: timestamp })
          .where(eq(customShellUsers.id, account.id))
          .returning()
        await emitMemberEvent("verified", verified, tx)
        return verified
      })

  return {
    user,
    sessionToken: await startSessionWithAlert(user, origin, database),
  }
}
