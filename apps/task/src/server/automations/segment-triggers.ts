import { and, eq, isNull, sql, type SQL } from "drizzle-orm"

import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import {
  joinedSegmentNode,
  readJoinedSegment,
} from "@/lib/automations/nodes/joined-segment"
import {
  automationEntryNodeId,
  automationTriggerKind,
} from "@/lib/automations/run"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  getSegmentDefinition,
  segmentConditions,
} from "@/server/people/contact-segments"
import { syncContactsFromUsers } from "@/server/people/contacts"
import {
  customShellAutomationRuns,
  customShellAutomations,
  customShellAutomationSegmentEnrollments,
  customShellAutomationSegmentSnapshot,
  customShellAutomationSegmentWatches,
  customShellContacts,
  type CustomShellAutomation,
} from "@/server/schema"

/** More arrivals than this means the segment probably changed by mistake. */
export const SEGMENT_ARRIVAL_LIMIT = 100

type SegmentContact = Pick<
  typeof customShellContacts.$inferSelect,
  "id" | "userId" | "email" | "firstName" | "lastName"
>

function contactLabel(contact: SegmentContact) {
  const name = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
  return (name ? `${name} (${contact.email})` : contact.email).slice(0, 200)
}

function triggerDetails(config: unknown) {
  const parsed = automationCompiledConfigSchema.safeParse(config)
  if (
    !parsed.success ||
    automationTriggerKind(parsed.data) !== joinedSegmentNode.kind
  ) {
    return null
  }
  const entryNodeId = automationEntryNodeId(parsed.data)
  const entry = entryNodeId ? parsed.data.nodes[entryNodeId] : undefined
  if (!entryNodeId || !entry) return null
  const settings = readJoinedSegment(entry.settings)
  return settings.segmentId
    ? { config: parsed.data, entryNodeId, ...settings }
    : null
}

async function replaceSnapshot(
  automationId: string,
  segmentId: string,
  conditions: SQL,
  timestamp: Date,
  database: CustomShellDb
) {
  await database.execute(sql`
    delete from ${customShellAutomationSegmentSnapshot}
    where ${customShellAutomationSegmentSnapshot.automationId} = ${automationId}
      and not exists (
        select 1 from ${customShellContacts}
        where ${customShellContacts.id} = ${customShellAutomationSegmentSnapshot.contactId}
          and ${conditions}
      )
  `)
  await database.execute(sql`
    insert into ${customShellAutomationSegmentSnapshot}
      ("automation_id", "segment_id", "contact_id", "last_seen_at")
    select ${automationId}, ${segmentId}, ${customShellContacts.id}, ${timestamp}
    from ${customShellContacts}
    where ${conditions}
    on conflict ("automation_id", "contact_id") do update set
      "segment_id" = excluded."segment_id",
      "last_seen_at" = excluded."last_seen_at"
  `)
}

/** Records today's members before a joined-segment flow becomes visible as live. */
export async function initializeJoinedSegmentWatch(
  flow: Pick<CustomShellAutomation, "id" | "workspaceId" | "compiledConfig">,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<boolean> {
  const trigger = triggerDetails(flow.compiledConfig)
  if (!trigger) return false

  const segment = await getSegmentDefinition(
    flow.workspaceId,
    trigger.segmentId,
    database
  )
  if (!segment) throw new Error("SEGMENT_NOT_FOUND")
  const conditions = await segmentConditions(
    flow.workspaceId,
    segment,
    database,
    timestamp
  )
  await replaceSnapshot(
    flow.id,
    trigger.segmentId,
    conditions,
    timestamp,
    database
  )
  await database
    .insert(customShellAutomationSegmentWatches)
    .values({
      automationId: flow.id,
      segmentId: trigger.segmentId,
      lastScannedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: customShellAutomationSegmentWatches.automationId,
      set: { segmentId: trigger.segmentId, lastScannedAt: timestamp },
    })
  return true
}

async function scanFlow(
  automationId: string,
  startRuns: boolean,
  database: CustomShellDb,
  timestamp: Date
): Promise<number> {
  return database.transaction(async (tx) => {
    // Serializes this flow's look with another server's look. The second one
    // sees the snapshot the first committed and therefore finds no arrivals.
    // The id is bound, never interpolated into SQL text.
    await tx.execute(
      sql`select id from automations where id = ${automationId} for update`
    )

    const [flow] = await tx
      .select()
      .from(customShellAutomations)
      .where(
        and(
          eq(customShellAutomations.id, automationId),
          eq(customShellAutomations.enabled, true)
        )
      )
      .limit(1)
    if (!flow) return 0

    const trigger = triggerDetails(flow.compiledConfig)
    if (!trigger) return 0
    const segment = await getSegmentDefinition(
      flow.workspaceId,
      trigger.segmentId,
      tx
    )
    if (!segment) {
      await tx
        .update(customShellAutomations)
        .set({
          enabled: false,
          pausedReason: "The segment this flow watched no longer exists.",
          updatedAt: timestamp,
        })
        .where(eq(customShellAutomations.id, flow.id))
      return 0
    }

    const conditions = await segmentConditions(
      flow.workspaceId,
      segment,
      tx,
      timestamp
    )
    const [watch] = await tx
      .select()
      .from(customShellAutomationSegmentWatches)
      .where(eq(customShellAutomationSegmentWatches.automationId, flow.id))
      .limit(1)

    // First look, or a newly selected segment: establish today without firing.
    if (!watch || watch.segmentId !== trigger.segmentId) {
      await replaceSnapshot(
        flow.id,
        trigger.segmentId,
        conditions,
        timestamp,
        tx
      )
      await tx
        .insert(customShellAutomationSegmentWatches)
        .values({
          automationId: flow.id,
          segmentId: trigger.segmentId,
          lastScannedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: customShellAutomationSegmentWatches.automationId,
          set: { segmentId: trigger.segmentId, lastScannedAt: timestamp },
        })
      return 0
    }

    // Ask the database for only unseen, never-enrolled contacts, and stop one
    // past the safety limit. Permanent enrollment history may grow for years;
    // pulling all of it into memory every fifteen seconds would not scale.
    const arrivals = await tx
      .select({
        id: customShellContacts.id,
        userId: customShellContacts.userId,
        email: customShellContacts.email,
        firstName: customShellContacts.firstName,
        lastName: customShellContacts.lastName,
      })
      .from(customShellContacts)
      .leftJoin(
        customShellAutomationSegmentSnapshot,
        and(
          eq(customShellAutomationSegmentSnapshot.automationId, flow.id),
          eq(
            customShellAutomationSegmentSnapshot.contactId,
            customShellContacts.id
          )
        )
      )
      .leftJoin(
        customShellAutomationSegmentEnrollments,
        and(
          eq(customShellAutomationSegmentEnrollments.automationId, flow.id),
          eq(
            customShellAutomationSegmentEnrollments.contactId,
            customShellContacts.id
          )
        )
      )
      .where(
        and(
          conditions,
          isNull(customShellAutomationSegmentSnapshot.contactId),
          isNull(customShellAutomationSegmentEnrollments.contactId)
        )
      )
      .limit(SEGMENT_ARRIVAL_LIMIT + 1)

    // The snapshot advances even under the global pause. This deliberately
    // skips arrivals during the pause instead of releasing a catch-up burst.
    await replaceSnapshot(flow.id, trigger.segmentId, conditions, timestamp, tx)
    await tx
      .update(customShellAutomationSegmentWatches)
      .set({ lastScannedAt: timestamp })
      .where(eq(customShellAutomationSegmentWatches.automationId, flow.id))
    if (!startRuns || arrivals.length === 0) return 0

    if (arrivals.length > SEGMENT_ARRIVAL_LIMIT) {
      await tx
        .update(customShellAutomations)
        .set({
          enabled: false,
          pausedReason: `Paused because more than ${SEGMENT_ARRIVAL_LIMIT} people joined at once.`,
          updatedAt: timestamp,
        })
        .where(eq(customShellAutomations.id, flow.id))
      return 0
    }

    let started = 0
    for (const contact of arrivals) {
      const [reserved] = await tx
        .insert(customShellAutomationSegmentEnrollments)
        .values({
          automationId: flow.id,
          contactId: contact.id,
          startedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({
          contactId: customShellAutomationSegmentEnrollments.contactId,
        })
      if (!reserved) continue

      const [run] = await tx
        .insert(customShellAutomationRuns)
        .values({
          id: uuid(),
          automationId: flow.id,
          userId: flow.userId,
          workspaceId: flow.workspaceId,
          status: "active",
          currentNodeId: trigger.entryNodeId,
          configSnapshot: trigger.config,
          wakeAt: timestamp,
          attempts: 0,
          subjectUserId: contact.userId,
          subjectContactId: contact.id,
          subjectLabel: contactLabel(contact),
          triggerKind: joinedSegmentNode.kind,
          triggerKey: `${joinedSegmentNode.kind}:${contact.id}`,
          triggerFacts: {
            segmentId: trigger.segmentId,
            segmentName: trigger.segmentName,
          },
          startedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({ id: customShellAutomationRuns.id })
      if (run) started += 1
    }
    return started
  })
}

/** Compares every live watched segment with its last safe snapshot. */
export async function runJoinedSegmentTriggers(
  database: CustomShellDb = db,
  options: { startRuns?: boolean; timestamp?: Date } = {}
): Promise<number> {
  const timestamp = options.timestamp ?? now()
  const rows = await database
    .select({
      id: customShellAutomations.id,
      workspaceId: customShellAutomations.workspaceId,
      compiledConfig: customShellAutomations.compiledConfig,
    })
    .from(customShellAutomations)
    .where(eq(customShellAutomations.enabled, true))

  const watched = rows.filter((row) => triggerDetails(row.compiledConfig))
  const workspaces = [...new Set(watched.map((row) => row.workspaceId))]
  for (const workspaceId of workspaces) {
    await syncContactsFromUsers(workspaceId, database)
  }

  let started = 0
  for (const row of watched) {
    started += await scanFlow(
      row.id,
      options.startRuns !== false,
      database,
      timestamp
    )
  }
  return started
}

/** A manual off/on starts with a fresh baseline but keeps once-per-person memory. */
export async function resetJoinedSegmentWatch(
  automationId: string,
  database: CustomShellDb = db
) {
  await database
    .delete(customShellAutomationSegmentSnapshot)
    .where(eq(customShellAutomationSegmentSnapshot.automationId, automationId))
  await database
    .delete(customShellAutomationSegmentWatches)
    .where(eq(customShellAutomationSegmentWatches.automationId, automationId))
}
