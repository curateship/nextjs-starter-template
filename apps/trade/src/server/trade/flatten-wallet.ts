import type { TradeWallet } from "@/lib/trade/wallets"
import { liveHeldPositions } from "@/server/trade/live-orders"
import { settleWallet } from "@/server/trade/paper"
import {
  openPartClose,
  type HeldPosition,
} from "@/server/trade/part-close"
import {
  standDownWallet,
  type RefusedSmartOrder,
  type StoodDownSmartOrder,
} from "@/server/trade/stand-down"

/**
 * Emptying one wallet: everything it holds sold, everything it has waiting
 * called off, in one press.
 *
 * ## The order is fixed, and it is the whole reason this exists
 *
 * **Stand down first, then sell.** Selling first leaves a window where a rung
 * that was waiting below fills and reopens the coin that was just closed. The
 * app's own "Close all" offers the ladders in the same press but lets them be
 * unticked, and then the first rung to fill puts a position straight back.
 * Emptying a wallet never offers that choice.
 *
 * ## A cancel that is refused stops the whole thing
 *
 * If a ladder will not come off, nothing is sold. Selling into a live ladder
 * would leave the wallet flat for a minute and then holding again, which is the
 * opposite of what the press was for — and it would spend money doing it. The
 * refusal is named instead, so the one order in the way can be dealt with by
 * hand and the press tried again.
 *
 * ## Each position is sold as a maker, and the engine does the selling
 *
 * Every close goes through the same chased reduce-only post-only limit a part
 * close uses — see `part-close.ts`. Nothing is sent to an exchange while this
 * runs: one row per position is written and the engine rests and follows the
 * orders. So this returns quickly with a list of what it started, not a list of
 * what sold.
 *
 * **That is a real difference from "Close all", and it is deliberate.** Close
 * all pays the spread on every coin to be out this second. Emptying a wallet is
 * usually the calmer decision — something is wrong and you want this account
 * quiet — and the trading rules say a close chases. If being out this second is
 * what is wanted, "Close all" is still there.
 *
 * ## Every position gets its own attempt
 *
 * One coin the exchange refuses never stops the other three. What did not start
 * is named, and its row stays on screen.
 */

export type FlattenOutcome = {
  /** Ladders and grids called off. */
  stood: StoodDownSmartOrder[]
  /** Ladders and grids that would not come off. Nothing was sold if any. */
  cancelRefused: RefusedSmartOrder[]
  /** Markets whose position is now being sold, by market key. */
  selling: string[]
  /** Markets whose sale would not start, and why. */
  sellRefused: { marketKey: string; reason: string }[]
}

export async function flattenWallet(
  userId: string,
  wallet: TradeWallet,
  describeError: (error: unknown) => string
): Promise<FlattenOutcome> {
  const { stood, refused } = await standDownWallet(userId, wallet, describeError)
  // Nothing is sold while something is still able to buy back in.
  if (refused.length > 0) {
    return { stood, cancelRefused: refused, selling: [], sellRefused: [] }
  }

  // One read for the whole wallet, handed to each close below. Asking the
  // exchange again per coin turned four positions into five whole-account
  // reads, on the one press somebody makes while a market is moving.
  const holdings = await heldPositions(userId, wallet)
  const selling: string[] = []
  const sellRefused: { marketKey: string; reason: string }[] = []

  // One at a time, in order, for the same reason the cancels are: a live
  // wallet's calls queue behind each other anyway, and this press is made when
  // a market is moving and the exchange is already busy.
  for (const { marketKey, held } of holdings) {
    try {
      await openPartClose(userId, wallet, {
        marketKey,
        // The whole position, chased. Not the held size in coins, which the
        // remainder rule would turn back into a market close.
        size: { unit: "all" },
        held,
      })
      selling.push(marketKey)
    } catch (error) {
      sellRefused.push({ marketKey, reason: describeError(error) })
    }
  }

  return { stood, cancelRefused: [], selling, sellRefused }
}

/** Everything this wallet holds, from whichever lane owns it, in one read. */
async function heldPositions(
  userId: string,
  wallet: TradeWallet
): Promise<{ marketKey: string; held: HeldPosition }[]> {
  if (wallet.kind === "live") {
    return await liveHeldPositions(userId, wallet.id)
  }
  const book = await settleWallet(userId, wallet)
  return [...book.positions.values()]
    .filter((one) => Math.abs(one.szi) > 0)
    .map((one) => ({
      marketKey: one.marketKey,
      held: {
        szi: one.szi,
        leverage: one.leverage,
        tpPx: one.tpPx,
        tpSz: one.tpSz ?? null,
        slPx: one.slPx,
      },
    }))
}
