import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm"

import { BAN_LOOK_GAP_MS } from "@/lib/bans/options"
import { isAwake } from "@/lib/social/waking"
import { handleWords, NETWORK_NAMES, isNetwork } from "@/lib/social/networks"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { queuePhoneAction } from "@/server/phones/queue"
import { accountTimeZone, readBehaviour } from "@/server/social/behaviour"
import { queueJob } from "@/server/social/jobs"
import { ringBell } from "@/server/social/notices"
import { pausedBy } from "@/server/social/pause"
import { promoAccounts } from "@/server/social/schema"

import { promoBans } from "./schema"

/**
 * The weekly look at banned accounts (Bans task, part 26), so an account that
 * comes back is not left idle. Once a week, inside its waking hours, the
 * phone opens each banned account's app and reads the screen; it never taps,
 * scrolls, posts or types. A browser account gets the same look in its
 * profile. With no ban screen, the bell asks "Let it run again?" and the
 * account keeps its ban until a person presses the button.
 *
 * Retired accounts and accounts already cleaned up are skipped. A held or
 * offline phone waits until the next week. The first look is a week after
 * the ban.
 */

/** The phone actions that only open an app and read its screen, one per app. */
const BAN_LOOK_ACTIONS = {
  reddit: "reddit/ban_look",
  instagram: "instagram/ban_look",
  tiktok: "tiktok/ban_look",
  medium: "medium/ban_look",
  x: "x/ban_look",
  linkedin: "linkedin/ban_look",
} as const

export async function queueBanLooks(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const due = new Date(now.getTime() - BAN_LOOK_GAP_MS)
  const rows = await db
    .select({ ban: promoBans, account: promoAccounts })
    .from(promoBans)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoBans.accountId))
    .where(
      and(
        isNull(promoBans.letRunAt),
        isNull(promoBans.cleanedUpAt),
        isNotNull(promoAccounts.banScreenAt),
        isNull(promoAccounts.retiredAt),
        or(and(isNull(promoBans.lookedAt), lte(promoBans.at, due)), lte(promoBans.lookedAt, due))
      )
    )
    .limit(100)
  let queued = 0
  for (const { ban, account } of rows) {
    if (await pausedBy(account.userId, account, db)) continue
    const behaviour = await readBehaviour(account.userId, db)
    const zone = await accountTimeZone(account, db)
    if (!isAwake(now, zone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute)) continue
    // Marked first: a held or offline phone waits until the next week.
    await db.update(promoBans).set({ lookedAt: now }).where(eq(promoBans.id, ban.id))
    const action = BAN_LOOK_ACTIONS[account.platform as keyof typeof BAN_LOOK_ACTIONS]
    if (account.phoneId && action) {
      try {
        await queuePhoneAction(account.userId, account.phoneId, action, db, now, { args: { accountId: account.id, banId: ban.id } })
        queued += 1
      } catch {
        // Held, offline or on a quiet rack: next week.
      }
    } else if (account.profileId) {
      await queueJob(account.userId, "ban_look", { accountId: account.id, banId: ban.id }, db)
      queued += 1
    }
  }
  return queued
}

/**
 * A look's answer: the app open and signed in with no ban screen rings "Let
 * it run again?" once. A ban screen still showing rings nothing, and so does
 * an app that opened signed out or showed nothing of its own yet, because a
 * disabled account is often only signed out. Either way the account keeps
 * its ban.
 */
export async function finishBanLook(
  userId: string,
  input: { accountId: string; banId: string; banSeen: boolean; signedIn: boolean },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (input.banSeen || !input.signedIn) return
  const [row] = await db
    .select({ handle: promoAccounts.handle, platform: promoAccounts.platform, banScreenAt: promoAccounts.banScreenAt })
    .from(promoAccounts)
    .innerJoin(promoBans, eq(promoBans.accountId, promoAccounts.id))
    .where(and(eq(promoAccounts.id, input.accountId), eq(promoAccounts.userId, userId), eq(promoBans.id, input.banId), isNull(promoBans.letRunAt)))
    .limit(1)
  if (!row?.banScreenAt) return
  await db.update(promoBans).set({ looksBackAt: now }).where(eq(promoBans.id, input.banId))
  const who = handleWords(row.platform, row.handle) || "The account"
  const app = isNetwork(row.platform) ? NETWORK_NAMES[row.platform] : row.platform
  await ringBell(
    userId,
    {
      kind: "looks_back",
      targetId: input.accountId,
      message: `Looks back: ${who}. Let it run again?`,
      detail: `${who} looks back. Let it run again? This week's look opened ${app} and found no ban screen. It stays stopped until you press Let it run again in its settings on the Accounts dashboard.`,
      href: `/admin/bans?open=${encodeURIComponent(input.banId)}`,
    },
    db,
    now
  )
}

/** The account and ban a phone look or a browser look names, from its arguments. */
export function banLookArgs(args: Record<string, unknown> | null): { accountId: string; banId: string } | null {
  const accountId = typeof args?.accountId === "string" ? args.accountId : ""
  const banId = typeof args?.banId === "string" ? args.banId : ""
  return accountId && banId ? { accountId, banId } : null
}

/** Whether this phone action is a weekly look. */
export function isBanLookAction(action: string): boolean {
  return (Object.values(BAN_LOOK_ACTIONS) as string[]).includes(action)
}
