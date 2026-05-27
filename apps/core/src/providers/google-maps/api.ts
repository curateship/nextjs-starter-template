import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  providerExecutions,
  providerSettings,
  providerResults,
  providerRunConfigs,
  publicDirectories,
  type CoreProviderExecution,
  type CoreProviderRunConfig,
} from "@/server/schema"
import { createPublicDirectoryDraftValues } from "@/server/public-directories"
import { findCurrentUser, now, uuid } from "@/server/security"
import {
  getOrCreateCurrentWorkspace,
  listUserWorkspaces,
} from "@/server/workspaces"
import { decryptProviderSecret, encryptProviderSecret } from "@/providers/secrets"
import {
  getDatasetItems,
  getRun,
  mapApifyStatus,
  normalizeResult,
  startActor,
} from "@/providers/google-maps/adapter"
import {
  apifyProviderKey,
  cleanRunInput,
  defaultApifyActorId,
  defaultMaxResults,
  executionIdSchema,
  googleMapsProviderKey,
  parseConfig,
  parseRunInput,
  runIdSchema,
  runPayloadSchema,
  serializeExecution,
  serializeResult,
  serializeResultWithPublicStatus,
  serializeRun,
  serializeSettings,
  settingsPayloadSchema,
  updateRunSchema,
} from "@/providers/google-maps/schema"
import type {
  ProviderExecutionItem,
  ProviderResultItem,
  ProviderRunConfigItem,
} from "@/providers/types"

type ProviderSettingsItem = ReturnType<typeof serializeSettings>
type ProviderSettingsResponse = { settings: ProviderSettingsItem }
type GoogleMapsRunsResponse = ProviderSettingsResponse & {
  runs: ProviderRunConfigItem[]
}
type GoogleMapsRunResponse = {
  run: ProviderRunConfigItem
  latest_execution: ProviderExecutionItem | null
  results: ProviderResultItem[]
}
const resultIdsSchema = z.object({
  runId: z.string().min(1),
  resultIds: z.array(z.string().min(1)).min(1),
})
const runIdsSchema = z.object({
  runIds: z.array(z.string().min(1)).min(1),
})
const resultPayloadSchema = z.object({
  runId: z.string().min(1),
  resultId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  category: z.string().trim().max(500).optional(),
  categoryName: z.string().trim().max(255).optional(),
  address: z.string().trim().max(1000).optional(),
  street: z.string().trim().max(500).optional(),
  city: z.string().trim().max(255).optional(),
  state: z.string().trim().max(255).optional(),
  countryCode: z.string().trim().max(20).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).nullable().optional(),
  phone: z.string().trim().max(100).optional(),
  website: z.string().trim().max(1000).optional(),
})
const resultPublicStatusSchema = z.object({
  runId: z.string().min(1),
  resultId: z.string().min(1),
  status: z.enum(["draft", "published"]),
})

export function providerError(error: unknown) {
  return error instanceof Error ? error.message : "Provider request failed."
}

const loadSettingsFn = createServerFn({ method: "GET" }).handler(async (): Promise<ProviderSettingsResponse> => {
  const workspace = await findWorkspace()
  if (!workspace) return { settings: serializeSettings(null) }
  return { settings: serializeSettings(await settingsRow(workspace.id)) }
})

const saveSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(settingsPayloadSchema)
  .handler(async ({ data }): Promise<ProviderSettingsResponse> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const existing = await settingsRow(workspace.id)
    const updatedAt = now()
    const token = data.token?.trim()
    const values = {
      config: { actorId: data.actorId.trim(), defaultMaxResults: data.defaultMaxResults },
      secretEncrypted: token ? encryptProviderSecret(token) : existing?.secretEncrypted ?? null,
      updatedAt,
    }

    const [row] = existing
      ? await db.update(providerSettings).set(values).where(and(eq(providerSettings.workspaceId, workspace.id), eq(providerSettings.providerKey, apifyProviderKey))).returning()
      : await db.insert(providerSettings).values({ workspaceId: workspace.id, providerKey: apifyProviderKey, createdAt: updatedAt, ...values }).returning()

    return { settings: serializeSettings(row) }
  })

const loadRunsFn = createServerFn({ method: "GET" }).handler(async (): Promise<GoogleMapsRunsResponse> => {
  const workspace = await findWorkspace()
  if (!workspace) {
    return { settings: serializeSettings(null), runs: [] }
  }
  const runs = await db.select().from(providerRunConfigs).where(and(eq(providerRunConfigs.workspaceId, workspace.id), eq(providerRunConfigs.providerKey, googleMapsProviderKey))).orderBy(desc(providerRunConfigs.createdAt))
  const amountByRun = await resultCountsByRun(runs.map((run) => run.id))
  return { settings: serializeSettings(await settingsRow(workspace.id)), runs: runs.map((run) => ({ ...serializeRun(run), amount: amountByRun.get(run.id) ?? 0 })) }
})

const saveRunFn = createServerFn({ method: "POST" })
  .inputValidator(updateRunSchema.partial({ runId: true }))
  .handler(async ({ data }): Promise<{ run: ProviderRunConfigItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const updatedAt = now()
    const values = {
      name: data.name.trim() || data.keyword.trim(),
      status: data.status,
      input: cleanRunInput(data),
      metadata: {},
      updatedAt,
    }

    const [row] = data.runId
      ? await db.update(providerRunConfigs).set(values).where(and(eq(providerRunConfigs.id, data.runId), eq(providerRunConfigs.workspaceId, workspace.id), eq(providerRunConfigs.providerKey, googleMapsProviderKey))).returning()
      : await db.insert(providerRunConfigs).values({ id: uuid(), workspaceId: workspace.id, providerKey: googleMapsProviderKey, createdAt: updatedAt, ...values }).returning()

    if (!row) throw new Error("Run not found.")
    return { run: { ...serializeRun(row), amount: await resultCount(row.id) } }
  })

const deleteRunsFn = createServerFn({ method: "POST" })
  .inputValidator(runIdsSchema)
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const deleted = await db.delete(providerRunConfigs).where(and(eq(providerRunConfigs.workspaceId, workspace.id), eq(providerRunConfigs.providerKey, googleMapsProviderKey), inArray(providerRunConfigs.id, data.runIds))).returning({ id: providerRunConfigs.id })
    return { deleted: deleted.length }
  })

const startRunFn = createServerFn({ method: "POST" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<{ execution: ProviderExecutionItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    if (run.status !== "active") throw new Error("Only active runs can be started.")

    const settings = await requiredSettings(workspace.id)
    const token = requiredToken(settings.secretEncrypted)
    const actorRun = await startActor({
      token,
      actorId: settings.config.actorId,
      input: parseRunInput(run.input),
    })
    const createdAt = now()
    const [execution] = await db.insert(providerExecutions).values({
      id: uuid(),
      runConfigId: run.id,
      providerKey: apifyProviderKey,
      providerRunId: actorRun.id,
      providerDatasetId: actorRun.defaultDatasetId ?? null,
      status: mapApifyStatus(actorRun.status),
      message: actorRun.statusMessage ?? null,
      error: null,
      stats: {},
      startedAt: date(actorRun.startedAt) ?? createdAt,
      finishedAt: date(actorRun.finishedAt),
      createdAt,
      updatedAt: createdAt,
    }).returning()

    return { execution: serializeExecution(await importIfReady(execution, run, token)) }
  })

const refreshExecutionFn = createServerFn({ method: "POST" })
  .inputValidator(executionIdSchema)
  .handler(async ({ data }): Promise<{ execution: ProviderExecutionItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const [row] = await db
      .select({ execution: providerExecutions })
      .from(providerExecutions)
      .innerJoin(providerRunConfigs, eq(providerExecutions.runConfigId, providerRunConfigs.id))
      .where(and(eq(providerExecutions.id, data.executionId), eq(providerRunConfigs.workspaceId, workspace.id), eq(providerRunConfigs.providerKey, googleMapsProviderKey)))
      .limit(1)
    const execution = row?.execution
    if (!execution?.providerRunId) throw new Error("Execution not found.")

    const run = await getGoogleMapsRun(execution.runConfigId, workspace.id)
    const token = requiredToken((await requiredSettings(workspace.id)).secretEncrypted)
    const actorRun = await getRun(token, execution.providerRunId)
    const status = mapApifyStatus(actorRun.status)
    const [updated] = await db.update(providerExecutions).set({
      providerDatasetId: actorRun.defaultDatasetId ?? execution.providerDatasetId,
      status,
      message: actorRun.statusMessage ?? null,
      error: status === "failed" ? actorRun.statusMessage ?? "Apify run failed." : null,
      startedAt: date(actorRun.startedAt) ?? execution.startedAt,
      finishedAt: date(actorRun.finishedAt),
      updatedAt: now(),
    }).where(eq(providerExecutions.id, execution.id)).returning()

    return { execution: serializeExecution(await importIfReady(updated, run, token)) }
  })

const loadRunFn = createServerFn({ method: "GET" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<GoogleMapsRunResponse> => {
    const workspace = await findWorkspace()
    if (!workspace) throw new Error("Run not found.")
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const executions = await db.select().from(providerExecutions).where(eq(providerExecutions.runConfigId, run.id)).orderBy(desc(providerExecutions.createdAt)).limit(1)
    const latest = executions[0] ?? null
    const results = latest
      ? await db
          .select({
            result: providerResults,
            publicStatus: publicDirectories.status,
          })
          .from(providerResults)
          .leftJoin(publicDirectories, eq(publicDirectories.sourceResultId, providerResults.id))
          .where(eq(providerResults.executionId, latest.id))
      : []

    return {
      run: serializeRun(run),
      latest_execution: latest ? serializeExecution(latest) : null,
      results: results.map((row) => serializeResultWithPublicStatus(
        row.result,
        row.publicStatus as "draft" | "published" | null
      )),
    }
  })

const updateResultFn = createServerFn({ method: "POST" })
  .inputValidator(resultPayloadSchema)
  .handler(async ({ data }): Promise<{ result: ProviderResultItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const [result] = await db.select().from(providerResults).where(and(eq(providerResults.id, data.resultId), eq(providerResults.runConfigId, run.id))).limit(1)
    if (!result) throw new Error("Result not found.")

    const title = data.title.trim()
    const [updated] = await db.update(providerResults).set({
      title,
      data: {
        ...record(result.data),
        businessName: title,
        category: cleanOptional(data.category),
        categoryName: cleanOptional(data.categoryName),
        address: cleanOptional(data.address),
        street: cleanOptional(data.street),
        city: cleanOptional(data.city),
        state: cleanOptional(data.state),
        countryCode: cleanOptional(data.countryCode),
        rating: data.rating ?? null,
        reviewCount: data.reviewCount ?? null,
        phone: cleanOptional(data.phone),
        website: cleanUrl(data.website),
      },
    }).where(eq(providerResults.id, result.id)).returning()

    const updatedAt = now()
    const publicValues = createPublicDirectoryDraftValues({
      createdAt: updatedAt,
      externalId: updated.externalId,
      id: uuid(),
      sourceResultId: updated.id,
      title: updated.title,
      data: record(updated.data),
      workspaceId: run.workspaceId,
    })
    await db.update(publicDirectories).set({
      title: publicValues.title,
      metaDescription: publicValues.metaDescription,
      featuredImage: publicValues.featuredImage,
      publicData: publicValues.publicData,
      updatedAt,
    }).where(eq(publicDirectories.sourceResultId, updated.id))

    return { result: serializeResult(updated) }
  })

const deleteResultsFn = createServerFn({ method: "POST" })
  .inputValidator(resultIdsSchema)
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const ownedResults = await db
      .select({ id: providerResults.id })
      .from(providerResults)
      .where(and(eq(providerResults.runConfigId, run.id), inArray(providerResults.id, data.resultIds)))
    const ownedResultIds = ownedResults.map((result) => result.id)
    if (!ownedResultIds.length) return { deleted: 0 }

    const deleted = await db.transaction(async (tx) => {
      await tx.delete(publicDirectories).where(inArray(publicDirectories.sourceResultId, ownedResultIds))
      return tx.delete(providerResults).where(inArray(providerResults.id, ownedResultIds)).returning({ id: providerResults.id })
    })
    return { deleted: deleted.length }
  })

const updateResultPublicStatusFn = createServerFn({ method: "POST" })
  .inputValidator(resultPublicStatusSchema)
  .handler(async ({ data }): Promise<{ result: ProviderResultItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const [result] = await db.select().from(providerResults).where(and(eq(providerResults.id, data.resultId), eq(providerResults.runConfigId, run.id))).limit(1)
    if (!result) throw new Error("Result not found.")

    const updatedAt = now()
    const values = createPublicDirectoryDraftValues({
      createdAt: updatedAt,
      externalId: result.externalId,
      id: uuid(),
      sourceResultId: result.id,
      title: result.title,
      data: record(result.data),
      workspaceId: run.workspaceId,
    })

    const [existing] = await db.select({ id: publicDirectories.id })
      .from(publicDirectories)
      .where(eq(publicDirectories.sourceResultId, result.id))
      .limit(1)

    if (existing) {
      await db.update(publicDirectories).set({
        status: data.status,
        title: values.title,
        metaDescription: values.metaDescription,
        featuredImage: values.featuredImage,
        publicData: values.publicData,
        updatedAt,
      }).where(eq(publicDirectories.id, existing.id))
    } else {
      await db
        .insert(publicDirectories)
        .values({ ...values, status: data.status })
        .onConflictDoUpdate({
          target: [publicDirectories.workspaceId, publicDirectories.slug],
          set: {
            sourceResultId: sql`excluded.source_result_id`,
            status: data.status,
            title: sql`excluded.title`,
            metaDescription: sql`excluded.meta_description`,
            featuredImage: sql`excluded.featured_image`,
            publicData: sql`excluded.public_data`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
    }

    return { result: serializeResultWithPublicStatus(result, data.status) }
  })

export const loadProviderSettings = () => loadSettingsFn()
export const saveProviderSettings = (data: z.infer<typeof settingsPayloadSchema>) => saveSettingsFn({ data })
export const loadGoogleMapsRuns = () => loadRunsFn()
export const saveGoogleMapsRun = (data: z.infer<typeof runPayloadSchema> & { runId?: string }) => saveRunFn({ data })
export const deleteGoogleMapsRuns = (runIds: string[]) => deleteRunsFn({ data: { runIds } })
export const startGoogleMapsRun = (runId: string) => startRunFn({ data: { runId } })
export const refreshGoogleMapsExecution = (executionId: string) => refreshExecutionFn({ data: { executionId } })
export const loadGoogleMapsRun = (runId: string) => loadRunFn({ data: { runId } })
export const updateGoogleMapsResult = (data: z.infer<typeof resultPayloadSchema>) => updateResultFn({ data })
export const deleteGoogleMapsResults = (runId: string, resultIds: string[]) => deleteResultsFn({ data: { runId, resultIds } })
export const updateGoogleMapsResultPublicStatus = (data: z.infer<typeof resultPublicStatusSchema>) => updateResultPublicStatusFn({ data })

async function settingsRow(workspaceId: string) {
  const [row] = await db.select().from(providerSettings).where(and(eq(providerSettings.workspaceId, workspaceId), eq(providerSettings.providerKey, apifyProviderKey))).limit(1)
  return row ?? null
}

async function requiredSettings(workspaceId: string) {
  const row = await settingsRow(workspaceId)
  return {
    config: parseConfig(row?.config ?? { actorId: defaultApifyActorId, defaultMaxResults }),
    secretEncrypted: row?.secretEncrypted ?? null,
  }
}

function requiredToken(encrypted: string | null) {
  if (!encrypted) throw new Error("Add an Apify API token in provider settings first.")
  return decryptProviderSecret(encrypted)
}

async function getGoogleMapsRun(runId: string, workspaceId: string) {
  const [run] = await db.select().from(providerRunConfigs).where(and(eq(providerRunConfigs.id, runId), eq(providerRunConfigs.workspaceId, workspaceId), eq(providerRunConfigs.providerKey, googleMapsProviderKey))).limit(1)
  if (!run) throw new Error("Run not found.")
  return run
}

async function resultCountsByRun(runIds: string[]) {
  if (!runIds.length) return new Map<string, number>()
  const executions = await db.select().from(providerExecutions).where(inArray(providerExecutions.runConfigId, runIds)).orderBy(desc(providerExecutions.createdAt))
  const latestExecutions = new Map<string, CoreProviderExecution>()

  executions.forEach((execution) => {
    if (!latestExecutions.has(execution.runConfigId)) latestExecutions.set(execution.runConfigId, execution)
  })

  const executionRunIds = new Map(Array.from(latestExecutions.values()).map((execution) => [execution.id, execution.runConfigId]))
  const executionIds = Array.from(executionRunIds.keys())
  if (!executionIds.length) return new Map<string, number>()

  const rows = await db
    .select({
      executionId: providerResults.executionId,
      amount: sql<number>`count(*)::int`,
    })
    .from(providerResults)
    .where(inArray(providerResults.executionId, executionIds))
    .groupBy(providerResults.executionId)

  return new Map(rows.map((row) => [executionRunIds.get(row.executionId)!, row.amount]))
}

async function resultCount(runId: string) {
  return (await resultCountsByRun([runId])).get(runId) ?? 0
}

async function importIfReady(execution: CoreProviderExecution, run: CoreProviderRunConfig, token: string) {
  if (execution.status !== "succeeded" || !execution.providerDatasetId) return execution

  const items = await getDatasetItems(token, execution.providerDatasetId, parseRunInput(run.input).maxResults)
  const createdAt = now()
  const rows = items.map((item) => ({
    id: uuid(),
    runConfigId: run.id,
    executionId: execution.id,
    createdAt,
    ...normalizeResult(item),
  }))

  return db.transaction(async (tx) => {
    await tx.delete(providerResults).where(eq(providerResults.executionId, execution.id))
    if (rows.length) await tx.insert(providerResults).values(rows)
    if (rows.length) {
      await tx
        .insert(publicDirectories)
        .values(rows.map((row) => createPublicDirectoryDraftValues({
          createdAt,
          externalId: row.externalId,
          id: uuid(),
          sourceResultId: row.id,
          title: row.title,
          data: row.data,
          workspaceId: run.workspaceId,
        })))
        .onConflictDoUpdate({
          target: [publicDirectories.workspaceId, publicDirectories.slug],
          set: {
            sourceResultId: sql`excluded.source_result_id`,
            title: sql`excluded.title`,
            metaDescription: sql`excluded.meta_description`,
            featuredImage: sql`excluded.featured_image`,
            publicData: sql`excluded.public_data`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
    }
    const [updated] = await tx.update(providerExecutions).set({
      stats: { importedResults: rows.length },
      updatedAt: now(),
    }).where(eq(providerExecutions.id, execution.id)).returning()
    return updated
  })
}

function date(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim()
  return cleaned || null
}

function cleanUrl(value: string | undefined) {
  const cleaned = cleanOptional(value)
  if (!cleaned) return null
  try {
    const parsed = new URL(cleaned)
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

async function requireAdmin() {
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Core session.")
  if (user.role !== "admin") throw new Error("Not authorized.")
  return user
}

async function requireWorkspace() {
  const user = await requireAdmin()
  return getOrCreateCurrentWorkspace(user.id)
}

async function findWorkspace() {
  const user = await requireAdmin()
  const listed = await listUserWorkspaces(user.id)
  return listed.workspaces.find(({ id }) => id === listed.currentWorkspaceId) ?? null
}
