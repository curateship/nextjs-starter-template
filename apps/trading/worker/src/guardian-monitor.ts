import {
  describeGuardianAction,
  evaluateGuardianTick,
  guardianUtcDate,
} from "@/lib/trading/guardian"
import { sendGlobalBotCommand } from "@/server/bots"
import {
  loadArmedGuardians,
  persistGuardianWatch,
  tripGuardian,
} from "@/server/guardian"

import { insertAlerts } from "./scanner/insert-alerts"

/**
 * The account-level kill switch. Runs on the snapshot poller's once-a-minute
 * equity readings (bot worker, under the leader lock): when a user's combined
 * wallet equity stays past a saved loss/drawdown limit for enough consecutive
 * readings, it enqueues that user's chosen global command (pause_all or
 * flatten_all) exactly once, files a bell alert, and latches "tripped" in the
 * database until the user re-arms it from the UI.
 */
export type GuardianReading = {
  userId: string
  walletId: string
  /** Null when this wallet's snapshot failed this tick. */
  equity: number | null
}

export class GuardianMonitor {
  async check(readings: GuardianReading[], at: Date = new Date()) {
    if (readings.length === 0) return
    const byUser = new Map<string, { equity: number; failed: boolean }>()
    for (const reading of readings) {
      const entry = byUser.get(reading.userId) ?? { equity: 0, failed: false }
      if (reading.equity === null) entry.failed = true
      else entry.equity += reading.equity
      byUser.set(reading.userId, entry)
    }

    const guardians = await loadArmedGuardians([...byUser.keys()])
    for (const guardian of guardians) {
      const account = byUser.get(guardian.userId)
      if (!account) continue
      if (account.failed) {
        // A missing wallet reading would understate equity and fake a loss.
        // Skip the tick (streak untouched) and wait for a clean one.
        console.warn(
          "guardian: skipped a check — a wallet snapshot failed this minute"
        )
        continue
      }

      const result = evaluateGuardianTick({
        limits: guardian.limits,
        watch: guardian.watch,
        equity: account.equity,
        utcDate: guardianUtcDate(at),
      })
      await persistGuardianWatch(guardian.userId, result.watch)
      if (!result.trip) continue

      const trippedAt = await tripGuardian(guardian.userId, result.trip)
      // Another worker latched this trip first — it owns the command + alert.
      if (!trippedAt) continue

      const actionText = describeGuardianAction(guardian.action)
      await sendGlobalBotCommand(
        guardian.userId,
        guardian.action,
        undefined,
        `Guardian tripped: ${result.trip}.`
      )
      await insertAlerts([
        {
          type: "guardian_tripped",
          title:
            guardian.action === "flatten_all"
              ? "Guardian tripped — closing positions, all bots paused"
              : "Guardian tripped — all bots paused",
          body:
            `Your loss limit was hit: ${result.trip}. ` +
            `The guardian sent one command to ${actionText}. ` +
            "Bots stay paused until you resume them yourself, and the " +
            "guardian stays off until you re-arm it on the Bots page.",
          dedupeKey: `guardian:${guardian.userId}:${trippedAt.getTime()}`,
        },
      ])
      console.log(
        `guardian tripped for user ${guardian.userId}: ${result.trip} → ${guardian.action}`
      )
    }
  }
}
