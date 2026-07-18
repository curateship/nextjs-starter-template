
import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import {
  parseAutomationGraph,
  topologicalAutomationNodes,
  validateAutomationGraph,
} from '@/features/automations/domain/graph'
import { getNextAutomationRunAt } from '@/features/automations/domain/schedule'
import type {
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
  AutomationRunStatus,
  AutomationSourcePort,
  AutomationTriggerType,
  ScrapedDocument,
  StructuredArticle,
} from '@/features/automations/domain/types'
import { db } from '@/lib/db'
import {
  siteAutomations,
  siteAutomationRuns,
  siteAutomationRunSteps,
} from '@/lib/db/schema'
import {
  deriveAutomationRunStatus,
  shouldRetryAutomationNode,
} from './execution-policy'
import { runAgentNode } from './nodes/agent'
import { runListingNode, type ListingNodeResult } from './nodes/listing'
import { runPostNode, type PostNodeResult } from './nodes/post'
import { runRouterNode } from './nodes/router'
import { runScraperNode } from './nodes/scraper'

const AUTOMATION_LOCK_TIMEOUT_MS = 30 * 60 * 1000
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

type RuntimeOutput =
  | { type: 'signal' }
  | { type: 'documents'; documents: ScrapedDocument[]; fetchedCount?: number; unchangedCount?: number }
  | { type: 'routes'; groups: Record<string, ScrapedDocument[]> }
  | { type: 'article'; article: StructuredArticle }
  | { type: 'post'; post: PostNodeResult }
  | { type: 'listing'; listing: ListingNodeResult }

type StepResult = {
  status: 'success' | 'failed' | 'skipped'
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

    const results = await executeGraph({ automationId, siteId: automation.siteId, runId: run.id, graph, triggerType, lockToken })
    const failed = [...results.values()].filter((result) => result.status === 'failed')
    const status: AutomationRunStatus = deriveAutomationRunStatus([...results.values()].map((result) => ({
      failed: result.status === 'failed',
      createdContent: result.output?.type === 'post'
        || (result.output?.type === 'listing' && result.output.listing.createdCount > 0),
    })))
    const completedAt = new Date()
    const error = failed.length
      ? failed.map((result) => result.error).filter(Boolean).join('\n').slice(0, 5000)
      : null
    const [completedRun] = await db
      .update(siteAutomationRuns)
      .set({
        status,
        error,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(siteAutomationRuns.id, run.id))
      .returning()
    await finishAutomation(automation, graph, lockToken, triggerType, status, completedAt)
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
  siteId: string
  runId: string
  graph: AutomationGraph
  triggerType: AutomationTriggerType
  lockToken: string
}) {
  const results = new Map<string, StepResult>()
  const incomingByNode = new Map<string, AutomationEdge[]>()
  for (const edge of input.graph.edges) incomingByNode.set(edge.to, [...(incomingByNode.get(edge.to) ?? []), edge])

  for (const node of topologicalAutomationNodes(input.graph)) {
    await refreshAutomationLock(input.automationId, input.lockToken)
    const incoming = incomingByNode.get(node.id) ?? []
    const failedParent = incoming.find((edge) => results.get(edge.from)?.status === 'failed')
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
    await startStep(input.runId, node, inputSummary)
    try {
      const { output, attempts } = await executeNodeWithRetries(input, node, payloads)
      const result: StepResult = { status: 'success', output }
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
  node: AutomationNode,
  payloads: RuntimeOutput[]
) {
  let attempts = 0
  while (true) {
    attempts++
    try {
      if (node.kind === 'time') return { output: { type: 'signal' } as RuntimeOutput, attempts }
      if (node.kind === 'scraper') {
        const result = await runScraperNode(context.automationId, node)
        return {
          output: {
            type: 'documents',
            documents: result.documents,
            fetchedCount: result.fetchedCount,
            unchangedCount: result.unchangedCount,
          } as RuntimeOutput,
          attempts,
        }
      }
      if (node.kind === 'router') {
        const result = await runRouterNode(context.siteId, node, documentsFrom(payloads))
        return { output: { type: 'routes', groups: result.groups } as RuntimeOutput, attempts }
      }
      if (node.kind === 'agent') {
        const result = await runAgentNode(context.siteId, node, documentsFrom(payloads))
        return { output: { type: 'article', article: result.article } as RuntimeOutput, attempts }
      }
      if (node.kind === 'listing') {
        const listing = await runListingNode(context.siteId, node, documentsFrom(payloads), { automationId: context.automationId })
        return { output: { type: 'listing', listing } as RuntimeOutput, attempts }
      }
      const article = payloads.find((payload): payload is Extract<RuntimeOutput, { type: 'article' }> => payload.type === 'article')?.article
      if (!article) throw new Error('Post did not receive an article')
      const post = await runPostNode(context.siteId, node, article)
      return { output: { type: 'post', post } as RuntimeOutput, attempts }
    } catch (error) {
      if (!shouldRetryAutomationNode(node.kind, error, attempts)) {
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

function documentsFrom(payloads: RuntimeOutput[]) {
  const byUrl = new Map<string, ScrapedDocument>()
  for (const payload of payloads) {
    if (payload.type !== 'documents') continue
    for (const document of payload.documents) byUrl.set(document.url, document)
  }
  return [...byUrl.values()]
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
  if (output.type === 'article') return { title: output.article.title }
  if (output.type === 'listing') return {
    createdCount: output.listing.createdCount,
    skippedCount: output.listing.skippedCount,
    listings: output.listing.listings.map((listing) => ({ title: listing.title, slug: listing.slug, url: listing.url })),
    skipped: output.listing.skipped,
  }
  return output.post
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
