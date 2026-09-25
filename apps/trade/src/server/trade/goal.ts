import { dayKeyOf, dayStart } from "@/lib/trade/pnl/periods"
import { goalTarget, type Goal, type GoalProgress } from "@/lib/trade/goal"
import { isTradingOverviewWallet } from "@/lib/trade/dashboard/overview"
import { protocolLabel } from "@/lib/protocols/contracts"
import { listWallets, loadWalletSummaries } from "@/server/trade/wallets"
import { loadOverviewFills } from "@/server/trade/trading-overview"
import { loadGoal } from "@/server/trade/prefs"

/**
 * How today is going against the daily goal.
 *
 * **Money made today is money banked today.** It is the same fills, priced the
 * same way, that the P&L page's month grid buckets and the PnL Graph adds up,
 * so today's cell on that grid and this figure are one number. What the open
 * positions are up or down is reported beside it and never inside it: a
 * position opened last week would otherwise count its whole life as today's
 * work, and a good day would appear the moment an old trade moved.
 */

/**
 * How long a wallet sweep is reused for.
 *
 * The header asks every fifteen seconds while somebody has the app open, and
 * every live wallet costs three requests to its exchange on every sweep. The
 * exchange counts them all together and rations us when there are too many,
 * which is what makes a wallet answer with nothing. Money banked today is a
 * plain database read and stays live at every ask; only what the wallets are
 * worth is held on to, and a target that is a minute stale is a target nobody
 * can see move anyway.
 */
const WALLETS_WORTH_MS = 60_000

type RememberedWorth = {
  at: number
  worth: number | null
  openProfit: number | null
  missingVenues: string[]
}

const remembered = new Map<string, RememberedWorth>()

export async function loadGoalProgress(
  userId: string
): Promise<{ goal: Goal; progress: GoalProgress }> {
  const goal = await loadGoal(userId)
  if (!goal.on) return { goal, progress: emptyProgress() }

  const [worth, madeToday] = await Promise.all([
    loadWalletsWorth(userId),
    moneyBankedToday(userId),
  ])

  return {
    goal,
    progress: {
      made: madeToday.money,
      target: goalTarget(goal, worth.worth),
      walletsWorth: worth.worth,
      openProfit: worth.openProfit,
      missingVenues: worth.missingVenues,
      unpricedFills: madeToday.unpriced,
    },
  }
}

function emptyProgress(): GoalProgress {
  return {
    made: null,
    target: null,
    walletsWorth: null,
    openProfit: null,
    missingVenues: [],
    unpricedFills: 0,
  }
}

/**
 * What every live mainnet wallet that answered is worth, and what its open
 * positions are up or down. A wallet that did not answer is left out of both
 * figures and its exchange is named instead, because a total missing one
 * account is not a smaller total, it is a wrong one.
 */
export async function loadWalletsWorth(
  userId: string
): Promise<RememberedWorth> {
  const held = remembered.get(userId)
  if (held && Date.now() - held.at < WALLETS_WORTH_MS) return held

  const read = await loadWalletSummaries(userId)
  const byId = new Map(read.summaries.map((one) => [one.walletId, one]))
  const wallets = read.wallets.filter(isTradingOverviewWallet)

  let worth: number | null = null
  let openProfit: number | null = null
  const missing = new Set<string>()
  for (const wallet of wallets) {
    const summary = byId.get(wallet.id)
    if (summary?.state === "ok") {
      worth = (worth ?? 0) + summary.equity
      openProfit = (openProfit ?? 0) + summary.openProfit
      continue
    }
    // "inactive" is a wallet switched off on purpose, so nothing is missing.
    if (summary?.state === "unreachable" || summary?.state === "unread") {
      missing.add(protocolLabel(wallet.protocol))
    }
  }

  const fresh: RememberedWorth = {
    at: Date.now(),
    worth,
    openProfit,
    missingVenues: [...missing].sort(),
  }
  // Anybody else's held sweep is past using by now, and this map lives as long
  // as the server does. Dropping the stale ones here costs nothing and keeps
  // it the size of who is actually looking at a goal.
  for (const [id, older] of remembered) {
    if (fresh.at - older.at >= WALLETS_WORTH_MS) remembered.delete(id)
  }
  remembered.set(userId, fresh)
  return fresh
}

/**
 * Settled dollars from every priced fill of today's Toronto day.
 *
 * The wallet LIST comes straight from the database. Asking the exchanges what
 * those wallets are worth is the expensive half and it is held for a minute in
 * `loadWalletsWorth`; this half is a single indexed read and stays live.
 */
async function moneyBankedToday(
  userId: string
): Promise<{ money: number; unpriced: number }> {
  const wallets = (await listWallets(userId)).filter(isTradingOverviewWallet)
  const since = dayStart(dayKeyOf(Date.now()))
  const fills = await loadOverviewFills(userId, wallets, since)

  let money = 0
  let unpriced = 0
  for (const fill of fills) {
    if (fill.money === null) unpriced += 1
    else money += fill.money
  }
  return { money, unpriced }
}

/** Forget a remembered wallet total, so the next read asks the exchanges. */
export function forgetGoalWallets(userId: string): void {
  remembered.delete(userId)
}
