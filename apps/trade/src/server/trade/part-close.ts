import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { floorSize } from "@/lib/trade/dca"
import {
  minimumOrderDollars,
  minimumOrderUsd,
  orderDollars,
} from "@/lib/trade/market-info"
import type { TradeSide } from "@/lib/trade/paper"
import type { WatchPlan } from "@/lib/trade/watch-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { liveHeldPosition, setLiveBrackets } from "@/server/trade/live-orders"
import { marketRules } from "@/server/trade/market-rules"
import { setPaperBrackets, settleWallet } from "@/server/trade/paper"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"

/**
 * Selling part of a position instead of all of it.
 *
 * ## Why this is not the close button with a number on it
 *
 * The whole-position close is a capped market order: it pays the spread and
 * the taker fee to get out right now, which is what somebody pressing "close
 * everything" is asking for. `trading-rules.md` says a close chases a
 * post-only limit, and taking some profit off a winner is exactly the case
 * where that matters — the trade is going your way, there is no hurry, and
 * the spread is money.
 *
 * ## So a part close is a chased maker order, and the engine does the chasing
 *
 * Nothing here sends anything to an exchange. One smart-order row is written,
 * and the engine's next pass rests a reduce-only post-only limit just off the
 * price and follows it until it fills — the same chase a watched order runs,
 * with the same ten-second spacing and the same "is it worth moving" test. See
 * `maker` on `WatchPlan` for the one flag that separates the two.
 *
 * That also means the practice lane and the real lane need no separate code
 * here. The engine already knows how to place an order in either, and a
 * practice run that filled instantly where the real one had to queue would
 * make practice a worse guide than no practice at all.
 *
 * ## It never gives up
 *
 * `chaseGiveUp` is zero, so the order follows the price for as long as it
 * takes. That is the app's existing rule and not an oversight: being half out
 * of a position is worse than any price the rest would have got. The way to
 * call one off is the × on its resting order, which stops the close rather
 * than taking one order back — see `cancel` in `use-trading.ts`.
 */

/**
 * What a close was asked for in: coins, dollars at today's price, or all of it.
 *
 * `all` is not the same as passing the held size in coins. The held size falls
 * through the "what is left would be too small to be an order" rule and comes
 * back as `whole`, which sends the caller to the market-order close. `all`
 * says "the whole position, and chase it" — which is what emptying a wallet
 * wants, because there the point of the press is not to be out this second.
 */
export type PartCloseSize =
  | { unit: "coins"; amount: number }
  | { unit: "usd"; amount: number }
  | { unit: "all" }

/**
 * What the wallet holds of this market. Handed in by a caller that has just
 * read it — emptying a wallet reads every position at once — so four coins do
 * not become four whole-account reads on the one press made while a market is
 * moving. Left out, it is read here.
 */
export type HeldPosition = {
  szi: number
  leverage: number
  tpPx: number | null
  tpSz: number | null
  slPx: number | null
}

export type PartCloseOutcome =
  | { kind: "chasing"; sz: number; px: number }
  /** The size covers the whole position, so the caller does the whole close. */
  | { kind: "whole" }

/**
 * Opens a chased part close, or says the ask was really the whole position.
 *
 * **The dollars-to-coins sum happens here and nowhere else.** The confirm shows
 * both figures so nothing is a surprise, but the price it showed them at is a
 * second or two old by the time the press lands. Converting here, against the
 * price the exchange is quoting now, is what stops a $500 ask turning into 503
 * dollars' worth of coin.
 */
export async function openPartClose(
  userId: string,
  wallet: TradeWallet,
  input: {
    marketKey: string
    size: PartCloseSize
    /** Already read by the caller — see `HeldPosition`. */
    held?: HeldPosition
  }
): Promise<PartCloseOutcome> {
  const ref = parseMarketKey(input.marketKey)
  if (
    !ref ||
    ref.protocol !== wallet.protocol ||
    ref.network !== wallet.network
  ) {
    throw new Error("PART_CLOSE_MARKET")
  }
  const protocol = getProtocol(wallet.protocol)
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PART_CLOSE_MARKET")

  const prices = await protocol.markets.prices(wallet.network, [ref.marketId])
  const mark = prices.get(ref.marketId)
  if (mark === undefined || !(mark > 0)) throw new Error("PART_CLOSE_NO_PRICE")

  const held = input.held ?? (await heldPosition(userId, wallet, input.marketKey))
  if (held === null) throw new Error("PART_CLOSE_POSITION_GONE")
  const heldSz = Math.abs(held.szi)

  // Dollars become coins at the price the exchange is quoting right now.
  const asked =
    input.size.unit === "all"
      ? heldSz
      : input.size.unit === "coins"
        ? input.size.amount
        : input.size.amount / mark
  if (!Number.isFinite(asked) || asked <= 0) {
    throw new Error("PART_CLOSE_SIZE")
  }
  const smallest = rules.minOrderSize ?? null
  const floor = minimumOrderUsd(
    { minOrderValueUsd: rules.minOrderValueUsd ?? null, minOrderSize: smallest },
    mark
  )
  /** Too small to be an order on this market at today's price. */
  const notAnOrder = (coins: number) =>
    coins <= 0 ||
    (smallest != null && coins + 1e-12 < smallest) ||
    (floor !== null && mark * coins + 1e-9 < floor)

  // **More than the position holds is capped, not refused, and that is the
  // right way round for dollars.** A window showing "sell $95.57, all of it"
  // is quoting a price a second or two old, and if the coin has dropped since
  // then $95.57 buys more coins than the account holds. Refusing there would
  // turn a plain "all of it" press into an error on a falling market, which is
  // the worst moment for one. Nothing can be over-sold by capping: the
  // remainder test below turns it into the ordinary whole close. The window
  // still says "this position only holds X" for an amount typed by hand.
  const sz = floorSize(Math.min(asked, heldSz), rules.sizeDecimals)

  /**
   * A remainder too small to be an order of its own is not a remainder.
   *
   * **This is the whole-position test, and it is a rule rather than a
   * tolerance.** Leaving behind less than the exchange's smallest order leaves
   * a scrap that can never be closed again: from then on the close button
   * itself would be refused. So "sell all but a crumb" means "sell all of it",
   * and the caller takes the ordinary whole-position road.
   *
   * It also covers the near-miss the window makes on its own. The amount box
   * holds cents, and all of a $99.29 position is 35.699133 coins — read back
   * from "99.29" that is 35.699, a hair short, so a press meaning "all of it"
   * would otherwise have offered to leave a fraction of a cent behind.
   */
  if (input.size.unit !== "all" && notAnOrder(heldSz - sz)) {
    return { kind: "whole" }
  }

  if (notAnOrder(sz)) {
    const least = floor ?? mark * 10 ** -(rules.sizeDecimals ?? 0)
    throw new Error(
      `PART_CLOSE_TOO_SMALL:${protocol.label}'s smallest order here is $${minimumOrderDollars(least)}, and this piece is $${orderDollars(mark * sz)}.`
    )
  }

  // **A fixed-size target has to come down to what is left.** A target set to
  // sell a fixed number of coins does not shrink with the position — only a
  // whole-position one does — so after this sells, a target bigger than the
  // remainder is one the exchange refuses when it fires. Brought down here
  // rather than after the fill, because the fill happens in the engine minutes
  // later and a refused target is a position with no way out. The cost is that
  // a close which never fills leaves a smaller target than was asked for,
  // which sells less than intended and never more.
  const left = heldSz - sz
  if (held.tpPx !== null && held.tpSz !== null && held.tpSz > left) {
    await shrinkTarget(userId, wallet, input.marketKey, {
      tpPx: held.tpPx,
      tpSz: left,
      slPx: held.slPx,
    })
  }

  const now = new Date()
  const side: TradeSide = held.szi > 0 ? "sell" : "buy"
  const plan: WatchPlan = {
    // Where it was asked for, which is what the row on screen shows. It is not
    // a level being waited for: `phase` starts at "taking" precisely because a
    // close has nothing to wait for.
    triggerPx: mark,
    side,
    sz,
    // Leverage is the position's, not this order's — it only reduces.
    leverage: held.leverage > 0 ? held.leverage : 1,
    maxLeverage: rules.maxLeverage ?? 1,
    sizeDecimals: rules.sizeDecimals,
    minOrderSize: rules.minOrderSize ?? null,
    minOrderValueUsd: rules.minOrderValueUsd ?? null,
    priceTick: rules.priceTick,
    // The rest of the position keeps whatever protection it had. This order
    // carries none of its own: it is an exit, not an entry.
    tpPx: null,
    slPx: null,
    reduceOnly: true,
    maker: true,
    // What is left to sell is measured against this, so a fill that lands
    // between two moves of the chase is never asked for twice.
    heldAtStart: heldSz,
    chaseGiveUp: 0,
    phase: "taking",
    sent: false,
    orderId: null,
    orderPx: null,
    missingSince: 0,
    heldWhenPlaced: 0,
    chasedAt: 0,
    chases: 0,
    startedAt: now.getTime(),
  }

  await db.transaction(async (tx) => {
    // The same lock every other placement takes, so two presses on one wallet
    // cannot both read the position and both size themselves against it.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id)))
      .for("update")
    await tx.insert(tradeSmartLadders).values({
      userId,
      id: randomUUID(),
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "watch",
      status: "active",
      plan,
      createdAt: now,
      updatedAt: now,
    })
  })

  return { kind: "chasing", sz, px: mark }
}

/** What the wallet holds of this market, from whichever lane owns it. */
async function heldPosition(
  userId: string,
  wallet: TradeWallet,
  marketKey: string
): Promise<HeldPosition | null> {
  if (wallet.kind === "live") {
    return await liveHeldPosition(userId, wallet.id, marketKey)
  }
  const book = await settleWallet(userId, wallet)
  const held = book.positions.get(marketKey)
  if (!held) return null
  return {
    szi: held.szi,
    leverage: held.leverage,
    tpPx: held.tpPx,
    tpSz: held.tpSz ?? null,
    slPx: held.slPx,
  }
}

/** One door for both lanes, so the shrink cannot be written twice. */
async function shrinkTarget(
  userId: string,
  wallet: TradeWallet,
  marketKey: string,
  brackets: { tpPx: number; tpSz: number; slPx: number | null }
): Promise<void> {
  if (wallet.kind === "live") {
    await setLiveBrackets(userId, { walletId: wallet.id, marketKey, ...brackets })
    return
  }
  await setPaperBrackets(userId, wallet, { marketKey, ...brackets })
}
