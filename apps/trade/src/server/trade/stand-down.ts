import { laddersAndGridsYouPlaced } from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { cancelLiveGridRest } from "@/server/trade/live-grid-orders"
import { cancelLiveLadderRest } from "@/server/trade/live-smart-orders"
import { cancelGridRest as cancelGridRestRows } from "@/server/trade/grid-orders"
import {
  cancelLadderRest as cancelRestRows,
  listActiveSmartOrders,
} from "@/server/trade/smart-orders"

/**
 * Standing every ladder and grid on one wallet down.
 *
 * **It reuses the cancels that already exist**, one per order, rather than
 * writing a second path into the exchange. Each of those is the same door the
 * order's own Stop button uses, so an emergency press can never call an order
 * off differently from a hand on each one.
 *
 * **One at a time, in order.** A live wallet's cancels already queue behind
 * each other on a lock, so firing them together would only pile up requests at
 * an exchange that is probably already busy — this is a button pressed when a
 * market is moving. What is bought stays bought either way.
 *
 * Two buttons share this: the Smart tick in the bottom panel's Close all menu,
 * and emptying a wallet, which stands everything down before it sells anything.
 * Written here rather than in one of them so the two can never drift apart.
 */

/** One ladder or grid, named the way a message about it would name it. */
export type StoodDownSmartOrder = {
  id: string
  marketKey: string
  kind: "dca" | "grid"
}

/** One that would not come off, and the exchange's reason in plain words. */
export type RefusedSmartOrder = StoodDownSmartOrder & { reason: string }

/**
 * Stands them all down and says what happened to each.
 *
 * **A refusal is a result, not a throw.** Four off and two refused is a real
 * answer, and the caller decides what it means: the bottom panel's button
 * names the two and leaves them on screen, while emptying a wallet stops
 * rather than selling with a ladder still live under it.
 *
 * `describeError` turns whatever the exchange or the database said into words
 * here, so nothing raw ever reaches the browser.
 */
export async function standDownWallet(
  userId: string,
  wallet: TradeWallet,
  describeError: (error: unknown) => string
): Promise<{ stood: StoodDownSmartOrder[]; refused: RefusedSmartOrder[] }> {
  const live = wallet.kind === "live"
  const working = laddersAndGridsYouPlaced(
    await listActiveSmartOrders(userId, [wallet.id])
  )

  const stood: StoodDownSmartOrder[] = []
  const refused: RefusedSmartOrder[] = []
  for (const order of working) {
    const named = { id: order.id, marketKey: order.marketKey, kind: order.kind }
    try {
      if (order.kind === "dca") {
        const input = { ladderId: order.id }
        if (live) await cancelLiveLadderRest(userId, wallet, input)
        else await cancelRestRows(userId, wallet, input)
      } else {
        const input = { gridId: order.id }
        if (live) await cancelLiveGridRest(userId, wallet, input)
        else await cancelGridRestRows(userId, wallet, input)
      }
      stood.push(named)
    } catch (error) {
      refused.push({ ...named, reason: describeError(error) })
    }
  }
  return { stood, refused }
}
