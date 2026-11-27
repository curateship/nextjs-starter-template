import { and, eq } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isMediumSignInLink } from "@/lib/social/medium/options"

import { queueJob } from "../jobs"
import { promoAccounts } from "../schema"

/**
 * Pasting Medium's emailed sign-in link (part 2). Medium signs people in
 * with a link sent by email, not a password, and pressing that link in an
 * everyday browser signs that browser in, which is the wrong one. Pasted
 * here, it is opened inside the account's own browser profile instead, and
 * who is signed in is read straight after.
 *
 * Only an https link on medium.com itself is taken, checked here and again
 * in the browser, so the account's browser is never sent anywhere else.
 */
export async function queueMediumSignIn(
  userId: string,
  accountId: string,
  url: string,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const link = url.trim()
  if (!isMediumSignInLink(link)) {
    throw new Refusal("That is not a Medium sign-in link. Paste the link from Medium's email, which starts with https://medium.com/.")
  }
  const [account] = await db
    .select({ platform: promoAccounts.platform, profileId: promoAccounts.profileId, retiredAt: promoAccounts.retiredAt })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "medium") throw new Refusal("Pick a Medium account first.")
  if (account.retiredAt) throw new Refusal("This account is retired. Bring it back on the Accounts dashboard first.")
  if (!account.profileId) throw new Refusal("This Medium account has no browser profile. Pick one on the Accounts dashboard first.")
  return queueJob(userId, "medium_sign_in", { accountId, url: link }, db)
}
