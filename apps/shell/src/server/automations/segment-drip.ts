import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"

import {
  describeDripSchedule,
  nextDripWindowOpen,
  pickBatchSize,
  pickWaitMs,
  type DripConfig,
} from "@/lib/broadcasts/drip"
import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import {
  readSegmentDrip,
  segmentDripNode,
} from "@/lib/automations/nodes/segment-drip"
import {
  automationEntryNodeId,
  automationTriggerKind,
} from "@/lib/automations/run"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getDripDefaults } from "@/server/email/settings"
import {
  getSegmentDefinition,
  segmentConditions,
} from "@/server/people/contact-segments"
import { syncContactsFromUsers } from "@/server/people/contacts"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomations,
  customShellAutomationSegmentEnrollments,
  customShellContacts,
} from "@/server/schema"

/**
 * Below this many sent emails a bounce rate says nothing. The same floor the
 * newsletter drip uses: three bounces out of four is a small list, not a bad
 * one.
 */
const BOUNCE_SAMPLE_MINIMUM = 20

function triggerDetails(config: unknown) {
  const parsed = automationCompiledConfigSchema.safeParse(config)
  if (
    !parsed.success ||
    automationTriggerKind(parsed.data) !== segmentDripNode.kind
  ) {
    return null
  }
  const entryNodeId = automationEntryNodeId(parsed.data)
  const entry = entryNodeId ? parsed.data.nodes[entryNodeId] : undefined
  if (!entryNodeId || !entry) return null
  const settings = readSegmentDrip(entry.settings)
  return settings.segmentId
    ? { config: parsed.data, entryNodeId, ...settings }
    : null
}

/** Whether this flow starts with the dripped segment start. */
export function automationStartsWithSegmentDrip(config: unknown): boolean {
  return triggerDetails(config) !== null
}

/** A repeatable number in [0, 1) from a string (FNV-1a). */
function seededRandom(seed: string): () => number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const value = (hash >>> 0) / 0x1_0000_0000
  return () => value
}

/**
 * When this flow may let its next batch in.
 *
 * No column holds the answer. The last batch's time is already written down,
 * on the enrollment rows it made, and the gap after it is picked from the pace's
 * range with that time as the seed, so every pass of the ticker works out the
 * same gap rather than a fresh one each fifteen seconds. A flow nobody has been
 * let into yet may go now.
 */
export function segmentDripNextBatchAt(
  pace: DripConfig,
  automationId: string,
  lastBatchAt: Date | null,
  at: Date
): Date {
  const earliest = lastBatchAt
    ? new Date(
        lastBatchAt.getTime() +
          pickWaitMs(
            pace,
            seededRandom(`${automationId}:${lastBatchAt.toISOString()}`)
          )
      )
    : at
  return nextDripWindowOpen(pace, earliest > at ? earliest : at)
}

/**
 * The pace a dripped start uses: the workspace's drip rules from Settings >
 * Email, always on. Its own switch there is about newsletters; a dripped start
 * is never anything but paced.
 */
export async function segmentDripPace(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<DripConfig> {
  return { ...(await getDripDefaults(workspaceId, database)), enabled: true }
}

/**
 * Who in the segment is still waiting to be let in: reachable, and never let
 * into this flow before. Opted-out, bouncing and spam-marked people never wait
 * here, by the same rule every send uses.
 */
function waitingConditions(segment: SQL): SQL {
  return and(
    segment,
    inArray(customShellContacts.status, ["subscribed", "cold"]),
    isNull(customShellAutomationSegmentEnrollments.contactId)
  ) as SQL
}

function joinEnrollments(automationId: string) {
  return and(
    eq(customShellAutomationSegmentEnrollments.automationId, automationId),
    eq(customShellAutomationSegmentEnrollments.contactId, customShellContacts.id)
  )
}

async function lastBatchAt(
  automationId: string,
  database: CustomShellDb
): Promise<Date | null> {
  const [row] = await database
    .select({
      at: sql<string | null>`max(${customShellAutomationSegmentEnrollments.startedAt})`,
    })
    .from(customShellAutomationSegmentEnrollments)
    .where(eq(customShellAutomationSegmentEnrollments.automationId, automationId))
  return row?.at ? new Date(row.at) : null
}

/**
 * How many of this flow's sent emails went to somebody whose address has since
 * bounced.
 *
 * Automation mail has no bounce stamp of its own. Resend's bounce report marks
 * the contact, so the contact's status is the record of it.
 */
async function bounceCounts(automationId: string, database: CustomShellDb) {
  const [row] = await database
    .select({
      sent: sql<number>`count(distinct ${customShellAutomationDeliveries.contactId})::int`,
      bounced: sql<number>`count(distinct ${customShellAutomationDeliveries.contactId}) filter (where ${customShellContacts.status} = 'bounced')::int`,
    })
    .from(customShellAutomationDeliveries)
    .innerJoin(
      customShellAutomationRuns,
      eq(customShellAutomationRuns.id, customShellAutomationDeliveries.runId)
    )
    .innerJoin(
      customShellContacts,
      eq(customShellContacts.id, customShellAutomationDeliveries.contactId)
    )
    .where(
      and(
        eq(customShellAutomationRuns.automationId, automationId),
        eq(customShellAutomationRuns.testRun, false),
        eq(customShellAutomationDeliveries.status, "sent")
      )
    )
  return { sent: row?.sent ?? 0, bounced: row?.bounced ?? 0 }
}

function contactLabel(contact: {
  email: string
  firstName: string | null
  lastName: string | null
}) {
  const name = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
  return (name ? `${name} (${contact.email})` : contact.email).slice(0, 200)
}

async function stopFlow(
  automationId: string,
  reason: string,
  timestamp: Date,
  database: CustomShellDb
) {
  await database
    .update(customShellAutomations)
    .set({ enabled: false, pausedReason: reason, updatedAt: timestamp })
    .where(eq(customShellAutomations.id, automationId))
}

async function letInNextBatch(
  automationId: string,
  database: CustomShellDb,
  timestamp: Date
): Promise<number> {
  return database.transaction(async (tx) => {
    // Two servers ticking at once take turns here. The second one sees the
    // enrollments the first committed, so its next batch is not due yet.
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

    const pace = await segmentDripPace(flow.workspaceId, tx)
    const last = await lastBatchAt(flow.id, tx)
    if (segmentDripNextBatchAt(pace, flow.id, last, timestamp) > timestamp) {
      return 0
    }

    const segment = await getSegmentDefinition(
      flow.workspaceId,
      trigger.segmentId,
      tx
    )
    if (!segment) {
      await stopFlow(
        flow.id,
        "The segment this flow lets in no longer exists.",
        timestamp,
        tx
      )
      return 0
    }

    // Checked before each batch rather than after, so the batch that tips it
    // over is the last one: the bounces for a batch arrive minutes after it
    // goes, by which time the next one is what this check would be stopping.
    const bounces = await bounceCounts(flow.id, tx)
    if (
      bounces.sent >= BOUNCE_SAMPLE_MINIMUM &&
      (bounces.bounced / bounces.sent) * 100 >= pace.bounceThresholdPercent
    ) {
      await stopFlow(
        flow.id,
        `Stopped on its own: ${bounces.bounced} of the ${bounces.sent} people sent to so far bounced, which is over your ${pace.bounceThresholdPercent} in 100 limit. Clean up the segment before switching it back on.`,
        timestamp,
        tx
      )
      return 0
    }

    const conditions = await segmentConditions(
      flow.workspaceId,
      segment,
      tx,
      timestamp
    )
    const batch = await tx
      .select({
        id: customShellContacts.id,
        userId: customShellContacts.userId,
        email: customShellContacts.email,
        firstName: customShellContacts.firstName,
        lastName: customShellContacts.lastName,
      })
      .from(customShellContacts)
      .leftJoin(
        customShellAutomationSegmentEnrollments,
        joinEnrollments(flow.id)
      )
      .where(waitingConditions(conditions))
      // Oldest first, so the people who have been on the list longest hear
      // first and the order is the same however often it is asked.
      .orderBy(asc(customShellContacts.createdAt), asc(customShellContacts.id))
      .limit(pickBatchSize(pace))
    if (batch.length === 0) return 0

    const reserved = await tx
      .insert(customShellAutomationSegmentEnrollments)
      .values(
        batch.map((contact) => ({
          automationId: flow.id,
          contactId: contact.id,
          startedAt: timestamp,
        }))
      )
      .onConflictDoNothing()
      .returning({
        contactId: customShellAutomationSegmentEnrollments.contactId,
      })
    const reservedIds = new Set(reserved.map((row) => row.contactId))
    const contacts = batch.filter((contact) => reservedIds.has(contact.id))
    if (contacts.length === 0) return 0

    const started = await tx
      .insert(customShellAutomationRuns)
      .values(
        contacts.map((contact) => ({
          id: uuid(),
          automationId: flow.id,
          userId: flow.userId,
          workspaceId: flow.workspaceId,
          status: "active" as const,
          currentNodeId: trigger.entryNodeId,
          configSnapshot: trigger.config,
          wakeAt: timestamp,
          attempts: 0,
          subjectUserId: contact.userId,
          subjectContactId: contact.id,
          subjectLabel: contactLabel(contact),
          triggerKind: segmentDripNode.kind,
          triggerKey: `${segmentDripNode.kind}:${contact.id}`,
          triggerFacts: {
            segmentId: trigger.segmentId,
            segmentName: trigger.segmentName,
          },
          startedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: customShellAutomationRuns.id })
    return started.length
  })
}

/** Lets the next batch into every live dripped flow whose batch is due. */
export async function runSegmentDripTriggers(
  database: CustomShellDb = db,
  options: { timestamp?: Date } = {}
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

  const due: typeof rows = []
  for (const row of rows) {
    if (!triggerDetails(row.compiledConfig)) continue
    const pace = await segmentDripPace(row.workspaceId, database)
    const last = await lastBatchAt(row.id, database)
    if (segmentDripNextBatchAt(pace, row.id, last, timestamp) <= timestamp) {
      due.push(row)
    }
  }

  // Only a batch about to go needs the contact list brought up to date. The
  // sync reads every contact in the workspace, and doing that every fifteen
  // seconds for the days a long list takes to let in would be most of the
  // ticker's work for nothing.
  const workspaces = [...new Set(due.map((row) => row.workspaceId))]
  for (const workspaceId of workspaces) {
    await syncContactsFromUsers(workspaceId, database)
  }

  let started = 0
  for (const row of due) {
    started += await letInNextBatch(row.id, database, timestamp)
  }
  return started
}

export type SegmentDripProgress = {
  letIn: number
  waiting: number
  /** Null when nothing is waiting or the flow is off. */
  nextBatchAt: string | null
  pace: string
}

/** What the start step's panel shows: how far through the segment it is. */
export async function segmentDripProgress(
  workspaceId: string,
  automationId: string,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<SegmentDripProgress | null> {
  const [flow] = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, automationId),
        eq(customShellAutomations.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!flow) return null

  const pace = await segmentDripPace(workspaceId, database)
  const [letIn] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(customShellAutomationSegmentEnrollments)
    .where(eq(customShellAutomationSegmentEnrollments.automationId, flow.id))

  const trigger = triggerDetails(flow.compiledConfig)
  const segment = trigger
    ? await getSegmentDefinition(workspaceId, trigger.segmentId, database)
    : null
  let waiting = 0
  if (segment) {
    const [row] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(customShellContacts)
      .leftJoin(
        customShellAutomationSegmentEnrollments,
        joinEnrollments(flow.id)
      )
      .where(
        waitingConditions(
          await segmentConditions(workspaceId, segment, database, timestamp)
        )
      )
    waiting = row?.total ?? 0
  }

  const nextBatchAt =
    flow.enabled && waiting > 0
      ? segmentDripNextBatchAt(
          pace,
          flow.id,
          await lastBatchAt(flow.id, database),
          timestamp
        ).toISOString()
      : null

  return {
    letIn: letIn?.total ?? 0,
    waiting,
    nextBatchAt,
    pace: describeDripSchedule(pace),
  }
}
