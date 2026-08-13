import {
  marketKey,
  type NetworkId,
  type ProtocolId,
  type WalletPortfolio,
} from "@/lib/protocols/contracts"
import type { PaperOrder, PaperPosition } from "@/lib/trade/paper"

/**
 * Live trading in the app's own words — browser-safe on purpose, like its
 * paper twin. The server reads the exchange; this file holds the shapes and
 * the translation into the SAME row types the tables and chart lines already
 * draw, so a real position and a practice one go down the one code path.
 *
 * The one honest difference is kept, not smoothed over: a live row carries
 * the exchange's OWN margin and liquidation figures, and the screens prefer
 * those over the formulas — for real money the exchange's number is the one
 * that will actually be enforced.
 */

/**
 * What a live journal row records was done.
 *
 * Nothing on screen reads this table any more — the Journal is built from
 * fills. It is still written on every instruction and every refusal, because
 * it is the record you go digging through when a real order has gone wrong,
 * and the background engine trades with nobody watching and no toast to see.
 */
export type LiveJournalAction =
  /** An order that filled straight away — a real fill at a real price. */
  | "fill"
  /** An order left resting in the book. */
  | "placed"
  | "cancelled"
  /** A position closed by hand. */
  | "close"
  /** The stop / target riding on a position changed. */
  | "brackets"
  /** The exchange, or this app's own rails, said no. */
  | "refused"

/**
 * One live wallet's exchange answer as the rows the screens draw. Ids are
 * deliberately stable per (wallet, market) and per exchange order id, so
 * React keys and optimistic drags hold across polls.
 */
export function livePortfolioRows(
  wallet: { id: string; protocol: ProtocolId; network: NetworkId },
  portfolio: WalletPortfolio,
  /** "Now" handed in so the mapping stays pure and testable. */
  now: number
): { positions: PaperPosition[]; orders: PaperOrder[] } {
  const keyOf = (marketId: string) =>
    marketKey({ protocol: wallet.protocol, network: wallet.network, marketId })

  const positions = portfolio.positions.map((position): PaperPosition => ({
    id: `live:${wallet.id}:${position.marketId}`,
    walletId: wallet.id,
    marketKey: keyOf(position.marketId),
    szi: position.szi,
    entryPx: position.entryPx,
    leverage: position.leverage,
    // Unused for live rows — the screens read `live.liquidationPx` instead of
    // the formula this feeds. Carried so the shape stays one shape.
    maxLeverage: position.leverage,
    tpPx: position.tpPx,
    slPx: position.slPx,
    feesPaid: 0,
    updatedAt: now,
    live: {
      marginUsed: position.marginUsed,
      liquidationPx: position.liquidationPx,
      tpOrderId: position.tpOrderId,
      slOrderId: position.slOrderId,
    },
  }))

  const orders = portfolio.orders.map((order): PaperOrder => ({
    id: order.orderId,
    walletId: wallet.id,
    marketKey: keyOf(order.marketId),
    side: order.side,
    px: order.px,
    sz: order.sz,
    // A real order's leverage is the account's setting, not the order's; the
    // table shows a dash for live rows rather than a number nobody set here.
    leverage: 0,
    maxLeverage: 0,
    reduceOnly: order.reduceOnly,
    tpPx: null,
    slPx: null,
    createdAt: now,
    updatedAt: now,
    live: true,
  }))

  return { positions, orders }
}

/**
 * The wallet-card warning for a trading key's expiry, or null while there is
 * nothing to say. Wordy on purpose — it appears exactly when acting on it
 * matters, and says what to do.
 */
export function keyExpiryWarning(
  keyValidUntil: number | null,
  now: number
): string | null {
  if (keyValidUntil === null) return null
  const msLeft = keyValidUntil - now
  if (msLeft <= 0) {
    return "The trading key has expired — orders will be refused. Create a fresh API key on Hyperliquid and save it here."
  }
  const daysLeft = Math.ceil(msLeft / 86_400_000)
  if (daysLeft > 14) return null
  return `The trading key expires in ${daysLeft === 1 ? "1 day" : `${daysLeft} days`}. Renew it on Hyperliquid and save the new key here.`
}

/**
 * A wallet the exchange would not answer for keeps the rows it last had.
 *
 * **A read that failed is not "you are holding nothing".** The live read asks
 * the exchange on every pass, and any hiccup — a rate limit most often, since
 * the exchange counts every request from one machine together — makes that one
 * wallet answer with nothing at all. Drawn straight, a real position blinked
 * out of the table and back a few seconds later, over and over. On a screen
 * about real money that reads as "the position is gone", which is the one
 * thing it must never say by accident.
 *
 * So the last figures stand until a read actually lands. They are a few
 * seconds stale, and the account panel already says the wallet could not be
 * reached, which is the honest version of what happened. A wallet that has
 * been deleted stops being asked about at all, so its rows go for good.
 *
 * The practice engine never had this: it reads from our own database, which
 * does not ration.
 */
export function keepUnreachableRows<
  Answer extends {
    positions: PaperPosition[]
    orders: PaperOrder[]
    unreachable: string[]
  },
>(was: Answer | null, next: Answer): Answer {
  if (!was || next.unreachable.length === 0) return next
  const stale = new Set(next.unreachable)
  const held = <Row extends { walletId: string }>(rows: Row[]): Row[] =>
    rows.filter((row) => stale.has(row.walletId))
  return {
    ...next,
    positions: [...next.positions, ...held(was.positions)],
    orders: [...next.orders, ...held(was.orders)],
  }
}
