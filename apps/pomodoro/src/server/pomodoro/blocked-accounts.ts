import { desc, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { blockAccount, unblockAccount } from "@/server/pomodoro/blocks"
import { forgetFollowingFeed } from "@/server/pomodoro/following"
import { forgetPublicProfile } from "@/server/pomodoro/public-profile"
import { pomodoroBlocks, pomodoroProfiles } from "@/server/pomodoro/schema"

/**
 * Blocking by handle, which is the only name the browser ever holds.
 *
 * The block itself lives in `@/server/pomodoro/blocks` and is checked from
 * every list in the app. This file is the thin layer that turns a public
 * handle into the account behind it, so no user id reaches or leaves the
 * browser.
 */

/**
 * The account behind a handle, whether or not its profile is switched on.
 *
 * Deliberately looser than the profile read: somebody who switched their page
 * off after harassing you is exactly the person you still want to block, and
 * a block that stopped working when they hid their page would be useless.
 */
async function accountForHandle(handle: string) {
  const [row] = await db
    .select({ userId: pomodoroProfiles.userId })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.handle, handle))
    .limit(1)
  return row?.userId ?? null
}

export async function blockByHandle(blockerUserId: string, handle: string) {
  const blockedUserId = await accountForHandle(handle)
  // No such handle answers the same as a successful block. Nobody can use
  // this to find out which handles exist.
  if (!blockedUserId || blockedUserId === blockerUserId) return { blocked: true }
  await blockAccount(blockerUserId, blockedUserId)
  // The blocked person must stop seeing the blocker's page on the very next
  // request, not when the held copy expires.
  forgetPublicProfile(handle)
  // Both held feeds, not just the blocker's. The feed is held per viewer, so
  // the blocked person's copy still named the blocker until it expired —
  // which is exactly the kind of leak a block is supposed to close.
  forgetFollowingFeed(blockerUserId)
  forgetFollowingFeed(blockedUserId)
  return { blocked: true }
}

export async function unblockByHandle(blockerUserId: string, handle: string) {
  const blockedUserId = await accountForHandle(handle)
  if (!blockedUserId) return { blocked: false }
  await unblockAccount(blockerUserId, blockedUserId)
  forgetPublicProfile(handle)
  return { blocked: false }
}

/** Who this person has blocked, for their own Settings card. */
export async function listBlockedAccounts(blockerUserId: string) {
  return db
    .select({
      handle: pomodoroProfiles.handle,
      name: pomodoroProfiles.publicDisplayName,
      blockedAt: pomodoroBlocks.createdAt,
    })
    .from(pomodoroBlocks)
    .innerJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroBlocks.blockedUserId)
    )
    .where(eq(pomodoroBlocks.blockerUserId, blockerUserId))
    .orderBy(desc(pomodoroBlocks.createdAt))
    .limit(500)
}
