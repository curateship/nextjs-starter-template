import { and, desc, eq, ne, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { handleWords, NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { POST_NUMBERS_PER_VISIT } from "@/lib/social/phone-apps"

import { clearProblem, raiseProblem } from "@/server/phones/notices"

import { promoAccounts, promoAppPosts } from "../schema"
import { appHealth } from "./calls"
import { queueInboxRead } from "./inbox"

/**
 * An Instagram or TikTok account's daily health reading, taken in the app on
 * its phone: who is signed in, followers, following and posts, and whether
 * the app's own Account status page says its posts may be shown to people
 * who do not follow it.
 *
 * Tyler, 16 Oct 2026: "Why does it need to check? if our account gets banned
 * then we cant log in?" A ban on these two shows in the app the phone already
 * opens, and the ban-screen watch stops the account. What the app does not
 * show its owner is a shadowban, where the profile still opens but the posts
 * stop reaching hashtags, Explore and For You. Tyler said "yes" to reading it
 * off the Account status page, so that is the one outside look here. Reddit's
 * stranger's look is Reddit's alone.
 *
 * The same visit reads the numbers of the account's newest posts Promo made
 * (part 39), and a glance at the inbox catches anything a missed notification
 * left waiting.
 */

type AccountRow = typeof promoAccounts.$inferSelect

/**
 * Takes the reading and stores it. A shadowban the app reports rings the bell
 * once, and its notice goes when the app reports it over.
 * An Account status page that could not be read leaves the last answer as it
 * was rather than calling the account clear.
 */
export async function recordAppHealth(
  userId: string,
  account: AccountRow,
  network: PhoneAppNetwork,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const posts = await db
    .select({ id: promoAppPosts.id, postUrl: promoAppPosts.postUrl })
    .from(promoAppPosts)
    .where(
      and(
        eq(promoAppPosts.userId, userId),
        eq(promoAppPosts.accountId, account.id),
        eq(promoAppPosts.status, "posted"),
        ne(promoAppPosts.postUrl, "")
      )
    )
    .orderBy(desc(promoAppPosts.postedAt))
    .limit(POST_NUMBERS_PER_VISIT)

  const reading = await appHealth(target, network, { postUrls: posts.map((post) => post.postUrl) })
  if (!reading.handle) {
    // Written down before refusing: Post and Apply then refuse it, and its
    // first day starts again when it next reads signed in.
    await db
      .update(promoAccounts)
      .set({ handle: "", signedInAt: null, stateReadAt: now, updatedAt: now })
      .where(and(eq(promoAccounts.id, account.id), eq(promoAccounts.userId, userId)))
    throw new Refusal(
      `The ${NETWORK_NAMES[network]} app on the phone is not signed in, so there is no profile to read. Sign in through the phone's screen on the Phones dashboard.`
    )
  }

  await db
    .update(promoAccounts)
    .set({
      handle: reading.handle,
      followers: reading.followers,
      following: reading.following,
      postCount: reading.posts,
      ...(reading.shadowban.read
        ? { shadowbanned: reading.shadowban.hidden, shadowbanWords: reading.shadowban.words.slice(0, 500) }
        : {}),
      appHealthReadAt: now,
      // Signed in, so its first day starts now unless it already had.
      signedInAt: sql`coalesce(${promoAccounts.signedInAt}, ${now.toISOString()}::timestamptz)`,
      updatedAt: now,
    })
    .where(and(eq(promoAccounts.id, account.id), eq(promoAccounts.userId, userId)))

  // Each post's numbers, matched by the link it was read under. A post the
  // app would not open keeps its last numbers and their date.
  for (const number of reading.numbers) {
    const post = posts.find((row) => row.postUrl === number.url)
    if (!post) continue
    await db
      .update(promoAppPosts)
      .set({ views: number.views, likes: number.likes, comments: number.comments, numbersReadAt: now })
      .where(eq(promoAppPosts.id, post.id))
  }

  if (reading.shadowban.read) {
    const name = handleWords(network, reading.handle)
    if (reading.shadowban.hidden) {
      await raiseProblem(
        userId,
        {
          kind: "shadowbanned",
          targetId: account.id,
          message: `${NOTICE_HEADINGS.shadowbanned} ${name} on ${NETWORK_NAMES[network]}`,
          detail: [
            `${NETWORK_NAMES[network]}'s Account status page says its posts are not being shown to people who do not follow it`,
            reading.shadowban.words ? `: "${reading.shadowban.words.slice(0, 300)}".` : ".",
            " It is on the Accounts dashboard.",
          ].join(""),
          href: `/admin/accounts?platform=${network}`,
        },
        null,
        db,
        now
      )
    } else {
      await clearProblem(userId, "shadowbanned", account.id, null, db, now)
    }
  }

  // Something unread in the inbox that no notification brought in.
  if (reading.inboxWaiting) await queueInboxRead(userId, account.id, "message", "inbox", db)
}
