import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { automationGraphSchema } from "@/lib/automations/graph"
import { readSendSequence, sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import { automationEntryNodeId } from "@/lib/automations/run"
import {
  sequenceFromGraph,
  sequenceToGraph,
  newSequenceEmail,
  type SequenceSteps,
} from "@/lib/broadcasts/sequence-graph"
import { uuid } from "@/server/auth/security"
import { workspaceForRun } from "@/server/automations/runs"
import {
  createWorkspaceAutomation,
  deleteWorkspaceAutomations,
  duplicateWorkspaceAutomation,
  inspectAutomation,
  saveWorkspaceAutomation,
} from "@/server/automations/flows"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomations,
  type CustomShellAutomation,
  type CustomShellAutomationRun,
} from "@/server/schema"

/**
 * The CRM's sequences (`workspace/docs/email/sequences.md`): automations of
 * kind `sequence`, read and written as a list of emails, with no start of
 * their own. A flow's Send sequence step starts one for its person. Every
 * write goes through the automation functions, so the server's compile is
 * still the only thing that writes what the engine runs.
 */

/** A flow whose Send sequence step points at a sequence. */
export type SequenceUser = { id: string; name: string }

export type SequenceRow = {
  id: string
  name: string
  /** Null when the stored steps are not a chain this tab drew. */
  steps: SequenceSteps | null
  /** The flows whose Send sequence step sends it, by name. */
  usedBy: SequenceUser[]
  /** People partway through: started and not yet past the last email. */
  inProgress: number
  /** People who got every email. */
  finished: number
  updatedAt: Date
}

async function runCounts(automationIds: string[], database: CustomShellDb) {
  if (!automationIds.length) return new Map<string, { inProgress: number; finished: number }>()
  const rows = await database
    .select({
      automationId: customShellAutomationRuns.automationId,
      inProgress: sql<number>`(count(*) filter (where ${customShellAutomationRuns.status} in ('active', 'waiting_approval')))::int`,
      finished: sql<number>`(count(*) filter (where ${customShellAutomationRuns.status} = 'completed'))::int`,
    })
    .from(customShellAutomationRuns)
    .where(and(inArray(customShellAutomationRuns.automationId, automationIds), eq(customShellAutomationRuns.testRun, false)))
    .groupBy(customShellAutomationRuns.automationId)
  return new Map(rows.map((row) => [row.automationId, { inProgress: row.inProgress, finished: row.finished }]))
}

/**
 * Which flows send which sequence, read from each flow's saved steps. A flow
 * still being drawn counts too: its step already names the sequence.
 */
async function sequenceUsers(workspaceId: string, database: CustomShellDb) {
  const flows = await database
    .select({ id: customShellAutomations.id, name: customShellAutomations.name, graph: customShellAutomations.graph })
    .from(customShellAutomations)
    .where(and(eq(customShellAutomations.workspaceId, workspaceId), eq(customShellAutomations.kind, "flow")))
    .orderBy(customShellAutomations.name)
  const users = new Map<string, SequenceUser[]>()
  for (const flow of flows) {
    const graph = automationGraphSchema.safeParse(flow.graph)
    if (!graph.success) continue
    const sent = new Set(
      graph.data.nodes
        .filter((node) => node.kind === sendSequenceNode.kind)
        .map((node) => readSendSequence(node.settings).sequenceId)
        .filter(Boolean)
    )
    for (const sequenceId of sent) users.set(sequenceId, [...(users.get(sequenceId) ?? []), { id: flow.id, name: flow.name }])
  }
  return users
}

function toRow(
  row: CustomShellAutomation,
  counts: { inProgress: number; finished: number } | undefined,
  usedBy: SequenceUser[] = []
): SequenceRow {
  const graph = automationGraphSchema.safeParse(row.graph)
  return {
    id: row.id,
    name: row.name,
    steps: graph.success ? sequenceFromGraph(graph.data) : null,
    usedBy,
    inProgress: counts?.inProgress ?? 0,
    finished: counts?.finished ?? 0,
    updatedAt: row.updatedAt,
  }
}

/** This site's sequences, the one changed last first. */
export async function listSequences(workspaceId: string, database: CustomShellDb = db): Promise<SequenceRow[]> {
  const rows = await database
    .select()
    .from(customShellAutomations)
    .where(and(eq(customShellAutomations.workspaceId, workspaceId), eq(customShellAutomations.kind, "sequence")))
    .orderBy(desc(customShellAutomations.updatedAt))
  const [counts, users] = await Promise.all([
    runCounts(
      rows.map((row) => row.id),
      database
    ),
    sequenceUsers(workspaceId, database),
  ])
  return rows.map((row) => toRow(row, counts.get(row.id), users.get(row.id)))
}

/** One of this site's sequences, or an error when the id is not one. */
async function requireSequence(workspaceId: string, id: string, database: CustomShellDb) {
  const [row] = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, id),
        eq(customShellAutomations.workspaceId, workspaceId),
        eq(customShellAutomations.kind, "sequence")
      )
    )
    .limit(1)
  if (!row) throw new Error("NOT_FOUND")
  return row
}

async function withCounts(row: CustomShellAutomation, database: CustomShellDb) {
  const [counts, users] = await Promise.all([runCounts([row.id], database), sequenceUsers(row.workspaceId, database)])
  return toRow(row, counts.get(row.id), users.get(row.id))
}

/** A new sequence holding one empty email. */
export async function createSequence(
  workspaceId: string,
  userId: string,
  name: string,
  database: CustomShellDb = db
): Promise<SequenceRow> {
  const graph = sequenceToGraph({ emails: [newSequenceEmail(true)] })
  const row = await createWorkspaceAutomation(workspaceId, userId, name, database, graph, "sequence")
  return toRow(row, undefined)
}

/**
 * Saves the name and the emails. People already partway through keep the
 * emails as they were when they started; only people who start after the
 * save get the new ones.
 */
export async function saveSequence(
  workspaceId: string,
  input: { id: string; name: string; steps: SequenceSteps },
  database: CustomShellDb = db
): Promise<SequenceRow> {
  const row = await saveWorkspaceAutomation(
    workspaceId,
    { id: input.id, name: input.name, graph: sequenceToGraph(input.steps) },
    database,
    "sequence"
  )
  if (!row) throw new Error("NOT_FOUND")
  return withCounts(row, database)
}

/** A copy, named "… copy". */
export async function duplicateSequence(
  workspaceId: string,
  userId: string,
  id: string,
  database: CustomShellDb = db
): Promise<SequenceRow> {
  await requireSequence(workspaceId, id, database)
  const row = await duplicateWorkspaceAutomation(workspaceId, userId, id, database)
  if (!row) throw new Error("NOT_FOUND")
  return toRow(row, undefined)
}

/** Deletes sequences only; a flow's id passed here is left alone. */
export async function deleteSequences(workspaceId: string, ids: string[], database: CustomShellDb = db) {
  const owned = await database
    .select({ id: customShellAutomations.id })
    .from(customShellAutomations)
    .where(
      and(
        inArray(customShellAutomations.id, ids),
        eq(customShellAutomations.workspaceId, workspaceId),
        eq(customShellAutomations.kind, "sequence")
      )
    )
  if (!owned.length) return 0
  return deleteWorkspaceAutomations(
    workspaceId,
    owned.map((row) => row.id),
    database
  )
}

/**
 * The Send sequence step: starts the sequence's own run for the flow's
 * person, at email 1, and says what it did for the flow's history. A test run
 * starts a test run of the sequence, which mails the tester's address.
 *
 * The new run's key names the flow's run and step, and the database takes a
 * key once per automation, so a step that is retried after a crash cannot
 * start the same person twice.
 */
export async function startSequenceForRun(
  input: {
    run: CustomShellAutomationRun
    nodeId: string
    settings: Record<string, unknown>
    now: Date
    testRun: boolean
  },
  database: CustomShellDb = db
): Promise<string> {
  const { run, nodeId, now } = input
  const { sequenceId, sequenceName } = readSendSequence(input.settings)
  const who = run.subjectLabel?.trim()
  if (!run.subjectContactId && !run.subjectUserId) {
    throw new Error(
      "This run is not about one person, so there is nobody to send the sequence to. Start the flow from a step about one person, such as the Segment start."
    )
  }
  const [sequence] = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, sequenceId),
        eq(customShellAutomations.workspaceId, await workspaceForRun(run, database)),
        eq(customShellAutomations.kind, "sequence")
      )
    )
    .limit(1)
  if (!sequence) {
    throw new Error(`The sequence “${sequenceName || "this step picked"}” no longer exists. Pick another in this step.`)
  }
  const inspected = inspectAutomation(sequence)
  const entry = inspected.compiledConfig ? automationEntryNodeId(inspected.compiledConfig) : null
  if (!inspected.compiledConfig || inspected.errors.length > 0 || !entry) {
    throw new Error(`The sequence “${sequence.name}” has an email that is not ready to send. Open it in CRM, Broadcasts, Sequences.`)
  }
  await database
    .insert(customShellAutomationRuns)
    .values({
      id: uuid(),
      automationId: sequence.id,
      userId: run.userId,
      workspaceId: sequence.workspaceId,
      status: "active",
      currentNodeId: entry,
      configSnapshot: inspected.compiledConfig,
      wakeAt: now,
      attempts: 0,
      subjectContactId: run.subjectContactId,
      subjectUserId: run.subjectUserId,
      subjectLabel: run.subjectLabel,
      testRun: input.testRun,
      testRecipientEmail: run.testRecipientEmail,
      triggerKind: sendSequenceNode.kind,
      triggerKey: `run:${run.id}:${nodeId}`,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
  const emails = sequenceFromGraph(inspected.graph)?.emails.length
  const count = emails ? ` (${emails} ${emails === 1 ? "email" : "emails"})` : ""
  return input.testRun
    ? `Started a test of “${sequence.name}”${count} for ${who ?? "the test person"}. Its emails go to the test address.`
    : `Started “${sequence.name}”${count} for ${who ?? "this person"}.`
}
