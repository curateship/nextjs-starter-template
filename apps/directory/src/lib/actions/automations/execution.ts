
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import {
  downstreamAutomationNodeIds,
  parseAutomationGraph,
  topologicalAutomationNodes,
  validateAutomationGraph,
} from '@/features/automations/domain/graph'
import { isRecord } from '@/features/automations/domain/parse-utils'
import { getNextAutomationRunAt } from '@/features/automations/domain/schedule'
import type {
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
  AutomationRunStatus,
  AutomationSourcePort,
  AutomationStepStatus,
  AutomationTriggerType,
} from '@/features/automations/domain/types'
import { db } from '@/lib/db'
import {
  siteAutomations,
  siteAutomationApprovals,
  siteAutomationRuns,
  siteAutomationRunSteps,
} from '@/lib/db/schema'
import {
  deriveAutomationRunStatus,
  shouldRetryAutomationNode,
} from './execution-policy'
import { getNodeExecutor, type ExecutableAutomationNode } from './node-executors'
import { pauseForApproval, parseApprovalPayload } from './nodes/approval'
import { documentsFrom, type RuntimeOutput } from './runtime'

const AUTOMATION_LOCK_TIMEOUT_MS = 30 * 60 * 1000
const APPROVAL_BATCH_LIMIT = 5
const REJECTED_MESSAGE = 'You rejected this step, so nothing after it ran.'
const EXPIRED_MESSAGE = 'Nobody answered this step in time, so the run expired.'
// The reason recorded on a gate's step, and on every step after it, when a branch
// is closed without running. A 'failed' close always passes its own message; this
// entry only covers a caller that does not.
const CLOSE_MESSAGES = {
  rejected: REJECTED_MESSAGE,
  expired: EXPIRED_MESSAGE,
  failed: 'This step could not be finished after it was approved.',
} as const
class NodeExecutionError extends Error {
  constructor(message: string, readonly attempts: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NodeExecutionError'
  }
}

class ScheduledAutomationNotRunnableError extends Error {
  constructor() {
    super('Scheduled automation is no longer due or is already running')
    this.name = 'ScheduledAutomationNotRunnableError'
  }
}

type StepResult = {
  // 'waiting' means this node is an Approval gate that stopped the run, or sits
  // after one. Either way nothing more on that branch runs until a decision.
  status: 'success' | 'failed' | 'skipped' | 'waiting'
  output?: RuntimeOutput
  error?: string
}

export async function processDueAutomations(limit = 3): Promise<{ processed: number; failed: number }> {
  const due = await db
    .select({ id: siteAutomations.id })
    .from(siteAutomations)
    .where(and(eq(siteAutomations.status, 'active'), lte(siteAutomations.nextRunAt, new Date())))
    .orderBy(asc(siteAutomations.nextRunAt))
    .limit(limit)
  let processed = 0
  let failed = 0
  for (const row of due) {
    try {
      const run = await executeAutomation(row.id, 'schedule')
      processed++
      if (run.status === 'failed') failed++
    } catch (error) {
      if (error instanceof ScheduledAutomationNotRunnableError) continue
      console.error('Scheduled automation failed before a run could be recorded:', error)
      failed++
    }
  }
  return { processed, failed }
}

/**
 * The other half of the cron tick: move paused runs forward. Approved gates resume
 * their remaining steps, and gates nobody answered inside their window expire so a
 * paused run never sits in the list forever.
 */
export async function processAutomationApprovals(limit = APPROVAL_BATCH_LIMIT): Promise<{ resumed: number; expired: number }> {
  const expired = await expireOverdueApprovals(limit)
  const approved = await db
    .select({ id: siteAutomationApprovals.id })
    .from(siteAutomationApprovals)
    // A cleared payload is what marks a gate as already consumed, so this also
    // stops a resumed run being picked up twice.
    .where(and(eq(siteAutomationApprovals.status, 'approved'), isNotNull(siteAutomationApprovals.payload)))
    .orderBy(asc(siteAutomationApprovals.decidedAt))
    .limit(limit)
  let resumed = 0
  for (const approval of approved) {
    try {
      if (await resumeApprovedRun(approval.id)) resumed++
    } catch (error) {
      console.error('Failed to resume an approved automation run:', error)
    }
  }
  return { resumed, expired }
}

async function expireOverdueApprovals(limit: number) {
  const now = new Date()
  const overdue = await db
    .select({ id: siteAutomationApprovals.id, runId: siteAutomationApprovals.runId, nodeId: siteAutomationApprovals.nodeId })
    .from(siteAutomationApprovals)
    .where(and(eq(siteAutomationApprovals.status, 'pending'), lte(siteAutomationApprovals.expiresAt, now)))
    .orderBy(asc(siteAutomationApprovals.expiresAt))
    .limit(limit)
  let expired = 0
  for (const approval of overdue) {
    // One unexpiable gate must not take the whole cron tick down with it — the
    // scheduled runs that follow this sweep still need to go out.
    try {
      // Claim it first: whoever flips it away from 'pending' owns closing the branch,
      // so a decision landing at the same moment cannot be double-counted.
      const [claimed] = await db
        .update(siteAutomationApprovals)
        .set({ status: 'expired', decidedAt: now, payload: null })
        .where(and(eq(siteAutomationApprovals.id, approval.id), eq(siteAutomationApprovals.status, 'pending')))
        .returning({ id: siteAutomationApprovals.id })
      if (!claimed) continue
      await closeApprovalBranch(approval.runId, approval.nodeId, 'expired')
      expired++
    } catch (error) {
      console.error('Failed to expire an overdue automation approval:', error)
    }
  }
  return expired
}

/**
 * Run everything after an approved gate, on whatever process the cron happens to
 * be running in. The graph comes from the run's own snapshot, so edits made to the
 * automation while it waited cannot change what was approved.
 */
async function resumeApprovedRun(approvalId: string): Promise<boolean> {
  const [approval] = await db.select().from(siteAutomationApprovals).where(eq(siteAutomationApprovals.id, approvalId)).limit(1)
  if (!approval || approval.status !== 'approved' || approval.payload === null) return false
  const [run] = await db.select().from(siteAutomationRuns).where(eq(siteAutomationRuns.id, approval.runId)).limit(1)
  const [automation] = await db.select().from(siteAutomations).where(eq(siteAutomations.id, approval.automationId)).limit(1)
  if (!run || !automation || run.status !== 'waiting') {
    // The run was already closed some other way (a failure, a deleted automation).
    // Drop the held payload rather than leaving it to be retried forever.
    await db.update(siteAutomationApprovals).set({ payload: null }).where(eq(siteAutomationApprovals.id, approvalId))
    return false
  }

  const lockToken = await acquireAutomationLock(automation.id, 'manual')
  // The automation is busy with another run; the next cron tick picks this up.
  if (!lockToken) return false

  try {
    const graph = parseAutomationGraph(run.graphSnapshot)
    const gate = graph.nodes.find((node) => node.id === approval.nodeId)
    if (!gate || gate.kind !== 'approval') throw new Error('The approved step is no longer part of this run')
    const payload = parseApprovalPayload(approval.payload)

    // Consume the payload before any downstream work runs. If this process dies
    // mid-resume the run fails cleanly instead of creating the post twice.
    const [claimed] = await db
      .update(siteAutomationApprovals)
      .set({ payload: null })
      .where(and(eq(siteAutomationApprovals.id, approvalId), isNotNull(siteAutomationApprovals.payload)))
      .returning({ id: siteAutomationApprovals.id })
    if (!claimed) return false

    await finishStep(run.id, gate, { status: 'success', output: payload }, 1)
    const downstream = downstreamAutomationNodeIds(graph, gate.id)
    await executeGraph({
      automationId: automation.id,
      automationName: automation.name,
      siteId: automation.siteId,
      runId: run.id,
      graph,
      nodes: topologicalAutomationNodes(graph).filter((node) => downstream.has(node.id)),
      triggerType: run.triggerType as AutomationTriggerType,
      lockToken,
      seededResults: new Map([[gate.id, { status: 'success', output: payload } as StepResult]]),
    })
    await finalizeRunAfterApproval(run)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The approved run could not be resumed'
    await closeApprovalBranch(run.id, approval.nodeId, 'failed', message.slice(0, 5000))
    return false
  } finally {
    await releaseAutomationLock(automation.id, lockToken)
  }
}

/**
 * End one gate's branch: the gate's own step takes `stepStatus`, everything after
 * it is skipped, and the run is closed unless another gate in it is still open.
 */
export async function closeApprovalBranch(
  runId: string,
  nodeId: string,
  stepStatus: Extract<AutomationStepStatus, 'rejected' | 'expired' | 'failed'>,
  message: string = CLOSE_MESSAGES[stepStatus]
) {
  const [run] = await db.select().from(siteAutomationRuns).where(eq(siteAutomationRuns.id, runId)).limit(1)
  if (!run) return
  // Read the snapshot before writing anything: a graph that cannot be parsed must
  // fail before the gate's step is flipped, or the run would be left half-closed
  // and stuck waiting with nothing able to finish it.
  const downstream = [...downstreamAutomationNodeIds(parseAutomationGraph(run.graphSnapshot), nodeId)]
  const completedAt = new Date()
  const [step] = await db
    .select({ startedAt: siteAutomationRunSteps.startedAt })
    .from(siteAutomationRunSteps)
    .where(and(eq(siteAutomationRunSteps.runId, runId), eq(siteAutomationRunSteps.nodeId, nodeId)))
    .limit(1)
  await db
    .update(siteAutomationRunSteps)
    .set({
      status: stepStatus,
      error: message,
      completedAt,
      durationMs: step?.startedAt ? completedAt.getTime() - step.startedAt.getTime() : 0,
    })
    .where(and(eq(siteAutomationRunSteps.runId, runId), eq(siteAutomationRunSteps.nodeId, nodeId)))

  if (downstream.length) {
    await db
      .update(siteAutomationRunSteps)
      .set({ status: 'skipped', error: message, completedAt, durationMs: 0 })
      .where(and(
        eq(siteAutomationRunSteps.runId, runId),
        inArray(siteAutomationRunSteps.nodeId, downstream),
        inArray(siteAutomationRunSteps.status, ['pending', 'running']),
      ))
  }
  await finalizeRunAfterApproval(run)
}

async function finalizeRunAfterApproval(run: typeof siteAutomationRuns.$inferSelect) {
  const outcome = await summarizeRunOutcome(run.id)
  // Another gate in the same run is still open, so the run keeps waiting.
  if (outcome.status === 'waiting') return
  await writeRunOutcome(run.id, outcome, run.startedAt)

  // Only speak for the automation's headline status if this is still its newest
  // run — a run approved late must not overwrite a fresher run's result.
  const [latest] = await db
    .select({ id: siteAutomationRuns.id })
    .from(siteAutomationRuns)
    .where(eq(siteAutomationRuns.automationId, run.automationId))
    .orderBy(desc(siteAutomationRuns.startedAt))
    .limit(1)
  if (latest?.id !== run.id) return
  await db
    .update(siteAutomations)
    .set({ lastRunStatus: outcome.status })
    .where(eq(siteAutomations.id, run.automationId))
}

export async function executeAutomation(
  automationId: string,
  triggerType: AutomationTriggerType
): Promise<typeof siteAutomationRuns.$inferSelect> {
  const lockToken = await acquireAutomationLock(automationId, triggerType)
  if (!lockToken) {
    if (triggerType === 'schedule') throw new ScheduledAutomationNotRunnableError()
    throw new Error('Automation is already running')
  }
  const startedAt = new Date()
  let runId: string | null = null

  try {
    const [automation] = await db.select().from(siteAutomations).where(eq(siteAutomations.id, automationId)).limit(1)
    if (!automation) throw new Error('Automation not found')
    const graph = parseAutomationGraph(automation.graph)
    const validationErrors = validateAutomationGraph(graph)
    if (validationErrors.length) throw new Error(validationErrors[0].message)

    const [run] = await db
      .insert(siteAutomationRuns)
      .values({ automationId, triggerType, graphSnapshot: graph, status: 'running', startedAt })
      .returning()
    if (!run) throw new Error('Automation run could not be created')
    runId = run.id
    await db.insert(siteAutomationRunSteps).values(graph.nodes.map((node) => ({
      runId: run.id,
      nodeId: node.id,
      nodeKind: node.kind,
      nodeName: node.name,
      status: 'pending',
    })))

    await executeGraph({
      automationId,
      automationName: automation.name,
      siteId: automation.siteId,
      runId: run.id,
      graph,
      nodes: topologicalAutomationNodes(graph),
      triggerType,
      lockToken,
    })
    const outcome = await summarizeRunOutcome(run.id)
    const completedRun = await writeRunOutcome(run.id, outcome, startedAt)
    // A run that stopped at an approval gate still releases its lock and keeps its
    // schedule: it is not executing, and a human may take days to answer.
    await finishAutomation(automation, graph, lockToken, triggerType, outcome.status, new Date())
    return completedRun
  } catch (error) {
    const completedAt = new Date()
    const message = error instanceof Error ? error.message : 'Automation run failed'
    if (runId) {
      const [failedRun] = await db
        .update(siteAutomationRuns)
        .set({
          status: 'failed',
          error: message.slice(0, 5000),
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        })
        .where(eq(siteAutomationRuns.id, runId))
        .returning()
      await releaseAutomationLock(automationId, lockToken, 'failed', completedAt)
      return failedRun
    }
    await releaseAutomationLock(automationId, lockToken)
    throw error
  }
}

async function executeGraph(input: {
  automationId: string
  automationName: string
  siteId: string
  runId: string
  graph: AutomationGraph
  // The nodes to run, topologically ordered. A first run passes the whole graph;
  // resuming an approved gate passes only the nodes after that gate.
  nodes: AutomationNode[]
  triggerType: AutomationTriggerType
  lockToken: string
  // Results already known from an earlier pass, keyed by node ID. On a resume this
  // carries the payload the approved gate was holding.
  seededResults?: Map<string, StepResult>
}) {
  const results = new Map<string, StepResult>(input.seededResults)
  const incomingByNode = new Map<string, AutomationEdge[]>()
  for (const edge of input.graph.edges) incomingByNode.set(edge.to, [...(incomingByNode.get(edge.to) ?? []), edge])

  for (const node of input.nodes) {
    await refreshAutomationLock(input.automationId, input.lockToken)
    const incoming = incomingByNode.get(node.id) ?? []
    // An earlier node is waiting on an approval, so this one stays 'pending' in the
    // database, ready for the resume pass. Nothing is written for it here.
    if (incoming.some((edge) => results.get(edge.from)?.status === 'waiting')) {
      results.set(node.id, { status: 'waiting' })
      continue
    }
    // A soft failure (a failed step that still produced output, such as an AI
    // Image node that skipped its image) does not block downstream nodes.
    const failedParent = incoming.find((edge) => {
      const parent = results.get(edge.from)
      return parent?.status === 'failed' && !parent.output
    })
    if (failedParent) {
      const result: StepResult = { status: 'skipped', error: 'A required earlier node failed.' }
      results.set(node.id, result)
      await finishStep(input.runId, node, result)
      continue
    }
    const payloads = incoming.flatMap((edge) => {
      const output = results.get(edge.from)?.output
      const payload = output ? outputForPort(output, edge.sourcePort) : null
      return payload ? [payload] : []
    })
    if (node.kind !== 'time' && payloads.length === 0) {
      const result: StepResult = { status: 'skipped', error: 'No new or matching input reached this node.' }
      results.set(node.id, result)
      await finishStep(input.runId, node, result)
      continue
    }

    const inputSummary = summarizeInputs(payloads)
    if (node.kind === 'approval') {
      const pause = await pauseForApproval({
        siteId: input.siteId,
        automationId: input.automationId,
        automationName: input.automationName,
        runId: input.runId,
        node,
        payload: payloads[0],
      })
      results.set(node.id, { status: 'waiting' })
      await waitStep(input.runId, node, inputSummary, pause.expiresAt)
      continue
    }

    await startStep(input.runId, node, inputSummary)
    try {
      const { output, attempts } = await executeNodeWithRetries(input, node, payloads)
      const imageError = output.type === 'article' ? output.imageError : undefined
      const result: StepResult = imageError
        ? { status: 'failed', output, error: `${node.name}: ${imageError}` }
        : { status: 'success', output }
      results.set(node.id, result)
      await finishStep(input.runId, node, result, attempts)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Node failed'
      const result: StepResult = { status: 'failed', error: `${node.name}: ${message}` }
      results.set(node.id, result)
      await finishStep(input.runId, node, result, error instanceof NodeExecutionError ? error.attempts : 1)
    }
  }
  return results
}

async function executeNodeWithRetries(
  context: { automationId: string; siteId: string; triggerType: AutomationTriggerType },
  node: ExecutableAutomationNode,
  payloads: RuntimeOutput[]
) {
  const executor = getNodeExecutor(node.kind)
  let attempts = 0
  while (true) {
    attempts++
    try {
      const output = await executor.run(context, payloads, node)
      return { output, attempts }
    } catch (error) {
      if (!shouldRetryAutomationNode(executor.retry, error, attempts)) {
        throw new NodeExecutionError(error instanceof Error ? error.message : 'Node failed', attempts, { cause: error })
      }
      await new Promise((resolve) => setTimeout(resolve, attempts * 250))
    }
  }
}

function outputForPort(output: RuntimeOutput, sourcePort: AutomationSourcePort): RuntimeOutput | null {
  if (output.type === 'routes') {
    const documents = output.groups[sourcePort] ?? []
    return documents.length ? { type: 'documents', documents } : null
  }
  if (output.type === 'documents' && output.documents.length === 0) return null
  return output
}

function summarizeInputs(payloads: RuntimeOutput[]) {
  const documents = documentsFrom(payloads)
  const articles = payloads.filter((item) => item.type === 'article')
  return {
    documentCount: documents.length,
    sources: documents.map((document) => safeSourceSummary(document.url)),
    articleCount: articles.length,
  }
}

function summarizeOutput(output: RuntimeOutput | undefined) {
  if (!output) return {}
  if (output.type === 'signal') return { fired: true }
  if (output.type === 'documents') return {
    changedCount: output.documents.length,
    ...(output.fetchedCount === undefined ? {} : { fetchedCount: output.fetchedCount }),
    ...(output.unchangedCount === undefined ? {} : { unchangedCount: output.unchangedCount }),
    sources: output.documents.map((document) => safeSourceSummary(document.url)),
  }
  if (output.type === 'routes') {
    return { routeCounts: Object.fromEntries(Object.entries(output.groups).map(([port, documents]) => [port, documents.length])) }
  }
  if (output.type === 'article') {
    // Only annotate the image outcome when this step actually attempted one, so
    // the AI Agent's own step summary stays a plain title.
    if (output.imageError !== undefined || output.article.featuredImage !== undefined) {
      return {
        title: output.article.title,
        imageAttached: Boolean(output.article.featuredImage),
        ...(output.imageError ? { imageError: output.imageError } : {}),
      }
    }
    return { title: output.article.title }
  }
  if (output.type === 'listing') return {
    createdCount: output.listing.createdCount,
    skippedCount: output.listing.skippedCount,
    listings: output.listing.listings.map((listing) => ({ title: listing.title, slug: listing.slug, url: listing.url })),
    skipped: output.listing.skipped,
  }
  if (output.type === 'event') return {
    createdCount: output.event.createdCount,
    skippedCount: output.event.skippedCount,
    events: output.event.events.map((event) => ({ title: event.title, slug: event.slug, url: event.url })),
    skipped: output.event.skipped,
  }
  return output.post
}

/**
 * Whether a finished step actually put something on the site. Reads the summary
 * `summarizeOutput` above wrote, so the two must stay in step: Post always records
 * the created post's ID, Listing and Event record how many rows they drafted
 * (which can be zero when everything on the page was already there).
 *
 * This is what makes a run's final status derivable from the database alone, which
 * a run that pauses for approval and finishes in a later process needs.
 */
function stepCreatedContent(nodeKind: string, outputSummary: unknown) {
  if (!isRecord(outputSummary)) return false
  if (nodeKind === 'post') return typeof outputSummary.postId === 'string'
  if (nodeKind === 'listing' || nodeKind === 'event') {
    return typeof outputSummary.createdCount === 'number' && outputSummary.createdCount > 0
  }
  return false
}

/**
 * The run's status and error text, derived from its persisted steps. Used by both
 * the first pass and every resume, so a run is judged the same way either way.
 */
async function summarizeRunOutcome(runId: string): Promise<{ status: AutomationRunStatus; error: string | null }> {
  const steps = await db
    .select({
      nodeKind: siteAutomationRunSteps.nodeKind,
      status: siteAutomationRunSteps.status,
      outputSummary: siteAutomationRunSteps.outputSummary,
      error: siteAutomationRunSteps.error,
    })
    .from(siteAutomationRunSteps)
    .where(eq(siteAutomationRunSteps.runId, runId))
    .orderBy(asc(siteAutomationRunSteps.startedAt), asc(siteAutomationRunSteps.nodeName))

  if (steps.some((step) => step.status === 'waiting')) return { status: 'waiting', error: null }

  const rejected = steps.some((step) => step.status === 'rejected')
  const expired = steps.some((step) => step.status === 'expired')
  const derived = deriveAutomationRunStatus(steps.map((step) => ({
    failed: step.status === 'failed',
    createdContent: stepCreatedContent(step.nodeKind, step.outputSummary),
  })))
  const notes = [
    ...steps.filter((step) => step.status === 'failed' && step.error).map((step) => step.error as string),
    ...(rejected ? [REJECTED_MESSAGE] : []),
    ...(expired ? [EXPIRED_MESSAGE] : []),
  ]
  return {
    // A decision that stopped the run is the most useful single label for it, even
    // when another branch of the same run did create something.
    status: rejected ? 'rejected' : expired ? 'expired' : derived,
    error: notes.length ? notes.join('\n').slice(0, 5000) : null,
  }
}

async function writeRunOutcome(
  runId: string,
  outcome: { status: AutomationRunStatus; error: string | null },
  startedAt: Date
) {
  // A waiting run is not finished, so it gets no completion time or duration.
  const completedAt = outcome.status === 'waiting' ? null : new Date()
  const [row] = await db
    .update(siteAutomationRuns)
    .set({
      status: outcome.status,
      error: outcome.error,
      completedAt,
      durationMs: completedAt ? completedAt.getTime() - startedAt.getTime() : null,
    })
    .where(eq(siteAutomationRuns.id, runId))
    .returning()
  return row
}

function safeSourceSummary(value: string) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return 'Invalid source URL'
  }
}

async function startStep(runId: string, node: AutomationNode, inputSummary: Record<string, unknown>) {
  await db
    .update(siteAutomationRunSteps)
    .set({ status: 'running', inputSummary, startedAt: new Date(), error: null })
    .where(and(eq(siteAutomationRunSteps.runId, runId), eq(siteAutomationRunSteps.nodeId, node.id)))
}

// An approval gate's step stops here: started, not finished. It keeps its start
// time so the resume can report how long the decision took.
async function waitStep(runId: string, node: AutomationNode, inputSummary: Record<string, unknown>, expiresAt: Date) {
  await db
    .update(siteAutomationRunSteps)
    .set({
      status: 'waiting',
      attemptCount: 1,
      inputSummary,
      outputSummary: { awaitingApproval: true, expiresAt: expiresAt.toISOString() },
      startedAt: new Date(),
      completedAt: null,
      durationMs: null,
      error: null,
    })
    .where(and(eq(siteAutomationRunSteps.runId, runId), eq(siteAutomationRunSteps.nodeId, node.id)))
}

async function finishStep(runId: string, node: AutomationNode, result: StepResult, attempts = 0) {
  const completedAt = new Date()
  const [step] = await db
    .select({ startedAt: siteAutomationRunSteps.startedAt })
    .from(siteAutomationRunSteps)
    .where(and(eq(siteAutomationRunSteps.runId, runId), eq(siteAutomationRunSteps.nodeId, node.id)))
    .limit(1)
  await db
    .update(siteAutomationRunSteps)
    .set({
      status: result.status,
      attemptCount: attempts,
      outputSummary: summarizeOutput(result.output),
      error: result.error?.slice(0, 5000) ?? null,
      completedAt,
      durationMs: step?.startedAt ? completedAt.getTime() - step.startedAt.getTime() : 0,
    })
    .where(and(eq(siteAutomationRunSteps.runId, runId), eq(siteAutomationRunSteps.nodeId, node.id)))
}

async function acquireAutomationLock(automationId: string, triggerType: AutomationTriggerType) {
  const token = randomUUID()
  const now = new Date()
  const staleBefore = new Date(Date.now() - AUTOMATION_LOCK_TIMEOUT_MS)
  const [row] = await db
    .update(siteAutomations)
    .set({ lockToken: token, lockStartedAt: now, updatedAt: now })
    .where(and(
      eq(siteAutomations.id, automationId),
      ...(triggerType === 'schedule' ? [
        eq(siteAutomations.status, 'active'),
        lte(siteAutomations.nextRunAt, now),
      ] : []),
      or(
        sql`${siteAutomations.lockToken} is null`,
        sql`${siteAutomations.lockStartedAt} is null`,
        lte(siteAutomations.lockStartedAt, staleBefore),
      ),
    ))
    .returning({ id: siteAutomations.id })
  if (row) {
    const completedAt = new Date()
    const staleRuns = await db
      .update(siteAutomationRuns)
      .set({ status: 'failed', error: 'Run stopped before completion.', completedAt })
      .where(and(
        eq(siteAutomationRuns.automationId, automationId),
        eq(siteAutomationRuns.status, 'running'),
        lte(siteAutomationRuns.startedAt, staleBefore),
      ))
      .returning({ id: siteAutomationRuns.id })
    const staleRunIds = staleRuns.map((run) => run.id)
    if (staleRunIds.length) {
      await db
        .update(siteAutomationRunSteps)
        .set({ status: 'failed', error: 'Run stopped before this node completed.', completedAt })
        .where(and(inArray(siteAutomationRunSteps.runId, staleRunIds), eq(siteAutomationRunSteps.status, 'running')))
      await db
        .update(siteAutomationRunSteps)
        .set({ status: 'skipped', error: 'Run stopped before this node started.', completedAt })
        .where(and(inArray(siteAutomationRunSteps.runId, staleRunIds), eq(siteAutomationRunSteps.status, 'pending')))
    }
  }
  return row ? token : null
}

async function refreshAutomationLock(automationId: string, lockToken: string) {
  const [row] = await db
    .update(siteAutomations)
    .set({ lockStartedAt: new Date() })
    .where(and(eq(siteAutomations.id, automationId), eq(siteAutomations.lockToken, lockToken)))
    .returning({ id: siteAutomations.id })
  if (!row) throw new Error('Automation run lock was lost')
}

async function finishAutomation(
  automation: typeof siteAutomations.$inferSelect,
  graph: AutomationGraph,
  lockToken: string,
  triggerType: AutomationTriggerType,
  status: AutomationRunStatus,
  completedAt: Date
) {
  const timeNode = graph.nodes.find((node) => node.kind === 'time')
  const schedule = timeNode?.kind === 'time' ? timeNode.config.schedule : null
  const scheduled = triggerType === 'schedule' && schedule
  const nextRunAt = scheduled ? getNextAutomationRunAt(schedule, completedAt) : automation.nextRunAt
  const oneTimeFinished = scheduled && schedule.frequency === 'once' && !nextRunAt
  await db
    .update(siteAutomations)
    .set({
      lastRunAt: completedAt,
      lastRunStatus: status,
      ...(scheduled ? {
        nextRunAt: sql`case when ${siteAutomations.status} = 'active' and ${siteAutomations.updatedAt} = ${automation.updatedAt} then ${nextRunAt} else ${siteAutomations.nextRunAt} end`,
      } : {}),
      ...(oneTimeFinished ? {
        status: sql`case when ${siteAutomations.status} = 'active' and ${siteAutomations.updatedAt} = ${automation.updatedAt} then 'paused' else ${siteAutomations.status} end`,
      } : {}),
      lockToken: null,
      lockStartedAt: null,
      updatedAt: completedAt,
    })
    .where(and(eq(siteAutomations.id, automation.id), eq(siteAutomations.lockToken, lockToken)))
}

async function releaseAutomationLock(
  automationId: string,
  lockToken: string,
  status?: AutomationRunStatus,
  completedAt: Date = new Date()
) {
  await db
    .update(siteAutomations)
    .set({
      ...(status ? { lastRunAt: completedAt, lastRunStatus: status } : {}),
      lockToken: null,
      lockStartedAt: null,
      updatedAt: completedAt,
    })
    .where(and(eq(siteAutomations.id, automationId), eq(siteAutomations.lockToken, lockToken)))
}
