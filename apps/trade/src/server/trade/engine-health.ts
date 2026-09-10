import { randomUUID } from "node:crypto"

import { and, desc, eq, isNull, sql } from "drizzle-orm"

import { publishNotificationCreatedMany } from "@/server/notifications/events"
import { db, type CustomShellDb } from "@/server/db"
import { customShellNotifications, customShellUsers } from "@/server/schema"
import {
  tradeEngineOutages,
  tradeEngineOutageHistory,
  tradeWorkerControls,
  tradeWorkerHeartbeats,
} from "@/server/trade/schema"

const LADDER_WORKER_KIND = "ladders"

/**
 * Three passes of the 15-second monitor. Recent production restarts took at
 * most 12.318 seconds, so a routine replacement is back well before this line.
 */
export const ENGINE_OUTAGE_AFTER_MS = 45_000

const ENGINE_TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
  timeZoneName: "short",
})

type HealthNotice = {
  recipients: string[]
}

function durationText(milliseconds: number): string {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []

  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`)
  if (seconds || parts.length === 0) {
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`)
  }

  return parts.join(" ")
}

function outageWords(outageStartedAt: Date) {
  return {
    title: `The trading engine stopped at ${ENGINE_TIME.format(outageStartedAt)}`,
    body: "Watched orders and ladder rungs will not fire until it is running again.",
  }
}

function recoveryWords(outageStartedAt: Date, recoveredAt: Date) {
  return {
    title: `The trading engine came back at ${ENGINE_TIME.format(recoveredAt)}`,
    body: `It was unavailable for ${durationText(recoveredAt.getTime() - outageStartedAt.getTime())}. Watched orders and ladder rungs are working again.`,
  }
}

async function writeNotice(
  words: { title: string; body: string },
  timestamp: Date,
  database: CustomShellDb
): Promise<string[]> {
  const recipients = await database
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(
      and(
        eq(customShellUsers.role, "admin"),
        eq(customShellUsers.status, "active")
      )
    )
  if (!recipients.length) return []

  // One row per admin, each carrying the words. The engine stopping is news
  // for every admin at once, and each of them reads and clears their own copy.
  await database.insert(customShellNotifications).values(
    recipients.map(({ id }) => ({
      id: randomUUID(),
      recipientUserId: id,
      type: "app_activity" as const,
      message: words.title,
      detail: words.body,
      createdAt: timestamp,
    }))
  )

  return recipients.map(({ id }) => id)
}

/**
 * Checks the database heartbeat from the independent trading engine.
 *
 * The shell's background pass calls this every 15 seconds. Locking the engine's control
 * row makes overlapping worker copies harmless: one copy records and sends a
 * transition, while the others see that it has already happened.
 */
export async function monitorTradingEngine({
  database = db,
  checkedAt = new Date(),
  publish = publishNotificationCreatedMany,
}: {
  database?: CustomShellDb
  checkedAt?: Date
  publish?: (userIds: string[], database: CustomShellDb) => Promise<void>
} = {}): Promise<void> {
  const notice = await database.transaction(
    async (tx): Promise<HealthNotice> => {
      await tx
        .insert(tradeWorkerControls)
        .values({
          kind: LADDER_WORKER_KIND,
          enabled: true,
          enabledAt: checkedAt,
          paused: false,
          updatedAt: checkedAt,
        })
        .onConflictDoNothing()

      await tx.execute(
        sql`select "kind" from "trade_worker_controls" where "kind" = ${LADDER_WORKER_KIND} for update`
      )

      const [control] = await tx
        .select()
        .from(tradeWorkerControls)
        .where(eq(tradeWorkerControls.kind, LADDER_WORKER_KIND))
        .limit(1)
      const [heartbeat] = await tx
        .select({
          lastSeenAt: tradeWorkerHeartbeats.lastSeenAt,
          startedAt: tradeWorkerHeartbeats.startedAt,
        })
        .from(tradeWorkerHeartbeats)
        .where(
          and(
            eq(tradeWorkerHeartbeats.kind, LADDER_WORKER_KIND),
            eq(tradeWorkerHeartbeats.role, "leader")
          )
        )
        .orderBy(desc(tradeWorkerHeartbeats.lastSeenAt))
        .limit(1)
      const [savedOutage] = await tx
        .select()
        .from(tradeEngineOutages)
        .where(eq(tradeEngineOutages.kind, LADDER_WORKER_KIND))
        .limit(1)

      // History is independent of notice recipients. The same control-row lock
      // serializes both records, including when no active admin receives notices.
      const [openHistory] = await tx
        .select()
        .from(tradeEngineOutageHistory)
        .where(
          and(
            eq(tradeEngineOutageHistory.kind, LADDER_WORKER_KIND),
            isNull(tradeEngineOutageHistory.endedAt)
          )
        )
        .limit(1)
      const lastExpectedAt =
        heartbeat && heartbeat.lastSeenAt > control.enabledAt
          ? heartbeat.lastSeenAt
          : control.enabledAt
      let historyEndedAt: Date | undefined
      if (openHistory) {
        if (!control.enabled) historyEndedAt = control.updatedAt
        else if (control.enabledAt > openHistory.startedAt)
          historyEndedAt = control.enabledAt
        else if (heartbeat && heartbeat.lastSeenAt > openHistory.startedAt) {
          historyEndedAt =
            heartbeat.startedAt > openHistory.startedAt
              ? heartbeat.startedAt
              : heartbeat.lastSeenAt
        }
        if (historyEndedAt) {
          await tx
            .update(tradeEngineOutageHistory)
            .set({
              endedAt: new Date(
                Math.max(
                  openHistory.startedAt.getTime(),
                  Math.min(checkedAt.getTime(), historyEndedAt.getTime())
                )
              ),
            })
            .where(
              and(
                eq(tradeEngineOutageHistory.kind, LADDER_WORKER_KIND),
                eq(tradeEngineOutageHistory.startedAt, openHistory.startedAt)
              )
            )
        }
      }
      if (
        control.enabled &&
        (!openHistory || historyEndedAt) &&
        checkedAt.getTime() - lastExpectedAt.getTime() > ENGINE_OUTAGE_AFTER_MS
      ) {
        await tx.insert(tradeEngineOutageHistory).values({
          kind: LADDER_WORKER_KIND,
          startedAt: lastExpectedAt,
        })
      }

      if (!control?.enabled) {
        if (savedOutage) {
          await tx
            .delete(tradeEngineOutages)
            .where(eq(tradeEngineOutages.kind, LADDER_WORKER_KIND))
        }
        return { recipients: [] }
      }

      // The switch may have gone off and back on between two monitoring passes.
      // In that case the old outage belongs to the earlier run, and the fresh
      // start-up window is not proof that a heartbeat came back.
      const outageIsFromPreviousRun =
        savedOutage !== undefined && control.enabledAt > savedOutage.announcedAt
      if (outageIsFromPreviousRun) {
        await tx
          .delete(tradeEngineOutages)
          .where(eq(tradeEngineOutages.kind, LADDER_WORKER_KIND))
      }
      const outage = outageIsFromPreviousRun ? undefined : savedOutage

      const heartbeatIsFresh =
        checkedAt.getTime() - lastExpectedAt.getTime() <= ENGINE_OUTAGE_AFTER_MS

      if (heartbeatIsFresh) {
        if (!outage) return { recipients: [] }

        const recipients = await writeNotice(
          recoveryWords(
            outage.outageStartedAt,
            heartbeat?.lastSeenAt ?? checkedAt
          ),
          checkedAt,
          tx
        )
        if (!recipients.length) return { recipients: [] }

        await tx
          .delete(tradeEngineOutages)
          .where(eq(tradeEngineOutages.kind, LADDER_WORKER_KIND))
        return { recipients }
      }

      if (outage) return { recipients: [] }

      const recipients = await writeNotice(
        outageWords(lastExpectedAt),
        checkedAt,
        tx
      )
      if (!recipients.length) return { recipients: [] }

      await tx.insert(tradeEngineOutages).values({
        kind: LADDER_WORKER_KIND,
        outageStartedAt: lastExpectedAt,
        announcedAt: checkedAt,
      })
      return { recipients }
    }
  )

  if (notice.recipients.length) {
    await publish(notice.recipients, database)
  }
}
