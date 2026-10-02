import { and, eq, or } from "drizzle-orm"

import { db } from "@/server/db"
import { pomodoroBlocks, pomodoroFollows } from "@/server/pomodoro/schema"

/**
 * Blocking, in one file, because a block is only worth having if it holds
 * everywhere.
 *
 * **Every list of people in this app calls one of these three functions.** A
 * block checked on the profile page and nowhere else leaks straight round the
 * side through the leaderboard, a group board, the following feed and room
 * chat, which is four separate bugs rather than one. The check is written
 * once here so there is no second copy to drift.
 *
 * A block is one-directional in the table and symmetric in effect: if either
 * of you has blocked the other, neither sees the other anywhere. Storing it
 * one way keeps "who did this" answerable; reading it both ways is what makes
 * it a block rather than a mute.
 *
 * **The blocked person learns nothing.** A blocked profile answers the same
 * 404 as one that was never there, a cheer is accepted and dropped, and no
 * list ever says somebody was removed from it. Nothing here returns a reason.
 */

/**
 * How many block rows one page read will load. There is no cap on blocking
 * itself (Tyler's call, 2 Oct 2026), so the read needs one of its own.
 */
const BLOCK_READ_LIMIT = 2_000

/** Whether either account has blocked the other. */
export async function isBlockedBetween(
  viewerUserId: string | null,
  otherUserId: string
) {
  if (!viewerUserId || viewerUserId === otherUserId) return false
  const [row] = await db
    .select({ id: pomodoroBlocks.id })
    .from(pomodoroBlocks)
    .where(blockedPair(viewerUserId, otherUserId))
    .limit(1)
  return Boolean(row)
}

/**
 * Every account the viewer may not see and that may not see them, as a set.
 *
 * This is what a list uses. One query for the whole page, rather than one
 * question per row, which is the shape that turns a 100-row board into 101
 * queries.
 */
export async function blockedUserIdsFor(
  viewerUserId: string | null
): Promise<Set<string>> {
  if (!viewerUserId) return new Set()
  const rows = await db
    .select({
      blockerUserId: pomodoroBlocks.blockerUserId,
      blockedUserId: pomodoroBlocks.blockedUserId,
    })
    .from(pomodoroBlocks)
    .where(
      or(
        eq(pomodoroBlocks.blockerUserId, viewerUserId),
        eq(pomodoroBlocks.blockedUserId, viewerUserId)
      )
    )
    // Bounded, because this runs on nearly every page and blocks are
    // deliberately uncapped. Far beyond what a real account reaches, and it
    // stops one person's block list becoming everybody else's slow page.
    .limit(BLOCK_READ_LIMIT)
  const hidden = new Set<string>()
  for (const row of rows) {
    // Whichever end of the row is not the viewer is the account to hide.
    hidden.add(
      row.blockerUserId === viewerUserId ? row.blockedUserId : row.blockerUserId
    )
  }
  return hidden
}

function blockedPair(a: string, b: string) {
  return or(
    and(
      eq(pomodoroBlocks.blockerUserId, a),
      eq(pomodoroBlocks.blockedUserId, b)
    ),
    and(
      eq(pomodoroBlocks.blockerUserId, b),
      eq(pomodoroBlocks.blockedUserId, a)
    )
  )
}

/**
 * Blocks an account, and tears down any follow in either direction in the
 * same transaction.
 *
 * Blocking somebody who is already blocked is the same block: the unique
 * index decides, so a double press cannot make two rows. There is no cap —
 * Tyler's call, 2 Oct 2026, because refusing a block costs the person being
 * harassed far more than a long list costs the database.
 */
export async function blockAccount(
  blockerUserId: string,
  blockedUserId: string
) {
  if (blockerUserId === blockedUserId) throw new Error("CANNOT_BLOCK_SELF")
  await db.transaction(async (tx) => {
    await tx
      .insert(pomodoroBlocks)
      .values({ blockerUserId, blockedUserId })
      .onConflictDoNothing()
    // A block that left the follow in place would keep them on each other's
    // boards, which is the thing the block is for.
    await tx
      .delete(pomodoroFollows)
      .where(
        or(
          and(
            eq(pomodoroFollows.followerUserId, blockerUserId),
            eq(pomodoroFollows.followedUserId, blockedUserId)
          ),
          and(
            eq(pomodoroFollows.followerUserId, blockedUserId),
            eq(pomodoroFollows.followedUserId, blockerUserId)
          )
        )
      )
  })
}

/** Unblocks. The follows the block tore down are not restored. */
export async function unblockAccount(
  blockerUserId: string,
  blockedUserId: string
) {
  await db
    .delete(pomodoroBlocks)
    .where(
      and(
        eq(pomodoroBlocks.blockerUserId, blockerUserId),
        eq(pomodoroBlocks.blockedUserId, blockedUserId)
      )
    )
}
