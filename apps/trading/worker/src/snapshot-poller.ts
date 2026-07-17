import { eq } from "drizzle-orm"

import { loadTradingAccountState } from "@/lib/hl/account-balance"
import {
  evaluateLiquidationAlerts,
  LIQUIDATION_ALERT_COOLDOWN_MS,
  liquidationAlertThresholdFromSettings,
  positionMarkPx,
} from "@/lib/trading/liquidation-risk"
import { db } from "@/server/db"
import { getInfoClient } from "@/server/hyperliquid/info"
import { isMainnetEnabled } from "@/server/hyperliquid/transport"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  customShellSettings,
  tradingAccountSnapshots,
  tradingNotifications,
  tradingWallets,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

import { GuardianMonitor, type GuardianReading } from "./guardian-monitor"

const SNAPSHOT_INTERVAL_MS = 60_000

/**
 * Polls clearinghouseState for every active wallet and appends an
 * account_snapshots row — the data source for equity curves and the
 * portfolio page. The same fresh data feeds the liquidation-proximity alert:
 * a position whose distance to liquidation drops inside the saved threshold
 * writes a `liquidation_risk` trading notification, rate-limited per
 * position and deduped in the database so restarts cannot double-alert.
 * The per-tick equity readings also drive the bot guardian — the automatic
 * account-level kill switch (see guardian-monitor.ts).
 */
export class SnapshotPoller {
  private timer: NodeJS.Timeout | null = null
  private running = false
  /** walletId:coin → last alert time, the in-memory alert rate limit. */
  private lastLiquidationAlertAt = new Map<string, number>()
  private readonly guardian = new GuardianMonitor()

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
      const thresholdPct = await this.liquidationThresholdPct()
      const guardianReadings: GuardianReading[] = []

      for (const wallet of wallets) {
        const network = wallet.network as TradingNetwork
        if (network === "mainnet" && !isMainnetEnabled()) continue
        try {
          const address = (wallet.vaultAddress ??
            wallet.accountAddress) as `0x${string}`
          const accountState = await loadTradingAccountState(
            getInfoClient(network),
            address
          )
          const state = accountState.clearinghouseState
          const unrealized = state.assetPositions.reduce(
            (sum, { position }) => sum + Number(position.unrealizedPnl),
            0
          )
          await db.insert(tradingAccountSnapshots).values({
            id: uuid(),
            walletId: wallet.id,
            capturedAt: now(),
            equity: accountState.equity,
            marginUsed: state.marginSummary.totalMarginUsed,
            unrealizedPnl: String(unrealized),
            withdrawable: accountState.withdrawable,
            positions: state.assetPositions.map(({ position }) => ({
              coin: position.coin,
              szi: position.szi,
              entryPx: position.entryPx,
              liqPx: position.liquidationPx,
              uPnl: position.unrealizedPnl,
            })),
          })
          await this.alertLiquidationRisk(
            wallet.id,
            wallet.userId,
            state.assetPositions,
            thresholdPct
          )
          // A malformed equity string must read as a failed snapshot, not a
          // NaN that silently poisons the guardian's account total.
          const equity = Number(accountState.equity)
          guardianReadings.push({
            userId: wallet.userId,
            walletId: wallet.id,
            equity: Number.isFinite(equity) ? equity : null,
          })
        } catch (error) {
          console.error(
            `snapshot failed for wallet ${wallet.label}:`,
            error instanceof Error ? error.message.slice(0, 200) : error
          )
          // A failed wallet still counts — the guardian must know this tick's
          // account total is incomplete rather than mistake it for a loss.
          guardianReadings.push({
            userId: wallet.userId,
            walletId: wallet.id,
            equity: null,
          })
        }
      }
      await this.guardian.check(guardianReadings).catch((error: unknown) => {
        // The kill switch failing silently would be the worst failure mode.
        console.error(
          "guardian check failed:",
          error instanceof Error ? error.message.slice(0, 200) : error
        )
      })
    } finally {
      this.running = false
    }
  }

  /** The saved alert threshold (percent, 0 = off), lenient on old rows. */
  private async liquidationThresholdPct(): Promise<number> {
    try {
      const [row] = await db
        .select({ settings: customShellSettings.settings })
        .from(customShellSettings)
        .where(eq(customShellSettings.key, "default"))
        .limit(1)
      return liquidationAlertThresholdFromSettings(row?.settings)
    } catch (error) {
      // Alerts stay off for this tick, but never silently.
      console.error(
        "snapshot poller: could not read the liquidation alert threshold:",
        error instanceof Error ? error.message.slice(0, 200) : error
      )
      return 0
    }
  }

  private async alertLiquidationRisk(
    walletId: string,
    userId: string,
    assetPositions: {
      position: {
        coin: string
        szi: string
        positionValue: string
        liquidationPx: string | null
      }
    }[],
    thresholdPct: number
  ) {
    const nowMs = Date.now()
    const drafts = evaluateLiquidationAlerts({
      walletId,
      thresholdPct,
      now: nowMs,
      lastAlertAt: this.lastLiquidationAlertAt,
      positions: assetPositions.map(({ position }) => ({
        coin: position.coin,
        szi: Number(position.szi),
        liquidationPx: position.liquidationPx
          ? Number(position.liquidationPx)
          : null,
        markPx: positionMarkPx(position.positionValue, position.szi),
      })),
    })
    if (drafts.length === 0) return
    // The event key buckets time by the cooldown, so even across worker
    // restarts (which reset the in-memory rate limit) one window can only
    // ever produce one row per position — the unique (user, event) index
    // swallows duplicates.
    const bucket = Math.floor(nowMs / LIQUIDATION_ALERT_COOLDOWN_MS)
    await db
      .insert(tradingNotifications)
      .values(
        drafts.map((draft) => ({
          id: uuid(),
          userId,
          walletId,
          eventKey: `liq:${walletId}:${draft.coin}:${bucket}`,
          kind: "liquidation_risk",
          coin: draft.coin,
          side: draft.side,
          price: String(draft.liquidationPx),
          size: String(draft.size),
          occurredAt: now(),
          createdAt: now(),
        }))
      )
      .onConflictDoNothing({
        target: [tradingNotifications.userId, tradingNotifications.eventKey],
      })
  }
}
