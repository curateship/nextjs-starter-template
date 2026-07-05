import { and, desc, eq, inArray, sql } from "drizzle-orm"
import type { InfoClient } from "@nktkas/hyperliquid"

import { db } from "@/server/db"
import {
  scannerAlerts,
  scannerPositionEvents,
  scannerPositions,
  scannerWallets,
} from "@/server/schema"
import { now, uuid } from "@/server/util"
import type { AlertDraft } from "./alert-engine"
import { formatUsd } from "./format"
import {
  DEFAULT_DIFF_OPTIONS,
  diffPositions,
  type PositionChange,
  type PositionSnapshot,
} from "./diff-positions"
import type { TokenBucket } from "./rate-limiter"

// clearinghouseState weight is 2; polling stays light next to stats refreshes.
const POLL_WEIGHT = 2
const DRAIN_INTERVAL_MS = 3_000
const TRACKED_ROUND_ROBIN_MS = 5 * 60_000
const REPOLL_COOLDOWN_MS = 60_000
const DORMANT_GAP_MS = 30 * 86_400_000
// Alerts only for wallets worth hearing about; the feed page shows everything.
const ALERT_MIN_QUALITY = 70
const ALERT_MIN_NOTIONAL = 100_000

/**
 * Event-driven position tracking: whale-feed activity queues a
 * clearinghouseState re-poll for the taker (deduped, cooldown), plus a slow
 * round-robin over tracked wallets. Diffs are persisted as position events;
 * tracked/high-quality wallets also raise alerts.
 */
export class PositionTracker {
  private readonly info: InfoClient
  private readonly bucket: TokenBucket
  private readonly queue = new Set<string>()
  private readonly lastPolled = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null
  private roundRobinTimer: NodeJS.Timeout | null = null
  private draining = false
  private eventsRecorded = 0

  constructor(info: InfoClient, bucket: TokenBucket) {
    this.info = info
    this.bucket = bucket
  }

  meta() {
    return { positionEvents: this.eventsRecorded, positionQueue: this.queue.size }
  }

  start() {
    this.timer = setInterval(() => void this.drain(), DRAIN_INTERVAL_MS)
    this.roundRobinTimer = setInterval(
      () => void this.enqueueTracked(),
      TRACKED_ROUND_ROBIN_MS
    )
    void this.enqueueTracked()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    if (this.roundRobinTimer) clearInterval(this.roundRobinTimer)
    this.timer = null
    this.roundRobinTimer = null
  }

  /** Called by the trade collector with taker addresses from each flush. */
  enqueue(addresses: Iterable<string>) {
    const cutoff = Date.now() - REPOLL_COOLDOWN_MS
    for (const address of addresses) {
      if ((this.lastPolled.get(address) ?? 0) < cutoff) {
        this.queue.add(address)
      }
    }
  }

  private async enqueueTracked() {
    try {
      const rows = await db
        .select({ address: scannerWallets.address })
        .from(scannerWallets)
        .where(eq(scannerWallets.tracked, true))
      this.enqueue(rows.map((row) => row.address))
    } catch (error) {
      console.error("scanner: tracked wallet enqueue failed", error)
    }
  }

  private async drain() {
    if (this.draining || this.queue.size === 0) return
    this.draining = true
    try {
      const [address] = this.queue
      this.queue.delete(address)
      this.lastPolled.set(address, Date.now())
      await this.bucket.take(POLL_WEIGHT)
      await this.poll(address)
    } catch (error) {
      console.error("scanner: position poll failed", error)
    } finally {
      this.draining = false
    }
  }

  private async poll(address: string) {
    const clearing = await this.info.clearinghouseState({
      user: address as `0x${string}`,
    })

    const next = new Map<string, PositionSnapshot>()
    for (const { position } of clearing.assetPositions) {
      const szi = Number(position.szi)
      if (szi === 0) continue
      next.set(position.coin, {
        coin: position.coin,
        szi,
        entryPx: position.entryPx ? Number(position.entryPx) : null,
        notional: Math.abs(Number(position.positionValue)),
        leverage: Number(position.leverage.value),
        unrealizedPnl: Number(position.unrealizedPnl),
      })
    }

    const prevRows = await db
      .select()
      .from(scannerPositions)
      .where(eq(scannerPositions.address, address))
    const hadBaseline = prevRows.length > 0
    const prev = new Map<string, PositionSnapshot>(
      prevRows.map((row) => [
        row.coin,
        {
          coin: row.coin,
          szi: Number(row.szi),
          entryPx: row.entryPx === null ? null : Number(row.entryPx),
          notional: Number(row.notional),
          leverage: row.leverage === null ? null : Number(row.leverage),
          unrealizedPnl:
            row.unrealizedPnl === null ? null : Number(row.unrealizedPnl),
        },
      ])
    )

    await this.persistState(address, prev, next)

    // First-ever poll has no baseline to diff against — recording "opened"
    // events for every existing position would be noise.
    if (!hadBaseline && next.size > 0) return

    const changes = diffPositions(prev, next, DEFAULT_DIFF_OPTIONS)
    if (changes.length === 0) return
    await this.recordChanges(address, changes)
  }

  private async persistState(
    address: string,
    prev: Map<string, PositionSnapshot>,
    next: Map<string, PositionSnapshot>
  ) {
    const gone = [...prev.keys()].filter((coin) => !next.has(coin))
    if (gone.length > 0) {
      await db
        .delete(scannerPositions)
        .where(
          and(
            eq(scannerPositions.address, address),
            inArray(scannerPositions.coin, gone)
          )
        )
    }
    if (next.size > 0) {
      await db
        .insert(scannerPositions)
        .values(
          [...next.values()].map((position) => ({
            address,
            coin: position.coin,
            szi: String(position.szi),
            entryPx: position.entryPx === null ? null : String(position.entryPx),
            notional: String(position.notional),
            leverage: position.leverage === null ? null : String(position.leverage),
            unrealizedPnl:
              position.unrealizedPnl === null
                ? null
                : String(position.unrealizedPnl),
            updatedAt: now(),
          }))
        )
        .onConflictDoUpdate({
          target: [scannerPositions.address, scannerPositions.coin],
          set: {
            szi: sql`excluded.szi`,
            entryPx: sql`excluded.entry_px`,
            notional: sql`excluded.notional`,
            leverage: sql`excluded.leverage`,
            unrealizedPnl: sql`excluded.unrealized_pnl`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
    }
  }

  private async recordChanges(address: string, changes: PositionChange[]) {
    const [lastEvent] = await db
      .select({ ts: scannerPositionEvents.ts })
      .from(scannerPositionEvents)
      .where(eq(scannerPositionEvents.address, address))
      .orderBy(desc(scannerPositionEvents.ts))
      .limit(1)
    const dormantReturn =
      lastEvent !== undefined &&
      Date.now() - lastEvent.ts.getTime() > DORMANT_GAP_MS

    const timestamp = now()
    await db.insert(scannerPositionEvents).values(
      changes.map((change) => ({
        id: uuid(),
        address,
        coin: change.coin,
        eventType:
          change.type === "opened" && dormantReturn ? "reopened" : change.type,
        prevSzi: change.prev === null ? null : String(change.prev.szi),
        newSzi: change.next === null ? null : String(change.next.szi),
        prevNotional:
          change.prev === null ? null : String(change.prev.notional),
        newNotional: change.next === null ? null : String(change.next.notional),
        ts: timestamp,
      }))
    )
    this.eventsRecorded += changes.length

    const drafts = await this.alertDrafts(address, changes, dormantReturn)
    if (drafts.length > 0) {
      await db
        .insert(scannerAlerts)
        .values(
          drafts.map((draft) => ({
            id: uuid(),
            type: draft.type,
            coin: draft.coin ?? null,
            address: draft.address ?? null,
            title: draft.title,
            body: draft.body ?? null,
            data: draft.data ?? null,
            dedupeKey: draft.dedupeKey,
            createdAt: timestamp,
          }))
        )
        .onConflictDoNothing({
          target: scannerAlerts.dedupeKey,
          where: sql`dedupe_key is not null`,
        })
    }
  }

  private async alertDrafts(
    address: string,
    changes: PositionChange[],
    dormantReturn: boolean
  ): Promise<AlertDraft[]> {
    const [wallet] = await db
      .select({
        label: scannerWallets.label,
        tracked: scannerWallets.tracked,
        ignored: scannerWallets.ignored,
        qualityScore: scannerWallets.qualityScore,
      })
      .from(scannerWallets)
      .where(eq(scannerWallets.address, address))
    if (!wallet || wallet.ignored) return []
    const notable =
      wallet.tracked || (wallet.qualityScore ?? 0) >= ALERT_MIN_QUALITY
    if (!notable) return []

    const name = wallet.label || `${address.slice(0, 6)}…${address.slice(-4)}`
    const bucket = Math.floor(Date.now() / (10 * 60_000))
    const drafts: AlertDraft[] = []

    for (const change of changes) {
      const notional = Math.max(
        change.prev?.notional ?? 0,
        change.next?.notional ?? 0
      )
      if (notional < ALERT_MIN_NOTIONAL) continue

      const side = (snapshotSide(change.next) ?? snapshotSide(change.prev)) as
        | "long"
        | "short"
      const from = formatUsd(change.prev?.notional ?? 0)
      const to = formatUsd(change.next?.notional ?? 0)
      const key = `pos:${change.type}:${address}:${change.coin}:${bucket}`

      switch (change.type) {
        case "increased":
          drafts.push(alert("position_increased", key, change.coin, address, {
            title: `${name} increased ${change.coin} ${side} from ${from} to ${to}`,
          }))
          break
        case "reduced":
          drafts.push(alert("position_reduced", key, change.coin, address, {
            title: `${name} reduced ${change.coin} ${side} from ${from} to ${to}`,
          }))
          break
        case "flipped":
          drafts.push(alert("position_flipped", key, change.coin, address, {
            title: `${name} flipped ${change.coin} from ${snapshotSide(change.prev)} to ${snapshotSide(change.next)} (${to})`,
          }))
          break
        case "closed": {
          const pnl = change.prev?.unrealizedPnl ?? null
          const profitable = pnl !== null && pnl > 0
          drafts.push(alert("position_closed", key, change.coin, address, {
            title: `${name} closed ${change.coin} ${side} (${from})${profitable ? ` up ~${formatUsd(pnl)}` : ""}`,
            data: { unrealizedPnlAtClose: pnl },
          }))
          break
        }
        case "opened":
          drafts.push(
            alert(
              dormantReturn ? "position_reopened" : "position_opened",
              key,
              change.coin,
              address,
              {
                title: dormantReturn
                  ? `${name} opened first position in 30+ days: ${change.coin} ${side} (${to})`
                  : `${name} opened ${change.coin} ${side} (${to})`,
              }
            )
          )
          break
      }
    }
    return drafts
  }
}

function alert(
  type: string,
  dedupeKey: string,
  coin: string,
  address: string,
  extra: { title: string; body?: string; data?: unknown }
): AlertDraft {
  return { type, dedupeKey, coin, address, ...extra }
}

function snapshotSide(snapshot: PositionSnapshot | null): string | null {
  if (!snapshot) return null
  return snapshot.szi > 0 ? "long" : "short"
}
