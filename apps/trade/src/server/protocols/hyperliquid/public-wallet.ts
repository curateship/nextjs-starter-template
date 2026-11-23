import { z } from "zod"

import { HYPERLIQUID_FILL_LIMIT } from "@/lib/free-tools/wallet-checker"
import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"
import { readHyperliquidFill } from "@/server/protocols/hyperliquid/fill"

/**
 * Two plain reads of any wallet, for the public wallet checker.
 *
 * **Deliberately not the engine's reads.** `orders.ts` answers the same two
 * questions for a wallet this app trades: off the open socket where it can,
 * through the feed's gap bookkeeping where it cannot, and across every
 * sub-market a wallet has money on. All of that exists to keep a wallet the
 * engine watches every second cheap, and none of it fits a stranger's address
 * a visitor pasted once. These ask the exchange once, cost 22 of the 1,200
 * request-weight a minute, and subscribe to nothing.
 */

/**
 * Only the position size is read. A visitor is told how many positions are
 * open and never which coins, so the entry price, the margin and the
 * liquidation price the engine's own reader insists on are not asked for.
 */
const positionsSchema = z.object({
  assetPositions: z.array(
    z.object({ position: z.object({ szi: z.string() }) })
  ),
})

export type PublicWalletActivity = {
  /** Newest first, as the exchange returns them. */
  fills: WalletOrderFill[]
  /** The exchange gave all it will for one question, so older fills exist. */
  capped: boolean
  /** Positions open right now on the main perps market. */
  openPositions: number
}

/**
 * Everything the wallet checker asks Hyperliquid about one address.
 *
 * **Newest first, on purpose.** Asking from the beginning of time returns the
 * OLDEST rows the exchange will part with, which for a busy wallet is ancient
 * history and no help at all to a page whose headline is the last 30 days.
 * `reversed` turns the answer round, so the rows are the most recent ones and
 * the page can say honestly where the history it has starts.
 *
 * **The main perps market only.** Hyperliquid hosts ten markets on the real
 * network and there is no one question covering them all; asking each is ten
 * calls for one visitor. Positions on a sub-market are not counted, and the
 * page's doc says so.
 */
export async function readPublicWalletActivity(
  network: NetworkId,
  address: string
): Promise<PublicWalletActivity> {
  const user = address.toLowerCase() as `0x${string}`
  const client = infoClient(network)
  const [rows, state] = await Promise.all([
    client.userFillsByTime({ user, startTime: 0, reversed: true }),
    client.clearinghouseState({ user }),
  ])

  const fills: WalletOrderFill[] = []
  for (const row of rows) {
    const fill = readHyperliquidFill(row)
    // A row this app cannot read is skipped rather than throwing the whole
    // answer away: one odd fill out of two thousand must not turn a working
    // page into an error, and the figures move by that fill alone.
    if (fill) fills.push(fill)
  }

  const positions = positionsSchema.parse(state)
  return {
    fills,
    capped: rows.length >= HYPERLIQUID_FILL_LIMIT,
    // `num` rather than `Number`, and the same two conditions the engine's
    // own reader uses (`orders.ts`): a size that is not a number is not a
    // position, and `Number("")` being 0 while `Number("x")` is NaN would
    // otherwise count an unreadable row as an open position.
    openPositions: positions.assetPositions.filter(({ position }) => {
      const size = num(position.szi)
      return size !== null && size !== 0
    }).length,
  }
}
