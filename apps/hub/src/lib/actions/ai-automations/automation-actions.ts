'use server'

import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  aiAgentAutomations,
  aiAgentAutomationReferences,
  aiAgentAutomationRuns,
  sites,
} from '@/lib/db/schema'
import { getAuthenticatedUser, requireSiteOwnership } from '@/lib/db/helpers'
import { getConfiguredAIProviders } from '@/lib/actions/integrations/config-helpers'
import {
  AI_PROVIDER_DEFAULT_MODELS,
  AI_PROVIDER_LABELS,
  isAIProvider,
  type AIProvider,
} from '@/lib/utils/ai-models'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import { deleteFromR2 } from '@/lib/utils/r2'
import {
  extractReferenceFile,
  extractReferenceUrl,
  type ExtractedReference,
} from './references'
import {
  getNextAiAutomationRunAt,
  normalizeAiAutomationRecurrence,
} from './schedule'
import { executeAiAutomation } from './execution'
import {
  countByAutomationId,
  rowToAutomation,
  rowToReference,
  rowToReferenceSummary,
  rowToRun,
} from './mappers'
import type {
  AiAgentAutomation,
  AiAgentAutomationReference,
  AiAgentAutomationRun,
  AiAutomationReferenceType,
  AiAutomationStatus,
  AiAutomationStatusCounts,
  AutomationSortColumn,
  AutomationStatusFilter,
} from './types'

interface SaveAutomationInput {
  siteId: string
  name: string
  prompt?: string
  provider?: AIProvider
  model?: string
  recurrence?: unknown
  status?: AiAutomationStatus
}

interface UpdateAutomationInput {
  name?: string
  prompt?: string
  provider?: AIProvider
  model?: string
  recurrence?: unknown
  status?: AiAutomationStatus
}

const MAX_AUTOMATION_PROMPT_CHARS = 12_000

interface ListAutomationsOptions {
  page?: number
  pageSize?: number
  search?: string
  status?: AutomationStatusFilter
  sortColumn?: AutomationSortColumn | null
  sortDirection?: 'asc' | 'desc'
}

export async function getConfiguredAIProvidersForSiteAction(siteId: string): Promise<{
  data: Array<{ provider: AIProvider; label: string; defaultModel: string }> | null
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }
    await requireSiteOwnership(siteId)
    const providers = await getConfiguredAIProviders(siteId)
    return {
      data: providers.map((provider) => ({
        provider,
        label: AI_PROVIDER_LABELS[provider],
        defaultModel: AI_PROVIDER_DEFAULT_MODELS[provider],
      })),
      error: null,
    }
  } catch {
    return { data: null, error: 'Failed to load AI providers' }
  }
}

export async function getAiAutomationsBySite(
  siteId: string,
  options?: ListAutomationsOptions
): Promise<{
  data: AiAgentAutomation[] | null
  total: number
  statusCounts: AiAutomationStatusCounts
  error: string | null
}> {
  const emptyCounts = getEmptyStatusCounts()
  try {
    if (!UUID_REGEX.test(siteId)) {
      return { data: null, total: 0, statusCounts: emptyCounts, error: 'Invalid site ID' }
    }
    await requireSiteOwnership(siteId)

    const { pageSize, offset } = normalizePagination(options)
    const where = getAutomationWhere(siteId, options)
    const [rows, countRows, statusRows] = await Promise.all([
      db
        .select()
        .from(aiAgentAutomations)
        .where(where)
        .orderBy(...getAutomationOrderBy(options))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiAgentAutomations)
        .where(where),
      db
        .select({
          status: aiAgentAutomations.status,
          count: sql<number>`count(*)::int`,
        })
        .from(aiAgentAutomations)
        .where(eq(aiAgentAutomations.siteId, siteId))
        .groupBy(aiAgentAutomations.status),
    ])

    const automations = rows.map(rowToAutomation)
    if (automations.length) {
      const ids = automations.map((automation) => automation.id)
      const [referenceRows, runRows] = await Promise.all([
        db
          .select({
            automationId: aiAgentAutomationReferences.automationId,
            count: sql<number>`count(*)::int`,
          })
          .from(aiAgentAutomationReferences)
          .where(inArray(aiAgentAutomationReferences.automationId, ids))
          .groupBy(aiAgentAutomationReferences.automationId),
        db
          .select({
            automationId: aiAgentAutomationRuns.automationId,
            count: sql<number>`count(*)::int`,
          })
          .from(aiAgentAutomationRuns)
          .where(inArray(aiAgentAutomationRuns.automationId, ids))
          .groupBy(aiAgentAutomationRuns.automationId),
      ])

      const referenceCounts = countByAutomationId(referenceRows)
      const runCounts = countByAutomationId(runRows)
      for (const automation of automations) {
        automation.references_count = referenceCounts[automation.id] || 0
        automation.runs_count = runCounts[automation.id] || 0
      }
    }

    return {
      data: automations,
      total: countRows[0]?.count ?? 0,
      statusCounts: rowsToStatusCounts(statusRows),
      error: null,
    }
  } catch (error) {
    console.error('getAiAutomationsBySite error:', error)
    return { data: null, total: 0, statusCounts: emptyCounts, error: 'Failed to load automations' }
  }
}

export async function getAiAutomationById(automationId: string): Promise<{
  data: AiAgentAutomation | null
  references: AiAgentAutomationReference[]
  runs: AiAgentAutomationRun[]
  error: string | null
}> {
  try {
    const automation = await getOwnedAutomation(automationId)
    if (!automation) return { data: null, references: [], runs: [], error: 'Automation not found' }

    const [references, runs] = await Promise.all([
      selectReferenceSummaries()
        .where(eq(aiAgentAutomationReferences.automationId, automation.id))
        .orderBy(asc(aiAgentAutomationReferences.createdAt)),
      db
        .select()
        .from(aiAgentAutomationRuns)
        .where(eq(aiAgentAutomationRuns.automationId, automation.id))
        .orderBy(desc(aiAgentAutomationRuns.startedAt))
        .limit(25),
    ])

    return {
      data: rowToAutomation(automation),
      references: references.map(rowToReferenceSummary),
      runs: runs.map(rowToRun),
      error: null,
    }
  } catch (error) {
    console.error('getAiAutomationById error:', error)
    return { data: null, references: [], runs: [], error: 'Failed to load automation' }
  }
}

export async function createAiAutomation(input: SaveAutomationInput): Promise<{ data: AiAgentAutomation | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }
    await requireSiteOwnership(input.siteId)

    const normalized = normalizeAutomationInput(input)
    const nextRunAt = normalized.status === 'active'
      ? getNextAiAutomationRunAt(normalized.recurrence)
      : null

    const [row] = await db
      .insert(aiAgentAutomations)
      .values({
        siteId: input.siteId,
        name: normalized.name,
        prompt: normalized.prompt,
        provider: normalized.provider,
        model: normalized.model,
        status: normalized.status,
        recurrence: normalized.recurrence,
        nextRunAt,
      })
      .returning()

    revalidateAutomationPaths()
    return { data: rowToAutomation(row), error: null }
  } catch (error) {
    console.error('createAiAutomation error:', error)
    return { data: null, error: 'Failed to create automation' }
  }
}

export async function updateAiAutomation(
  automationId: string,
  input: UpdateAutomationInput
): Promise<{ data: AiAgentAutomation | null; error: string | null }> {
  try {
    const existing = await getOwnedAutomation(automationId)
    if (!existing) return { data: null, error: 'Automation not found' }

    const current = rowToAutomation(existing)
    const normalized = normalizeAutomationInput({
      siteId: existing.siteId,
      name: input.name ?? current.name,
      prompt: input.prompt ?? current.prompt,
      provider: input.provider ?? current.provider,
      model: input.model ?? current.model,
      recurrence: input.recurrence ?? current.recurrence,
      status: input.status ?? current.status,
    })
    const nextRunAt = normalized.status === 'active'
      ? getNextAiAutomationRunAt(normalized.recurrence)
      : null

    const [row] = await db
      .update(aiAgentAutomations)
      .set({
        name: normalized.name,
        prompt: normalized.prompt,
        provider: normalized.provider,
        model: normalized.model,
        recurrence: normalized.recurrence,
        status: normalized.status,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(aiAgentAutomations.id, automationId))
      .returning()

    revalidateAutomationPaths(automationId)
    return { data: rowToAutomation(row), error: null }
  } catch (error) {
    console.error('updateAiAutomation error:', error)
    return { data: null, error: 'Failed to update automation' }
  }
}

export async function deleteAiAutomations(automationIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const ids = automationIds.filter((id) => UUID_REGEX.test(id))
    if (!ids.length) return { success: false, error: 'No valid automation IDs provided' }
    const ownedRows = await getOwnedAutomationIds(ids)
    if (ownedRows.length !== ids.length) return { success: false, error: 'Access denied' }

    const storagePaths = await getAutomationReferenceStoragePaths(ids)
    await db.delete(aiAgentAutomations).where(inArray(aiAgentAutomations.id, ids))
    await deleteReferenceFiles(storagePaths)
    revalidateAutomationPaths()
    return { success: true }
  } catch (error) {
    console.error('deleteAiAutomations error:', error)
    return { success: false, error: 'Failed to delete automation' }
  }
}

export async function addAiAutomationUrlReference(
  automationId: string,
  url: string
): Promise<{ data: AiAgentAutomationReference | null; error: string | null }> {
  try {
    const automation = await getOwnedAutomation(automationId)
    if (!automation) return { data: null, error: 'Automation not found' }
    const extracted = await extractReferenceUrl(url)
    const reference = await insertReference(automationId, 'url', extracted)
    revalidateAutomationPaths(automationId)
    return { data: reference, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to add URL reference' }
  }
}

export async function addAiAutomationFileReference(
  automationId: string,
  file: File
): Promise<{ data: AiAgentAutomationReference | null; error: string | null }> {
  try {
    const automation = await getOwnedAutomation(automationId)
    if (!automation) return { data: null, error: 'Automation not found' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const extracted = await extractReferenceFile(file, user.id)
    const reference = await insertReference(automationId, 'file', extracted)
    revalidateAutomationPaths(automationId)
    return { data: reference, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to add file reference' }
  }
}

export async function deleteAiAutomationReference(referenceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!UUID_REGEX.test(referenceId)) return { success: false, error: 'Invalid reference ID' }
    const [reference] = await db
      .select({
        id: aiAgentAutomationReferences.id,
        automationId: aiAgentAutomationReferences.automationId,
        storagePath: aiAgentAutomationReferences.storagePath,
      })
      .from(aiAgentAutomationReferences)
      .where(eq(aiAgentAutomationReferences.id, referenceId))
      .limit(1)

    if (!reference || !await getOwnedAutomation(reference.automationId)) return { success: false, error: 'Reference not found' }
    await db.delete(aiAgentAutomationReferences).where(eq(aiAgentAutomationReferences.id, referenceId))
    await deleteReferenceFiles(reference.storagePath ? [reference.storagePath] : [])
    revalidateAutomationPaths(reference.automationId)
    return { success: true }
  } catch (error) {
    console.error('deleteAiAutomationReference error:', error)
    return { success: false, error: 'Failed to delete reference' }
  }
}

export async function runAiAutomationNow(automationId: string): Promise<{ data: AiAgentAutomationRun | null; error: string | null }> {
  try {
    if (!await getOwnedAutomation(automationId)) return { data: null, error: 'Automation not found' }
    const run = await executeAiAutomation(automationId, 'manual')
    revalidateAutomationPaths(automationId)
    return { data: run, error: null }
  } catch (error) {
    console.error('runAiAutomationNow error:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Failed to run automation' }
  }
}

async function insertReference(automationId: string, referenceType: AiAutomationReferenceType, extracted: ExtractedReference) {
  const [row] = await db
    .insert(aiAgentAutomationReferences)
    .values({
      automationId,
      referenceType,
      label: extracted.label,
      sourceUrl: extracted.sourceUrl ?? null,
      storagePath: extracted.storagePath ?? null,
      mimeType: extracted.mimeType,
      fileSize: extracted.fileSize,
      extractedText: extracted.extractedText,
      metadata: extracted.metadata,
    })
    .returning()

  return rowToReference(row)
}

function selectReferenceSummaries() {
  return db
    .select({
      id: aiAgentAutomationReferences.id,
      automationId: aiAgentAutomationReferences.automationId,
      referenceType: aiAgentAutomationReferences.referenceType,
      label: aiAgentAutomationReferences.label,
      sourceUrl: aiAgentAutomationReferences.sourceUrl,
      storagePath: aiAgentAutomationReferences.storagePath,
      mimeType: aiAgentAutomationReferences.mimeType,
      fileSize: aiAgentAutomationReferences.fileSize,
      metadata: aiAgentAutomationReferences.metadata,
      createdAt: aiAgentAutomationReferences.createdAt,
      updatedAt: aiAgentAutomationReferences.updatedAt,
      extractedChars: sql<number>`char_length(${aiAgentAutomationReferences.extractedText})::int`,
    })
    .from(aiAgentAutomationReferences)
}

function getAutomationWhere(siteId: string, options?: ListAutomationsOptions) {
  const conditions = [eq(aiAgentAutomations.siteId, siteId)]
  if (isAutomationStatus(options?.status)) {
    conditions.push(eq(aiAgentAutomations.status, options.status))
  }

  const search = options?.search?.trim()
  if (search) {
    const pattern = `%${search.slice(0, 120)}%`
    conditions.push(or(
      ilike(aiAgentAutomations.name, pattern),
      ilike(aiAgentAutomations.prompt, pattern),
      ilike(aiAgentAutomations.provider, pattern),
      ilike(aiAgentAutomations.model, pattern),
      ilike(aiAgentAutomations.status, pattern),
    )!)
  }

  return and(...conditions)
}

function getAutomationOrderBy(options?: ListAutomationsOptions) {
  const order = options?.sortDirection === 'desc' ? desc : asc
  if (options?.sortColumn === 'name') return [order(aiAgentAutomations.name), desc(aiAgentAutomations.createdAt)]
  if (options?.sortColumn === 'provider') return [order(aiAgentAutomations.model), desc(aiAgentAutomations.createdAt)]
  if (options?.sortColumn === 'status') return [order(aiAgentAutomations.status), desc(aiAgentAutomations.createdAt)]
  if (options?.sortColumn === 'lastRun') return [order(aiAgentAutomations.lastRunAt), desc(aiAgentAutomations.createdAt)]
  if (options?.sortColumn === 'nextRun') return [order(aiAgentAutomations.nextRunAt), desc(aiAgentAutomations.createdAt)]
  return [desc(aiAgentAutomations.createdAt)]
}

function rowsToStatusCounts(rows: Array<{ status: string; count: number }>): AiAutomationStatusCounts {
  const counts = getEmptyStatusCounts()
  for (const row of rows) {
    if (isAutomationStatus(row.status)) counts[row.status] = row.count
    counts.all += row.count
  }
  return counts
}

function getEmptyStatusCounts(): AiAutomationStatusCounts {
  return { all: 0, active: 0, paused: 0, draft: 0 }
}

async function getOwnedAutomation(automationId: string) {
  if (!UUID_REGEX.test(automationId)) return null
  const user = await getAuthenticatedUser()
  if (!user) return null
  const [row] = await db
    .select({ automation: aiAgentAutomations })
    .from(aiAgentAutomations)
    .innerJoin(sites, eq(aiAgentAutomations.siteId, sites.id))
    .where(and(eq(aiAgentAutomations.id, automationId), eq(sites.userId, user.id)))
    .limit(1)
  return row?.automation ?? null
}

async function getOwnedAutomationIds(ids: string[]) {
  const user = await getAuthenticatedUser()
  if (!user) return []
  const rows = await db
    .select({ id: aiAgentAutomations.id })
    .from(aiAgentAutomations)
    .innerJoin(sites, eq(aiAgentAutomations.siteId, sites.id))
    .where(and(inArray(aiAgentAutomations.id, ids), eq(sites.userId, user.id)))
  return rows.map((row) => row.id)
}

async function getAutomationReferenceStoragePaths(automationIds: string[]) {
  const rows = await db
    .select({ storagePath: aiAgentAutomationReferences.storagePath })
    .from(aiAgentAutomationReferences)
    .where(inArray(aiAgentAutomationReferences.automationId, automationIds))

  return rows.flatMap((row) => row.storagePath ? [row.storagePath] : [])
}

async function deleteReferenceFiles(storagePaths: string[]) {
  for (const storagePath of storagePaths) {
    try {
      await deleteFromR2(storagePath)
    } catch (error) {
      console.error('AI automation reference file deletion failed:', error)
    }
  }
}

function normalizeAutomationInput(input: SaveAutomationInput) {
  const name = input.name.trim().slice(0, 255)
  if (!name) throw new Error('Automation name is required')
  const prompt = (input.prompt ?? '').trim().slice(0, MAX_AUTOMATION_PROMPT_CHARS)
  const provider = isAIProvider(input.provider) ? input.provider : 'openai'
  const model = normalizeModel(input.model, provider)
  const status = isAutomationStatus(input.status) ? input.status : 'draft'
  const recurrence = normalizeAiAutomationRecurrence(input.recurrence)

  return { name, prompt, provider, model, status, recurrence }
}

function normalizeModel(model: unknown, provider: AIProvider) {
  const value = typeof model === 'string' ? model.trim() : ''
  return value ? value.slice(0, 120) : AI_PROVIDER_DEFAULT_MODELS[provider]
}

function isAutomationStatus(status: unknown): status is AiAutomationStatus {
  return status === 'draft' || status === 'active' || status === 'paused'
}

function revalidateAutomationPaths(automationId?: string) {
  revalidatePath('/admin/automations')
  if (automationId) revalidatePath(`/admin/automations/${automationId}`)
}
