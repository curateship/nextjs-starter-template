'use server'

import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from '@/lib/cache'
import {
  parseAutomationGraph,
  validateAutomationGraph,
} from '@/features/automations/domain/graph'
import { createInitialAutomationGraph } from '@/features/automations/domain/catalog'
import { getNextAutomationRunAt } from '@/features/automations/domain/schedule'
import type {
  AutomationEditorData,
  AutomationGraph,
  AutomationListItem,
  AutomationRunItem,
  AutomationStatus,
  AutomationValidationError,
} from '@/features/automations/domain/types'
import { getConfiguredAIProviders } from '@/lib/actions/integrations/config-helpers'
import { db } from '@/lib/db'
import {
  categories,
  postTemplates,
  siteAutomations,
  siteAutomationRuns,
  siteAutomationRunSteps,
  sites,
} from '@/lib/db/schema'
import { getAuthenticatedUser, requireSiteOwnership } from '@/lib/db/helpers'
import {
  AI_PROVIDER_DEFAULT_MODELS,
  AI_PROVIDER_LABELS,
  type AIProvider,
} from '@/lib/utils/ai-models'
import { normalizePagination, UUID_REGEX } from '@/lib/utils/validation'
import { executeAutomation } from './execution'
import { automationRowToListItem, automationRunRowToItem } from './mappers'

type AutomationSortColumn = 'name' | 'status' | 'lastRun' | 'nextRun' | 'updated'
type AutomationStatusFilter = 'all' | AutomationStatus

interface ListOptions {
  page?: number
  pageSize?: number
  search?: string
  status?: AutomationStatusFilter
  sortColumn?: AutomationSortColumn | null
  sortDirection?: 'asc' | 'desc'
}

export async function getAutomationsBySite(
  siteId: string,
  options?: ListOptions
): Promise<{
  data: AutomationListItem[]
  total: number
  statusCounts: Record<'all' | AutomationStatus, number>
  error: string | null
}> {
  const emptyCounts = { all: 0, draft: 0, active: 0, paused: 0 }
  try {
    if (!UUID_REGEX.test(siteId)) return { data: [], total: 0, statusCounts: emptyCounts, error: 'Invalid site ID' }
    await requireSiteOwnership(siteId)
    const { pageSize, offset } = normalizePagination(options)
    const where = automationWhere(siteId, options)
    const [rows, countRows, statusRows] = await Promise.all([
      db.select().from(siteAutomations).where(where).orderBy(...automationOrder(options)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(siteAutomations).where(where),
      db.select({ status: siteAutomations.status, count: sql<number>`count(*)::int` })
        .from(siteAutomations)
        .where(eq(siteAutomations.siteId, siteId))
        .groupBy(siteAutomations.status),
    ])
    const statusCounts = { ...emptyCounts }
    for (const item of statusRows) {
      if (item.status === 'draft' || item.status === 'active' || item.status === 'paused') statusCounts[item.status] = item.count
    }
    statusCounts.all = statusCounts.draft + statusCounts.active + statusCounts.paused
    return {
      data: rows.map((row) => automationRowToListItem(row, parseAutomationGraph(row.graph))),
      total: countRows[0]?.count ?? 0,
      statusCounts,
      error: null,
    }
  } catch (error) {
    console.error('getAutomationsBySite error:', error)
    return { data: [], total: 0, statusCounts: emptyCounts, error: 'Failed to load automations' }
  }
}

export async function getAutomationEditorData(automationId: string): Promise<{
  data: AutomationEditorData | null
  error: string | null
}> {
  try {
    const automation = await requireOwnedAutomation(automationId)
    if (!automation) return { data: null, error: 'Automation not found' }
    const graph = parseAutomationGraph(automation.graph)
    const [runRows, templates, categoryRows, configuredProviders] = await Promise.all([
      db.select().from(siteAutomationRuns)
        .where(eq(siteAutomationRuns.automationId, automation.id))
        .orderBy(desc(siteAutomationRuns.startedAt))
        .limit(25),
      db.select({ id: postTemplates.id, name: postTemplates.name, isDefault: postTemplates.isDefault })
        .from(postTemplates)
        .where(eq(postTemplates.siteId, automation.siteId))
        .orderBy(desc(postTemplates.isDefault), asc(postTemplates.name)),
      db.select({ id: categories.id, title: categories.title })
        .from(categories)
        .where(and(eq(categories.siteId, automation.siteId), eq(categories.isPublished, true)))
        .orderBy(asc(categories.title)),
      getConfiguredAIProviders(automation.siteId),
    ])
    const runIds = runRows.map((run) => run.id)
    const stepRows = runIds.length
      ? await db.select().from(siteAutomationRunSteps)
        .where(inArray(siteAutomationRunSteps.runId, runIds))
        .orderBy(asc(siteAutomationRunSteps.startedAt), asc(siteAutomationRunSteps.nodeName))
      : []
    const stepsByRun = new Map<string, typeof stepRows>()
    for (const step of stepRows) stepsByRun.set(step.runId, [...(stepsByRun.get(step.runId) ?? []), step])
    const providers = configuredProviders.map((provider) => providerOption(provider))
    const validationErrors = [
      ...validateAutomationGraph(graph),
      ...await validateAutomationResources(automation.siteId, graph, configuredProviders),
    ]
    return {
      data: {
        automation: { ...automationRowToListItem(automation, graph), graph },
        runs: runRows.map((run) => automationRunRowToItem(run, stepsByRun.get(run.id) ?? [])),
        templates,
        categories: categoryRows,
        providers,
        validationErrors,
      },
      error: null,
    }
  } catch (error) {
    console.error('getAutomationEditorData error:', error)
    return { data: null, error: friendlyError(error, 'Failed to load automation') }
  }
}

export async function createAutomation(input: { siteId: string; name: string }): Promise<{
  data: AutomationListItem | null
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }
    await requireSiteOwnership(input.siteId)
    const name = normalizeName(input.name)
    const graph = createInitialAutomationGraph()
    const [row] = await db.insert(siteAutomations).values({ siteId: input.siteId, name, graph }).returning()
    revalidateAutomationPaths(row.id)
    return { data: automationRowToListItem(row, graph), error: null }
  } catch (error) {
    console.error('createAutomation error:', error)
    return { data: null, error: friendlyError(error, 'Failed to create automation') }
  }
}

export async function saveAutomation(input: {
  automationId: string
  name: string
  graph: unknown
}): Promise<{
  data: (AutomationListItem & { graph: AutomationGraph }) | null
  validationErrors: AutomationValidationError[]
  error: string | null
}> {
  try {
    const automation = await requireOwnedAutomation(input.automationId)
    if (!automation) return { data: null, validationErrors: [], error: 'Automation not found' }
    const graph = parseAutomationGraph(input.graph)
    const configured = await getConfiguredAIProviders(automation.siteId)
    const validationErrors: AutomationValidationError[] = [
      ...validateAutomationGraph(graph),
      ...await validateAutomationResources(automation.siteId, graph, configured),
    ]
    const schedule = timeSchedule(graph)
    if (automation.status === 'active' && schedule && !getNextAutomationRunAt(schedule)) {
      validationErrors.push({ code: 'schedule-not-future', message: 'The active schedule needs a future run time.', nodeId: timeNodeId(graph) })
    }
    const nextStatus: AutomationStatus = validationErrors.length && automation.status === 'active' ? 'draft' : automation.status as AutomationStatus
    const nextRunAt = nextStatus === 'active' && schedule ? getNextAutomationRunAt(schedule) : null
    const [row] = await db
      .update(siteAutomations)
      .set({ name: normalizeName(input.name), graph, status: nextStatus, nextRunAt, updatedAt: new Date() })
      .where(eq(siteAutomations.id, automation.id))
      .returning()
    revalidateAutomationPaths(row.id)
    return { data: { ...automationRowToListItem(row, graph), graph }, validationErrors, error: null }
  } catch (error) {
    console.error('saveAutomation error:', error)
    return { data: null, validationErrors: [], error: friendlyError(error, 'Failed to save automation') }
  }
}

export async function setAutomationStatus(
  automationId: string,
  status: 'active' | 'paused'
): Promise<{ data: AutomationListItem | null; validationErrors: AutomationValidationError[]; error: string | null }> {
  try {
    if (status !== 'active' && status !== 'paused') {
      return { data: null, validationErrors: [], error: 'Invalid automation status' }
    }
    const automation = await requireOwnedAutomation(automationId)
    if (!automation) return { data: null, validationErrors: [], error: 'Automation not found' }
    const graph = parseAutomationGraph(automation.graph)
    const configured = await getConfiguredAIProviders(automation.siteId)
    const validationErrors: AutomationValidationError[] = status === 'active'
      ? [...validateAutomationGraph(graph), ...await validateAutomationResources(automation.siteId, graph, configured)]
      : []
    const schedule = timeSchedule(graph)
    const nextRunAt = status === 'active' && schedule ? getNextAutomationRunAt(schedule) : null
    if (status === 'active' && schedule && !nextRunAt) {
      validationErrors.push({ code: 'schedule-not-future', message: 'The schedule needs a future run time.', nodeId: timeNodeId(graph) })
    }
    if (validationErrors.length) return { data: null, validationErrors, error: 'Fix the automation before activating it.' }
    const [row] = await db
      .update(siteAutomations)
      .set({ status, nextRunAt, updatedAt: new Date() })
      .where(eq(siteAutomations.id, automation.id))
      .returning()
    revalidateAutomationPaths(row.id)
    return { data: automationRowToListItem(row, graph), validationErrors: [], error: null }
  } catch (error) {
    console.error('setAutomationStatus error:', error)
    return { data: null, validationErrors: [], error: friendlyError(error, 'Failed to update automation') }
  }
}

export async function duplicateAutomation(automationId: string): Promise<{ data: AutomationListItem | null; error: string | null }> {
  try {
    const source = await requireOwnedAutomation(automationId)
    if (!source) return { data: null, error: 'Automation not found' }
    const graph = parseAutomationGraph(source.graph)
    const [row] = await db.insert(siteAutomations).values({
      siteId: source.siteId,
      name: `${source.name.slice(0, 246).trimEnd()} copy`,
      status: 'draft',
      graph,
    }).returning()
    revalidateAutomationPaths(row.id)
    return { data: automationRowToListItem(row, graph), error: null }
  } catch (error) {
    console.error('duplicateAutomation error:', error)
    return { data: null, error: 'Failed to duplicate automation' }
  }
}

export async function deleteAutomations(automationIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    const ids = [...new Set(automationIds)]
    if (!ids.length || ids.length > 100 || ids.some((id) => !UUID_REGEX.test(id))) return { success: false, error: 'Invalid automation IDs' }
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }
    const error = await db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: siteAutomations.id, lockToken: siteAutomations.lockToken })
        .from(siteAutomations)
        .innerJoin(sites, and(eq(sites.id, siteAutomations.siteId), eq(sites.userId, user.id)))
        .where(inArray(siteAutomations.id, ids))
        .orderBy(siteAutomations.id)
        .for('update')
      if (owned.length !== ids.length) return 'Access denied'
      if (owned.some((row) => row.lockToken)) return 'A running automation cannot be deleted'
      await tx.delete(siteAutomations).where(inArray(siteAutomations.id, ids))
      return null
    })
    if (error) return { success: false, error }
    revalidateAutomationPaths()
    return { success: true, error: null }
  } catch (error) {
    console.error('deleteAutomations error:', error)
    return { success: false, error: 'Failed to delete automation' }
  }
}

export async function runAutomationNow(automationId: string): Promise<{ data: AutomationRunItem | null; error: string | null }> {
  try {
    const automation = await requireOwnedAutomation(automationId)
    if (!automation) return { data: null, error: 'Automation not found' }
    const graph = parseAutomationGraph(automation.graph)
    const configured = await getConfiguredAIProviders(automation.siteId)
    const validationErrors = [...validateAutomationGraph(graph), ...await validateAutomationResources(automation.siteId, graph, configured)]
    if (validationErrors.length) return { data: null, error: validationErrors[0].message }
    const run = await executeAutomation(automation.id, 'manual')
    const steps = await db.select().from(siteAutomationRunSteps)
      .where(eq(siteAutomationRunSteps.runId, run.id))
      .orderBy(asc(siteAutomationRunSteps.startedAt), asc(siteAutomationRunSteps.nodeName))
    revalidateAutomationPaths(automation.id)
    return { data: automationRunRowToItem(run, steps), error: null }
  } catch (error) {
    console.error('runAutomationNow error:', error)
    return { data: null, error: friendlyError(error, 'Failed to run automation') }
  }
}

async function requireOwnedAutomation(automationId: string) {
  if (!UUID_REGEX.test(automationId)) return null
  const user = await getAuthenticatedUser()
  if (!user) throw new Error('Authentication required')
  const [row] = await db
    .select({ automation: siteAutomations })
    .from(siteAutomations)
    .innerJoin(sites, and(eq(sites.id, siteAutomations.siteId), eq(sites.userId, user.id)))
    .where(eq(siteAutomations.id, automationId))
    .limit(1)
  return row?.automation ?? null
}

async function validateAutomationResources(
  siteId: string,
  graph: AutomationGraph,
  configuredProviders: AIProvider[]
) {
  const errors: AutomationValidationError[] = []
  const templateIds = [...new Set(graph.nodes.filter((node) => node.kind === 'post').map((node) => node.config.templateId).filter(Boolean))]
  const categoryIds = [...new Set(graph.nodes.filter((node) => node.kind === 'post').flatMap((node) => node.config.categoryIds))]
  const [templateRows, categoryRows] = await Promise.all([
    templateIds.length
      ? db.select({ id: postTemplates.id }).from(postTemplates).where(and(eq(postTemplates.siteId, siteId), inArray(postTemplates.id, templateIds)))
      : [],
    categoryIds.length
      ? db.select({ id: categories.id }).from(categories).where(and(eq(categories.siteId, siteId), eq(categories.isPublished, true), inArray(categories.id, categoryIds)))
      : [],
  ])
  const validTemplates = new Set(templateRows.map((row) => row.id))
  const validCategories = new Set(categoryRows.map((row) => row.id))
  for (const node of graph.nodes) {
    if (node.kind === 'post' && node.config.templateId && !validTemplates.has(node.config.templateId)) {
      errors.push({ code: 'post-template-missing', message: 'The selected Post template is unavailable.', nodeId: node.id })
    }
    if (node.kind === 'post' && node.config.categoryIds.some((id) => !validCategories.has(id))) {
      errors.push({ code: 'post-category-missing', message: 'One or more selected Post categories are unavailable.', nodeId: node.id })
    }
    if ((node.kind === 'agent' || node.kind === 'router') && !configuredProviders.includes(node.config.provider)) {
      errors.push({
        code: 'provider-missing',
        message: `${AI_PROVIDER_LABELS[node.config.provider]} is not configured for this site.`,
        nodeId: node.id,
      })
    }
  }
  return errors
}

function automationWhere(siteId: string, options?: ListOptions) {
  const conditions = [eq(siteAutomations.siteId, siteId)]
  const search = options?.search?.trim().slice(0, 200)
  if (search) conditions.push(ilike(siteAutomations.name, `%${search}%`))
  if (options?.status && options.status !== 'all') conditions.push(eq(siteAutomations.status, options.status))
  return and(...conditions)
}

function automationOrder(options?: ListOptions) {
  const direction = options?.sortDirection === 'asc' ? asc : desc
  if (options?.sortColumn === 'name') return [direction(siteAutomations.name)]
  if (options?.sortColumn === 'status') return [direction(siteAutomations.status), asc(siteAutomations.name)]
  if (options?.sortColumn === 'lastRun') return [direction(siteAutomations.lastRunAt), asc(siteAutomations.name)]
  if (options?.sortColumn === 'nextRun') return [direction(siteAutomations.nextRunAt), asc(siteAutomations.name)]
  return [direction(siteAutomations.updatedAt)]
}

function timeSchedule(graph: AutomationGraph) {
  const node = graph.nodes.find((candidate) => candidate.kind === 'time')
  return node?.kind === 'time' ? node.config.schedule : null
}

function timeNodeId(graph: AutomationGraph) {
  return graph.nodes.find((node) => node.kind === 'time')?.id
}

function providerOption(provider: AIProvider) {
  return { provider, label: AI_PROVIDER_LABELS[provider], defaultModel: AI_PROVIDER_DEFAULT_MODELS[provider] }
}

function normalizeName(value: string) {
  const name = value.trim()
  if (!name) throw new Error('Automation name is required')
  if (name.length > 255) throw new Error('Automation name is too long')
  return name
}

function friendlyError(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) return fallback
  return /^(?:Automation|Time node|Scraper|AI Router|AI Agent|Post|Connection)(?: |$)|^Authentication required$/.test(error.message)
    ? error.message
    : fallback
}

function revalidateAutomationPaths(automationId?: string) {
  revalidatePath('/admin/automations')
  if (automationId) revalidatePath(`/admin/automations/${automationId}`)
}
