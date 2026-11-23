import { and, eq, inArray, sql } from "drizzle-orm"

import { sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import type { SequencePersonStatus } from "@/lib/broadcasts/sequence-progress"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomations,
  customShellContacts,
  customShellUsers,
} from "@/server/schema"

/**
 * How far each person has got through a sequence and what became of its
 * emails (Tyler, 22 Nov 2026: "there's no statistics at all or any sort of
 * progression indicators"). Read from the runs and their deliveries as they
 * stand, never stored a second time, so a bounce reported an hour later shows
 * the next time the panel opens.
 */

const runs = customShellAutomationRuns
const deliveries = customShellAutomationDeliveries

/** True when any of this run's emails carries the stamp. */
const anyStamp = (column: AnyPgColumn) =>
  sql`coalesce(bool_or(${column} is not null), false)`

/**
 * One word per person, first match wins, in Tyler's order (22 Nov 2026):
 * Complained, Bounced, Unsubscribed, Clicked, Opened, Delivered, Sent, Waiting.
 * The first three also read the person's own list status, so somebody who
 * unsubscribed from a newsletter shows it here too. Failed sits before
 * Waiting: a run that broke, or whose only email did not go, is not waiting.
 */
const statusExpression = sql<SequencePersonStatus>`case
  when max(${customShellContacts.status}) = 'complained' or ${anyStamp(deliveries.complainedAt)} then 'complained'
  when max(${customShellContacts.status}) = 'bounced' or ${anyStamp(deliveries.bouncedAt)} then 'bounced'
  when max(${customShellContacts.status}) = 'unsubscribed' or max(${customShellUsers.automatedMailOffAt}) is not null or ${anyStamp(deliveries.unsubscribedAt)} then 'unsubscribed'
  when ${anyStamp(deliveries.clickedAt)} then 'clicked'
  when ${anyStamp(deliveries.openedAt)} then 'opened'
  when ${anyStamp(deliveries.deliveredAt)} then 'delivered'
  when coalesce(bool_or(${deliveries.status} = 'sent'), false) then 'sent'
  when ${runs.status} = 'failed' or coalesce(bool_or(${deliveries.status} = 'failed'), false) then 'failed'
  else 'waiting'
end`

/** Emails that went, counted once per email even if a retry wrote twice. */
const emailsSentExpression = sql<number>`(count(distinct ${deliveries.nodeId}) filter (where ${deliveries.status} = 'sent'))::int`

/**
 * The emails in the copy of the sequence the run was given, counted in the
 * database so a list of thousands never ships thousands of copies here.
 */
const emailsTotalExpression = sql<number>`(select count(*) from jsonb_each(coalesce(${runs.configSnapshot} -> 'nodes', '{}'::jsonb)) as node where node.value ->> 'kind' = 'sendEmail')::int`

async function requireSequence(workspaceId: string, sequenceId: string, database: CustomShellDb) {
  const [sequence] = await database
    .select({ id: customShellAutomations.id })
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, sequenceId),
        eq(customShellAutomations.workspaceId, workspaceId),
        eq(customShellAutomations.kind, "sequence")
      )
    )
    .limit(1)
  if (!sequence) throw new Error("NOT_FOUND")
}

const realRunsOf = (sequenceId: string) =>
  and(eq(runs.automationId, sequenceId), eq(runs.testRun, false))

export type SequenceEmailStats = {
  sent: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  unsubscribed: number
}

export type SequenceStats = {
  people: number
  finished: number
  totals: SequenceEmailStats
  /** Per email, keyed by its node id (`email-<id>`). */
  byEmail: Record<string, SequenceEmailStats>
}

const EMPTY: SequenceEmailStats = { sent: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0 }

/** The sequence's numbers: people, finished, and each email's outcomes. Test runs never count. */
export async function sequenceStats(
  workspaceId: string,
  sequenceId: string,
  database: CustomShellDb = db
): Promise<SequenceStats> {
  await requireSequence(workspaceId, sequenceId, database)
  const [people] = await database
    .select({
      people: sql<number>`count(*)::int`,
      finished: sql<number>`(count(*) filter (where ${runs.status} = 'completed'))::int`,
    })
    .from(runs)
    .where(realRunsOf(sequenceId))
  const rows = await database
    .select({
      nodeId: deliveries.nodeId,
      sent: sql<number>`(count(*) filter (where ${deliveries.status} = 'sent'))::int`,
      opened: sql<number>`(count(*) filter (where ${deliveries.openedAt} is not null))::int`,
      clicked: sql<number>`(count(*) filter (where ${deliveries.clickedAt} is not null))::int`,
      bounced: sql<number>`(count(*) filter (where ${deliveries.bouncedAt} is not null))::int`,
      complained: sql<number>`(count(*) filter (where ${deliveries.complainedAt} is not null))::int`,
      unsubscribed: sql<number>`(count(*) filter (where ${deliveries.unsubscribedAt} is not null))::int`,
    })
    .from(deliveries)
    .innerJoin(runs, eq(runs.id, deliveries.runId))
    .where(realRunsOf(sequenceId))
    .groupBy(deliveries.nodeId)

  const byEmail: Record<string, SequenceEmailStats> = {}
  const totals = { ...EMPTY }
  for (const { nodeId, ...counts } of rows) {
    byEmail[nodeId] = counts
    for (const key of Object.keys(totals) as (keyof SequenceEmailStats)[]) totals[key] += counts[key]
  }
  return { people: people?.people ?? 0, finished: people?.finished ?? 0, totals, byEmail }
}

export type FlowRunSequenceProgress = {
  /** People the step started: one for a person's run, many after an Audience. */
  people: number
  emailsSent: number
  emailsTotal: number
  /** The one person's word; null when the step started many. */
  status: SequencePersonStatus | null
}

/**
 * For a flow's Runs tab: the sequence each run's Send sequence step started,
 * found through the key `startSequenceForRun` writes (`run:<flowRunId>:…`).
 * Runs that started nothing are left out of the map.
 */
export async function sequenceProgressForFlowRuns(
  flowRunIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, FlowRunSequenceProgress>> {
  const result = new Map<string, FlowRunSequenceProgress>()
  if (flowRunIds.length === 0) return result
  const flowRunId = sql<string>`split_part(${runs.triggerKey}, ':', 2)`
  const perRun = database
    .select({
      flowRunId: sql<string>`${flowRunId}`.as("flow_run_id"),
      emailsSent: sql<number>`least(${emailsSentExpression}, ${emailsTotalExpression})`.as("emails_sent"),
      emailsTotal: sql<number>`${emailsTotalExpression}`.as("emails_total"),
      status: sql<SequencePersonStatus>`${statusExpression}`.as("status"),
    })
    .from(runs)
    .leftJoin(deliveries, eq(deliveries.runId, runs.id))
    .leftJoin(customShellContacts, eq(customShellContacts.id, runs.subjectContactId))
    .leftJoin(customShellUsers, eq(customShellUsers.id, runs.subjectUserId))
    .where(and(eq(runs.triggerKind, sendSequenceNode.kind), inArray(flowRunId, flowRunIds)))
    .groupBy(runs.id)
    .as("per_run")
  const rows = await database
    .select({
      flowRunId: perRun.flowRunId,
      people: sql<number>`count(*)::int`,
      emailsSent: sql<number>`sum(${perRun.emailsSent})::int`,
      emailsTotal: sql<number>`sum(${perRun.emailsTotal})::int`,
      status: sql<SequencePersonStatus>`min(${perRun.status})`,
    })
    .from(perRun)
    .groupBy(perRun.flowRunId)
  for (const row of rows) {
    result.set(row.flowRunId, {
      people: row.people,
      emailsSent: row.emailsSent,
      emailsTotal: row.emailsTotal,
      status: row.people === 1 ? row.status : null,
    })
  }
  return result
}
