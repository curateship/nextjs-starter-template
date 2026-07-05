import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { getInfoClient } from "@/server/hyperliquid/info"
import { isMainnetEnabled } from "@/server/hyperliquid/transport"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import { tradingAccountSnapshots, tradingWallets } from "@/server/schema"
import { now, uuid } from "@/server/util"

const SNAPSHOT_INTERVAL_MS = 60_000

/**
 * Polls clearinghouseState for every active wallet and appends an
 * account_snapshots row — the data source for equity curves and the
 * portfolio page.
 */
export class SnapshotPoller {
  private timer: NodeJS.Timeout | null = null
  private running = false

  start() {
    void this.tick()
    this.timer = setInterval(() => void this.tick(), SNAPSHOT_INTERVAL_MS)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      const wallets = await db
        .select()
        .from(tradingWallets)
        .where(eq(tradingWallets.isActive, true))

      for (const wallet of wallets) {
        const network = wallet.network as TradingNetwork
        if (network === "mainnet" && !isMainnetEnabled()) continue
        try {
          const address = (wallet.vaultAddress ??
            wallet.accountAddress) as `0x${string}`
          const state = await getInfoClient(network).clearinghouseState({
            user: address,
          })
          const unrealized = state.assetPositions.reduce(
            (sum, { position }) => sum + Number(position.unrealizedPnl),
            0
          )
          await db.insert(tradingAccountSnapshots).values({
            id: uuid(),
            walletId: wallet.id,
            capturedAt: now(),
            equity: state.marginSummary.accountValue,
            marginUsed: state.marginSummary.totalMarginUsed,
            unrealizedPnl: String(unrealized),
            withdrawable: state.withdrawable,
            positions: state.assetPositions.map(({ position }) => ({
              coin: position.coin,
              szi: position.szi,
              entryPx: position.entryPx,
              liqPx: position.liquidationPx,
              uPnl: position.unrealizedPnl,
            })),
          })
        } catch (error) {
          console.error(
            `snapshot failed for wallet ${wallet.label}:`,
            error instanceof Error ? error.message.slice(0, 200) : error
          )
        }
      }
    } finally {
      this.running = false
    }
  }
}
