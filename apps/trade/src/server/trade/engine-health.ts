import { randomUUID } from "node:crypto"

import { and, desc, eq, sql } from "drizzle-orm"

import { publishNotificationCreatedMany } from "@/server/notifications/events"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAnnouncements,
  customShellNotifications,
  customShellUsers,
  customShellWorkspaces,
} from "@/server/schema"
import {
  tradeEngineOutages,
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
  level: "info" | "critical",
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

  const [workspace] = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellWorkspaces)
    .limit(1)
  if (!workspace) return []

  const announcementId = randomUUID()
  await database.insert(customShellAnnouncements).values({
    id: announcementId,
    workspaceId: workspace.id,
    ...words,
    level,
    audience: "app",
    showBanner: false,
    notify: true,
    startsAt: timestamp,
    endsAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(customShellNotifications).values(
    recipients.map(({ id }) => ({
      id: randomUUID(),
      recipientUserId: id,
      type: "announcement" as const,
      announcementId,
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
  const notice = await database.transaction(async (tx): Promise<HealthNotice> => {
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
      .select({ lastSeenAt: tradeWorkerHeartbeats.lastSeenAt })
      .from(tradeWorkerHeartbeats)
      .where(
        and(
          eq(tradeWorkerHeartbeats.kind, LADDER_WORKER_KIND),
          eq(tradeWorkerHeartbeats.role, "leader")
        )
      )
      .orderBy(desc(tradeWorkerHeartbeats.lastSeenAt))
      .limit(1)
    const [outage] = await tx
      .select()
      .from(tradeEngineOutages)
      .where(eq(tradeEngineOutages.kind, LADDER_WORKER_KIND))
      .limit(1)

    if (!control?.enabled) {
      if (outage) {
        await tx
          .delete(tradeEngineOutages)
          .where(eq(tradeEngineOutages.kind, LADDER_WORKER_KIND))
      }
      return { recipients: [] }
    }

    const lastExpectedAt =
      heartbeat && heartbeat.lastSeenAt > control.enabledAt
        ? heartbeat.lastSeenAt
        : control.enabledAt
    const heartbeatIsFresh =
      checkedAt.getTime() - lastExpectedAt.getTime() <= ENGINE_OUTAGE_AFTER_MS

    if (heartbeatIsFresh) {
      if (!outage) return { recipients: [] }

      const recipients = await writeNotice(
        recoveryWords(outage.outageStartedAt, heartbeat?.lastSeenAt ?? checkedAt),
        "info",
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
      "critical",
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
  })

  if (notice.recipients.length) {
    await publish(notice.recipients, database)
  }
}
