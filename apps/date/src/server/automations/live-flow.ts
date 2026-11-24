import { and, count, desc, eq, gte, inArray, isNotNull, notExists, sql, type SQL } from "drizzle-orm"
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core"

import { automationCompiledConfigSchema, type AutomationCompiledConfig } from "@/lib/automations/compile"
import { automationNodeName } from "@/lib/automations/node-registry"
import { dripNode, readDripStep } from "@/lib/automations/nodes/drip"
import { joinedSegmentNode } from "@/lib/automations/nodes/joined-segment"
import { segmentDripNode } from "@/lib/automations/nodes/segment-drip"
import { sendEmailNode } from "@/lib/automations/nodes/send-email"
import { readSendSequence, sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import { waitNode } from "@/lib/automations/nodes/wait"
import { waitForApprovalNode } from "@/lib/automations/nodes/wait-for-approval"
import { automationEntryNodeId, automationNextNodeId } from "@/lib/automations/run"
import {
  describeDripWindows,
  isWithinDripWindow,
  nextDripWindowOpen,
  timezoneLabel,
  type DripConfig,
} from "@/lib/broadcasts/drip"
import { sequenceFromGraph } from "@/lib/broadcasts/sequence-graph"
import { now as currentTime } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { dripBatches, dripBounceCounts, DRIP_BOUNCE_SAMPLE_MINIMUM } from "@/server/automations/drip"
import { inspectAutomation } from "@/server/automations/flows"
import {
  flowSequenceIds,
  realRunsOfFlowAndItsSequences,
  sequenceRunsOfFlow,
  startedByFlowRun,
  startedByStep,
} from "@/server/automations/flow-runs"
import { segmentStartReach } from "@/server/automations/segment-drip"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellAutomationSegmentSnapshot,
  customShellUsers,
  type CustomShellAutomation,
} from "@/server/schema"

/**
 * What a live flow is doing, for its right panel (Tyler, 23 Nov 2026: "There
 * should be more informations when the automation is running. Becauew right
 * now I have no idea what its status is"): the Statistics card, then one card
 * per step in the order the steps run, then what it did last and who dropped
 * out. Read in one call, so the panel's refresh every few seconds is one
 * request.
 *
 * Where a person is now is their run's `current_node_id`, `status` and
 * `wake_at`; nothing is stored a second time. A person on a sequence is on a
 * run of the sequence's own, found through the key the Send sequence step
 * wrote (`flow-runs.ts`). Test runs never count.
 *
 * `since` narrows the totals (sent, opened, let in, finished, failed) to a
 * period. The numbers about now (in it, held, waiting) never change with it.
 */

const runs = customShellAutomationRuns
const steps = customShellAutomationRunSteps
const deliveries = customShellAutomationDeliveries
const flowRuns = alias(customShellAutomationRuns, "flow_runs")

/** How many things the Recent activity card lists. */
const RECENT_LIMIT = 10
/** How many of a Drip step's batches its card lists. */
const DRIP_BATCHES_SHOWN = 5
/** The days the Segment card's chart covers, today included. */
const ARRIVAL_DAYS = 7

export type LiveFlowStats = {
  /** Every run in the period. */
  total: number
  completed: number
  /** On a step that is due now, being walked or about to be. */
  workingNow: number
  /** Asleep at a Drip or Wait step until a time still to come. */
  held: number
  /** Stopped at an approval step for somebody to answer. */
  waiting: number
  failed: number
  /** Rejected at an approval step, timed out there, or canceled. */
  stopped: number
  /** The typical time from a person's start to their finish, over those who finished. */
  typicalSeconds: number | null
}

export type LiveFlowEmailRow = {
  nodeId: string
  /** 1 for Email 1. */
  number: number
  subject: string
  sent: number
  opened: number
  clicked: number
  /** People whose next email this is. Each person is counted once. */
  waiting: number
}

export type LiveFlowStep = {
  nodeId: string
  kind: string
  name: string
  /** People on this step now: working, held or waiting on a decision. */
  onNow: number
  /** Of those, asleep until a time still to come. */
  held: number
  /** The soonest any of them moves on. */
  nextMoveAt: string | null
  passed: number
  failed: number
  /** The newest error a run hit on this step, in its own words. */
  lastError: string | null
  segment?: {
    /** People let in since Run was pressed who were not in the segment then. Null before any press was recorded. */
    newSinceRun: number | null
    stillToGo: number | null
    cannotBeEmailed: number | null
    /** People let in per day, oldest first, `day` as YYYY-MM-DD. */
    perDay: { day: string; letIn: number }[]
  }
  drip?: {
    /** The pace in three parts, each a figure and the words under it: "40–50", "people at a time". */
    pace: { size: string; gap: string; hours: string; hoursNote: string }
    /** When the sending hours open next, while they are shut. */
    outsideHoursUntil: string | null
    bounce: { sent: number; bounced: number; limitPercent: number; minimum: number }
    /** Newest first. */
    batches: { releaseAt: string; size: number }[]
  }
  sequence?: {
    sequenceId: string
    sequenceName: string
    /** The sequence was deleted since the step picked it. */
    missing: boolean
    /** People this step has put on it. */
    people: number
    /** People in the flow not at this step yet, held at a Drip say. They wait for Email 1. */
    beforeStep: number
    finished: number
    emails: LiveFlowEmailRow[]
  }
  email?: { sent: number; opened: number; clicked: number }
}

/** What one line of Recent activity says happened, which picks its icon and colour. */
export type LiveFlowActivityKind =
  | "letIn"
  | "waiting"
  | "movedOn"
  | "sent"
  | "notSent"
  | "started"
  | "stopped"
  | "failed"
  | "passed"

export type LiveFlowActivity = {
  id: string
  kind: LiveFlowActivityKind
  /** Who it was about, in bold; null for a run somebody pressed Run for. */
  name: string | null
  /** Their address, on the line under; null when the name is the address. */
  email: string | null
  /** What happened, after the name: "was let in from the segment". */
  action: string
  at: string
}

export type LiveFlowReport = {
  enabled: boolean
  pausedReason: string | null
  /** Set while the flow is paused by hand: when, and who by. */
  paused: { at: string; by: string | null } | null
  /** Everyone somewhere in the flow now, those on its sequences included. */
  inFlow: number
  stats: LiveFlowStats
  steps: LiveFlowStep[]
  recent: LiveFlowActivity[]
  /** People who left the list after this flow emailed them. */
  droppedOut: { unsubscribed: number; bounced: number; complained: number }
}

/** The steps of a compiled flow in the order a run walks them. */
export function stepsInOrder(config: AutomationCompiledConfig): string[] {
  const order: string[] = []
  let at = automationEntryNodeId(config)
  while (at && config.nodes[at] && !order.includes(at)) {
    order.push(at)
    at = automationNextNodeId(config, at)
  }
  return order
}

const since = (column: AnyPgColumn, from: Date | null) => (from ? gte(column, from) : undefined)

/** A moment as a query value, the same in every driver. */
const instant = (at: Date) => sql`${at.toISOString()}::timestamptz`

/**
 * Everyone in each flow now: its own runs still going or waiting on a
 * decision, and the sequence runs its Send sequence steps started that are
 * still going. One grouped read for every flow asked about, so the
 * Automations list's Run buttons cost two queries whatever their number.
 */
export async function peopleInFlows(automationIds: string[], database: CustomShellDb = db): Promise<Map<string, number>> {
  const people = new Map<string, number>()
  if (automationIds.length === 0) return people
  const own = await database
    .select({ automationId: runs.automationId, people: count() })
    .from(runs)
    .where(
      and(
        inArray(runs.automationId, automationIds),
        eq(runs.testRun, false),
        inArray(runs.status, ["active", "waiting_approval"])
      )
    )
    .groupBy(runs.automationId)
  const onSequences = await database
    .select({ automationId: flowRuns.automationId, people: count() })
    .from(runs)
    .innerJoin(flowRuns, eq(flowRuns.id, startedByFlowRun))
    .where(
      and(
        eq(runs.triggerKind, sendSequenceNode.kind),
        eq(runs.status, "active"),
        eq(runs.testRun, false),
        inArray(flowRuns.automationId, automationIds)
      )
    )
    .groupBy(flowRuns.automationId)
  for (const row of [...own, ...onSequences]) {
    people.set(row.automationId, (people.get(row.automationId) ?? 0) + row.people)
  }
  return people
}

/** The flow's real runs by status, and the typical time through. */
async function runStats(automationId: string, from: Date | null, at: Date, database: CustomShellDb): Promise<LiveFlowStats> {
  const real = and(eq(runs.automationId, automationId), eq(runs.testRun, false))
  const [inPeriod] = await database
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`(count(*) filter (where ${runs.status} = 'completed'))::int`,
      failed: sql<number>`(count(*) filter (where ${runs.status} = 'failed'))::int`,
      stopped: sql<number>`(count(*) filter (where ${runs.status} in ('rejected', 'canceled')))::int`,
      typicalSeconds: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from ${runs.finishedAt} - ${runs.startedAt})) filter (where ${runs.status} = 'completed' and ${runs.finishedAt} is not null)`,
    })
    .from(runs)
    .where(and(real, since(runs.startedAt, from)))
  const [rightNow] = await database
    .select({
      workingNow: sql<number>`(count(*) filter (where ${runs.status} = 'active' and ${runs.wakeAt} <= ${instant(at)}))::int`,
      held: sql<number>`(count(*) filter (where ${runs.status} = 'active' and ${runs.wakeAt} > ${instant(at)}))::int`,
      waiting: sql<number>`(count(*) filter (where ${runs.status} = 'waiting_approval'))::int`,
    })
    .from(runs)
    .where(and(real, inArray(runs.status, ["active", "waiting_approval"])))
  const typical = inPeriod?.typicalSeconds == null ? null : Number(inPeriod.typicalSeconds)
  return {
    total: inPeriod?.total ?? 0,
    completed: inPeriod?.completed ?? 0,
    failed: inPeriod?.failed ?? 0,
    stopped: inPeriod?.stopped ?? 0,
    workingNow: rightNow?.workingNow ?? 0,
    held: rightNow?.held ?? 0,
    waiting: rightNow?.waiting ?? 0,
    typicalSeconds: typical === null ? null : Math.round(typical),
  }
}

/** Who is on each step now, by the step their run is on. */
async function peopleOnSteps(automationId: string, at: Date, database: CustomShellDb) {
  const rows = await database
    .select({
      nodeId: runs.currentNodeId,
      onNow: sql<number>`count(*)::int`,
      held: sql<number>`(count(*) filter (where ${runs.status} = 'active' and ${runs.wakeAt} > ${instant(at)}))::int`,
      nextMoveAt: sql<string | null>`min(${runs.wakeAt}) filter (where ${runs.status} = 'active' and ${runs.wakeAt} > ${instant(at)})`,
    })
    .from(runs)
    .where(
      and(
        eq(runs.automationId, automationId),
        eq(runs.testRun, false),
        inArray(runs.status, ["active", "waiting_approval"])
      )
    )
    .groupBy(runs.currentNodeId)
  return new Map(rows.map((row) => [row.nodeId, row]))
}

/**
 * Who has passed each step and who failed on it. A Drip or Wait step writes a
 * line when somebody arrives and another when they leave, so somebody still
 * asleep there has a line but has not passed.
 */
async function stepOutcomes(automationId: string, from: Date | null, database: CustomShellDb) {
  const rows = await database
    .select({
      nodeId: steps.nodeId,
      passed: sql<number>`(count(distinct ${steps.runId}) filter (where ${steps.status} = 'completed' and not (${runs.status} = 'active' and ${runs.currentNodeId} = ${steps.nodeId})))::int`,
      failed: sql<number>`(count(distinct ${steps.runId}) filter (where ${steps.status} in ('failed', 'rejected')))::int`,
    })
    .from(steps)
    .innerJoin(runs, eq(runs.id, steps.runId))
    .where(and(eq(runs.automationId, automationId), eq(runs.testRun, false), since(steps.finishedAt, from)))
    .groupBy(steps.nodeId)
  const errors = await database
    .selectDistinctOn([steps.nodeId], { nodeId: steps.nodeId, error: steps.error })
    .from(steps)
    .innerJoin(runs, eq(runs.id, steps.runId))
    .where(
      and(
        eq(runs.automationId, automationId),
        eq(runs.testRun, false),
        eq(steps.status, "failed"),
        isNotNull(steps.error)
      )
    )
    .orderBy(steps.nodeId, desc(steps.finishedAt))
  const lastErrors = new Map(errors.map((row) => [row.nodeId, row.error]))
  return new Map(rows.map((row) => [row.nodeId, { ...row, lastError: lastErrors.get(row.nodeId) ?? null }]))
}

/** Sent, opened and clicked per email, for the runs `where` picks. */
async function emailOutcomes(where: SQL, from: Date | null, database: CustomShellDb) {
  const rows = await database
    .select({
      nodeId: deliveries.nodeId,
      sent: sql<number>`(count(*) filter (where ${deliveries.status} = 'sent'))::int`,
      opened: sql<number>`(count(*) filter (where ${deliveries.openedAt} is not null))::int`,
      clicked: sql<number>`(count(*) filter (where ${deliveries.clickedAt} is not null))::int`,
    })
    .from(deliveries)
    .innerJoin(runs, eq(runs.id, deliveries.runId))
    .where(and(where, since(deliveries.createdAt, from)))
    .groupBy(deliveries.nodeId)
  return new Map(rows.map(({ nodeId, ...counts }) => [nodeId, counts]))
}

/** The Segment card: who is new since Run, the segment's two counts, and arrivals per day. */
async function segmentCard(
  flow: CustomShellAutomation,
  start: { kind: string; segmentId: string },
  at: Date,
  database: CustomShellDb
): Promise<NonNullable<LiveFlowStep["segment"]>> {
  const real = and(eq(runs.automationId, flow.id), eq(runs.testRun, false))
  let newSinceRun: number | null = null
  if (flow.liveSince) {
    // A flow that lets the segment in starts with everyone already in it, so
    // only somebody missing from the picture taken at Run is new. A flow that
    // starts when somebody joins only ever starts newcomers.
    const newcomer =
      start.kind === segmentDripNode.kind
        ? notExists(
            database
              .select({ one: sql`1` })
              .from(customShellAutomationSegmentSnapshot)
              .where(
                and(
                  eq(customShellAutomationSegmentSnapshot.automationId, flow.id),
                  eq(customShellAutomationSegmentSnapshot.contactId, runs.subjectContactId)
                )
              )
          )
        : undefined
    const [row] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(runs)
      .where(and(real, gte(runs.startedAt, flow.liveSince), newcomer))
    newSinceRun = row?.total ?? 0
  }

  const firstDay = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - (ARRIVAL_DAYS - 1)))
  const day = sql<string>`to_char(${runs.startedAt} at time zone 'UTC', 'YYYY-MM-DD')`
  const arrivals = await database
    .select({ day, letIn: sql<number>`count(*)::int` })
    .from(runs)
    .where(and(real, gte(runs.startedAt, firstDay)))
    .groupBy(day)
  const byDay = new Map(arrivals.map((row) => [row.day, row.letIn]))
  const perDay = Array.from({ length: ARRIVAL_DAYS }, (_, index) => {
    const key = new Date(firstDay.getTime() + index * 86_400_000).toISOString().slice(0, 10)
    return { day: key, letIn: byDay.get(key) ?? 0 }
  })

  const reach = await segmentStartReach(flow, start, database, at)
  return {
    newSinceRun,
    stillToGo: reach?.stillToGo ?? null,
    cannotBeEmailed: reach?.cannotBeEmailed ?? null,
    perDay,
  }
}

const range = (low: number, high: number) => (low === high ? low.toLocaleString("en-US") : `${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")}`)

/** The Drip card's three schedule boxes: how many, how far apart, and when. */
export function dripPace(pace: DripConfig): NonNullable<LiveFlowStep["drip"]>["pace"] {
  const anyHour = pace.windows.length === 0
  return {
    size: range(pace.batchSizeMin, pace.batchSizeMax),
    gap: `${range(pace.waitMinMinutes, pace.waitMaxMinutes)} min`,
    hours: anyHour ? "Any time" : describeDripWindows(pace),
    hoursNote: [anyHour ? "of day" : `${timezoneLabel(pace.timezone)} time`, pace.skipWeekends ? "weekdays" : ""]
      .filter(Boolean)
      .join(", "),
  }
}

/** The Drip card: its pace in words, whether its hours are shut, its bounces and batches. */
async function dripCard(
  automationId: string,
  nodeId: string,
  settings: Record<string, unknown>,
  sequenceIds: string[],
  at: Date,
  database: CustomShellDb
): Promise<NonNullable<LiveFlowStep["drip"]>> {
  const pace = readDripStep(settings)
  const [bounces, batches] = await Promise.all([
    dripBounceCounts(automationId, sequenceIds, database),
    dripBatches(automationId, nodeId, database, DRIP_BATCHES_SHOWN),
  ])
  return {
    pace: dripPace(pace),
    outsideHoursUntil: isWithinDripWindow(pace, at) ? null : nextDripWindowOpen(pace, at).toISOString(),
    bounce: {
      sent: bounces.sent,
      bounced: bounces.bounced,
      limitPercent: pace.bounceThresholdPercent,
      minimum: DRIP_BOUNCE_SAMPLE_MINIMUM,
    },
    batches: batches.map((batch) => ({ releaseAt: batch.releaseAt, size: batch.places })),
  }
}

/**
 * The Sequence card: one row per email with what became of it and who is
 * next in line for it (Tyler, 23 Nov 2026: "email 1: 800 sent, 20 opened, 5
 * clicked. 400 waiting"). Somebody still before the Send sequence step, held
 * at a Drip say, is waiting for Email 1 too, so with 1,200 in the flow the
 * Waiting column adds up to everyone not finished.
 */
async function sequenceCard(
  flow: CustomShellAutomation,
  nodeId: string,
  settings: Record<string, unknown>,
  waitingBeforeStep: number,
  from: Date | null,
  database: CustomShellDb
): Promise<NonNullable<LiveFlowStep["sequence"]>> {
  const { sequenceId, sequenceName } = readSendSequence(settings)
  const [sequence] = sequenceId
    ? await database
        .select()
        .from(customShellAutomations)
        .where(
          and(
            eq(customShellAutomations.id, sequenceId),
            eq(customShellAutomations.workspaceId, flow.workspaceId),
            eq(customShellAutomations.kind, "sequence")
          )
        )
        .limit(1)
    : []
  if (!sequence) {
    return { sequenceId, sequenceName, missing: true, people: 0, beforeStep: waitingBeforeStep, finished: 0, emails: [] }
  }

  const ofThisStep = and(sequenceRunsOfFlow(flow.id, database, [sequence.id]), eq(startedByStep, nodeId)) as SQL
  const [people] = await database
    .select({
      people: sql<number>`count(*)::int`,
      finished: sql<number>`(count(*) filter (where ${runs.status} = 'completed'))::int`,
    })
    .from(runs)
    .where(and(ofThisStep, since(runs.startedAt, from)))
  const goingRows = await database
    .select({ nodeId: runs.currentNodeId, people: sql<number>`count(*)::int` })
    .from(runs)
    .where(and(ofThisStep, eq(runs.status, "active")))
    .groupBy(runs.currentNodeId)
  const going = new Map(goingRows.map((row) => [row.nodeId, row.people]))
  const sent = await emailOutcomes(ofThisStep, from, database)

  const emails = sequenceFromGraph(inspectAutomation(sequence).graph)?.emails ?? []
  return {
    sequenceId: sequence.id,
    sequenceName: sequence.name,
    missing: false,
    people: people?.people ?? 0,
    beforeStep: waitingBeforeStep,
    finished: people?.finished ?? 0,
    emails: emails.map((email, index) => {
      const emailNode = `email-${email.id}`
      const outcomes = sent.get(emailNode) ?? { sent: 0, opened: 0, clicked: 0 }
      return {
        nodeId: emailNode,
        number: index + 1,
        subject: email.subject.trim(),
        ...outcomes,
        // Next in line: about to be sent it, or waiting out the gap before
        // it. Email 1 also has everyone in the flow not at this step yet.
        waiting:
          (going.get(emailNode) ?? 0) +
          (going.get(`wait-${email.id}`) ?? 0) +
          (index === 0 ? waitingBeforeStep : 0),
      }
    }),
  }
}

/** "Ann Lee (ann@example.com)" as its name and address; an address alone is the name. */
export function splitSubjectLabel(label: string | null): { name: string | null; email: string | null } {
  if (!label) return { name: null, email: null }
  const match = /^(.*\S)\s+\(([^()]+@[^()]+)\)$/.exec(label.trim())
  return match ? { name: match[1], email: match[2] } : { name: label.trim(), email: null }
}

const quoted = (text: string | null | undefined, fallback: string) => (text?.trim() ? `“${text.trim()}”` : fallback)

/**
 * One finished step as a line a person reads (Tyler, 23 Nov 2026, drew Recent
 * activity as "Sample held-28 was let in from the segment"): the kind of
 * thing that happened, and the words after the person's name. A Drip or Wait
 * writes a line going to sleep, with its release time in `output`, and
 * another on waking.
 */
export function describeActivity(step: {
  kind: string
  nodeId: string
  status: string
  summary: string
  output: Record<string, unknown> | null
  stepName: string
  subject: string | null
  runStatus: string
  runNodeId: string
}): { kind: LiveFlowActivityKind; action: string } {
  if (step.status !== "completed") return { kind: "failed", action: `hit a problem at ${step.stepName}` }
  const asleep = Boolean(step.output && ("releaseAt" in step.output || "waitingUntil" in step.output))
  // Finished the flow on a step that normally passes people on: the flow was
  // switched off while they waited, or a click or the bounce limit ended it.
  const endedHere = step.runStatus === "completed" && step.runNodeId === step.nodeId && !asleep
  switch (step.kind) {
    case segmentDripNode.kind:
    case joinedSegmentNode.kind:
      return { kind: "letIn", action: "was let in from the segment" }
    case dripNode.kind:
      if (asleep) return { kind: "waiting", action: "is waiting for its batch" }
      return endedHere ? { kind: "stopped", action: "stopped at Drip" } : { kind: "movedOn", action: "went on with its batch" }
    case waitNode.kind:
      if (asleep) return { kind: "waiting", action: `is waiting at ${step.stepName}` }
      return endedHere ? { kind: "stopped", action: `stopped at ${step.stepName}` } : { kind: "movedOn", action: "finished waiting" }
    case sendEmailNode.kind:
      return /^Emailed 0\b/.test(step.summary) || /could not receive|not sent/i.test(step.summary)
        ? { kind: "notSent", action: `was not sent ${quoted(step.subject, "the email")}` }
        : { kind: "sent", action: `was sent ${quoted(step.subject, "an email")}` }
    case sendSequenceNode.kind:
      return { kind: "started", action: `was started on ${quoted(step.subject, "a sequence")}` }
    case waitForApprovalNode.kind:
      return { kind: "waiting", action: "is waiting for an approval" }
    default:
      return { kind: "passed", action: `passed ${step.stepName}` }
  }
}

/** The newest things the flow and its sequences did, with who they were about. */
async function recentActivity(automationId: string, sequenceIds: string[], database: CustomShellDb): Promise<LiveFlowActivity[]> {
  // The step's settings from the run's own copy of the flow, without an
  // email's blocks, which would ship a whole email per line.
  const settings = sql<Record<string, unknown> | null>`(${runs.configSnapshot} -> 'nodes' -> ${steps.nodeId} -> 'settings') - 'blocks'`
  const rows = await database
    .select({
      id: steps.id,
      kind: steps.kind,
      nodeId: steps.nodeId,
      status: steps.status,
      summary: steps.summary,
      output: steps.output,
      settings,
      label: runs.subjectLabel,
      runStatus: runs.status,
      runNodeId: runs.currentNodeId,
      at: steps.finishedAt,
    })
    .from(steps)
    .innerJoin(runs, eq(runs.id, steps.runId))
    .where(realRunsOfFlowAndItsSequences(automationId, database, sequenceIds))
    .orderBy(desc(steps.finishedAt), desc(steps.id))
    .limit(RECENT_LIMIT)
  return rows.map((row) => {
    const nodeSettings = row.settings ?? {}
    const text = (key: string) => (typeof nodeSettings[key] === "string" ? (nodeSettings[key] as string) : null)
    const described = describeActivity({
      ...row,
      output: (row.output as Record<string, unknown> | null) ?? null,
      stepName: automationNodeName({ id: row.nodeId, kind: row.kind, x: 0, y: 0, settings: nodeSettings as never }),
      subject: row.kind === sendSequenceNode.kind ? text("sequenceName") : text("subject"),
    })
    return {
      id: row.id,
      ...described,
      ...splitSubjectLabel(row.label),
      at: row.at.toISOString(),
    }
  })
}

/** People who unsubscribed, bounced or complained about an email this flow caused. */
async function droppedOut(automationId: string, sequenceIds: string[], from: Date | null, database: CustomShellDb) {
  const person = sql`lower(${deliveries.toEmail})`
  const after = (column: AnyPgColumn) =>
    from ? sql`${column} >= ${instant(from)}` : sql`${column} is not null`
  const [row] = await database
    .select({
      unsubscribed: sql<number>`(count(distinct ${person}) filter (where ${after(deliveries.unsubscribedAt)}))::int`,
      bounced: sql<number>`(count(distinct ${person}) filter (where ${after(deliveries.bouncedAt)}))::int`,
      complained: sql<number>`(count(distinct ${person}) filter (where ${after(deliveries.complainedAt)}))::int`,
    })
    .from(deliveries)
    .innerJoin(runs, eq(runs.id, deliveries.runId))
    .where(realRunsOfFlowAndItsSequences(automationId, database, sequenceIds))
  return { unsubscribed: row?.unsubscribed ?? 0, bounced: row?.bounced ?? 0, complained: row?.complained ?? 0 }
}

/** The whole panel's numbers for one of this site's flows, or null when it is not one. */
export async function liveFlowReport(
  workspaceId: string,
  automationId: string,
  options: { since?: Date | null; now?: Date } = {},
  database: CustomShellDb = db
): Promise<LiveFlowReport | null> {
  const from = options.since ?? null
  const at = options.now ?? currentTime()
  const [flow] = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, automationId),
        eq(customShellAutomations.workspaceId, workspaceId),
        eq(customShellAutomations.kind, "flow")
      )
    )
    .limit(1)
  if (!flow) return null

  const parsed = automationCompiledConfigSchema.safeParse(flow.compiledConfig)
  const config = parsed.success ? parsed.data : null
  const order = config ? stepsInOrder(config) : []
  const sequenceIds = flowSequenceIds(config)

  const [stats, onSteps, outcomes, ownEmails, recent, dropped] = await Promise.all([
    runStats(flow.id, from, at, database),
    peopleOnSteps(flow.id, at, database),
    stepOutcomes(flow.id, from, database),
    emailOutcomes(and(eq(runs.automationId, flow.id), eq(runs.testRun, false)) as SQL, from, database),
    recentActivity(flow.id, sequenceIds, database),
    droppedOut(flow.id, sequenceIds, from, database),
  ])

  const inFlow = (await peopleInFlows([flow.id], database)).get(flow.id) ?? 0
  const cards: LiveFlowStep[] = []
  let before = 0
  for (const nodeId of order) {
    const node = config!.nodes[nodeId]
    const here = onSteps.get(nodeId)
    const done = outcomes.get(nodeId)
    const card: LiveFlowStep = {
      nodeId,
      kind: node.kind,
      name: automationNodeName({ id: nodeId, kind: node.kind, x: 0, y: 0, settings: node.settings }),
      onNow: here?.onNow ?? 0,
      held: here?.held ?? 0,
      nextMoveAt: here?.nextMoveAt ? new Date(here.nextMoveAt).toISOString() : null,
      passed: done?.passed ?? 0,
      failed: done?.failed ?? 0,
      lastError: done?.lastError ?? null,
    }
    if (node.kind === segmentDripNode.kind || node.kind === joinedSegmentNode.kind) {
      const segmentId = typeof node.settings.segmentId === "string" ? node.settings.segmentId : ""
      card.segment = await segmentCard(flow, { kind: node.kind, segmentId }, at, database)
    } else if (node.kind === dripNode.kind) {
      card.drip = await dripCard(flow.id, nodeId, node.settings, sequenceIds, at, database)
    } else if (node.kind === sendSequenceNode.kind) {
      card.sequence = await sequenceCard(flow, nodeId, node.settings, before, from, database)
    } else if (node.kind === sendEmailNode.kind) {
      card.email = ownEmails.get(nodeId) ?? { sent: 0, opened: 0, clicked: 0 }
    }
    before += card.onNow
    cards.push(card)
  }

  const pausedBy = flow.pausedAt && flow.pausedBy
    ? (await database.select({ name: customShellUsers.name }).from(customShellUsers).where(eq(customShellUsers.id, flow.pausedBy)).limit(1))[0]?.name ?? null
    : null
  return {
    enabled: flow.enabled,
    pausedReason: flow.pausedReason,
    paused: flow.pausedAt ? { at: flow.pausedAt.toISOString(), by: pausedBy } : null,
    inFlow,
    // While paused nobody is working through a step: everyone due is held.
    stats: flow.pausedAt ? { ...stats, workingNow: 0, held: stats.held + stats.workingNow } : stats,
    steps: cards,
    recent,
    droppedOut: dropped,
  }
}

/** A live flow on the Automations list: who is in it, and whether it is paused. */
export type LiveFlowPeople = { people: number; paused: boolean }

/** Everyone in each of this site's live flows now, for the Automations list's Run buttons. */
export async function peopleInLiveFlows(workspaceId: string, database: CustomShellDb = db): Promise<Record<string, LiveFlowPeople>> {
  const live = await database
    .select({ id: customShellAutomations.id, pausedAt: customShellAutomations.pausedAt })
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.workspaceId, workspaceId),
        eq(customShellAutomations.kind, "flow"),
        eq(customShellAutomations.enabled, true)
      )
    )
  const people = await peopleInFlows(live.map((flow) => flow.id), database)
  return Object.fromEntries(
    live.map((flow) => [flow.id, { people: people.get(flow.id) ?? 0, paused: flow.pausedAt !== null }])
  )
}
