import { and, asc, eq, inArray, isNull, lte, sql, type SQL } from "drizzle-orm"

import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import { segmentStartMissingDrip } from "@/lib/automations/nodes/drip"
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
import {
  getSegmentDefinition,
  segmentConditions,
} from "@/server/people/contact-segments"
import {
  customShellAutomationRuns,
  customShellAutomations,
  customShellAutomationSegmentEnrollments,
  customShellContacts,
} from "@/server/schema"

/**
 * How many people the Segment start lets in per pass, at most, and never while
 * this many of the flow's runs are already due and not yet walked. The engine
 * walks 20 runs a pass, so letting twenty thousand in at once would queue a
 * Drip step's next batch behind hours of new arrivals.
 */
const LET_IN_PER_PASS = 100

function triggerDetails(config: unknown, { requireDrip = true } = {}) {
  const parsed = automationCompiledConfigSchema.safeParse(config)
  if (
    !parsed.success ||
    automationTriggerKind(parsed.data) !== segmentDripNode.kind ||
    // A flow saved live before Drip steps existed lets nobody in, rather than
    // the whole segment at once (`segmentStartMissingDrip`).
    (requireDrip && segmentStartMissingDrip(parsed.data))
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

/** How many of this flow's runs are due and not yet walked. */
async function dueRuns(automationId: string, database: CustomShellDb, timestamp: Date) {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(customShellAutomationRuns)
    .where(
      and(
        eq(customShellAutomationRuns.automationId, automationId),
        eq(customShellAutomationRuns.status, "active"),
        lte(customShellAutomationRuns.wakeAt, timestamp)
      )
    )
  return row?.total ?? 0
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
    // enrollments and runs the first committed, so it finds no one twice.
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

    const room = LET_IN_PER_PASS - (await dueRuns(flow.id, tx, timestamp))
    if (room <= 0) return 0

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

    const conditions = await segmentConditions(
      flow.workspaceId,
      segment,
      tx,
      timestamp
    )
    const batch = await tx
      .select({
        id: customShellContacts.id,
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
      .limit(room)
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
          // A segment is subscribers only; accounts are not on the list.
          subjectUserId: null,
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

/**
 * Lets the next few people into every live flow with this start, as many as
 * the engine has room for. The pace is the flow's Drip step's job, not this.
 */
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

  const due = rows.filter((row) => triggerDetails(row.compiledConfig))
  let started = 0
  for (const row of due) {
    started += await letInNextBatch(row.id, database, timestamp)
  }
  return started
}

export type SegmentDripProgress = {
  letIn: number
  waiting: number
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

  const [letIn] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(customShellAutomationSegmentEnrollments)
    .where(eq(customShellAutomationSegmentEnrollments.automationId, flow.id))

  // Counted even while the flow waits for a Drip step, so the card says how
  // many are still to go.
  const trigger = triggerDetails(flow.compiledConfig, { requireDrip: false })
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

  return {
    letIn: letIn?.total ?? 0,
    waiting,
  }
}
