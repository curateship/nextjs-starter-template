import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  scraperExecutions,
  scraperProviderSettings,
  scraperResults,
  scraperRuns,
  type CoreScraperExecution,
  type CoreScraperRun,
} from "@/server/schema"
import { findCurrentUser, now, uuid } from "@/server/security"
import {
  getOrCreateCurrentWorkspace,
  listUserWorkspaces,
} from "@/server/workspaces"
import { decryptScraperSecret, encryptScraperSecret } from "@/scrapers/secrets"
import {
  getDatasetItems,
  getRun,
  mapApifyStatus,
  normalizeResult,
  startActor,
} from "@/scrapers/google-maps/adapter"
import {
  apifyProviderKey,
  cleanRunInput,
  defaultApifyActorId,
  defaultMaxResults,
  executionIdSchema,
  googleMapsScraperKey,
  parseConfig,
  parseRunInput,
  runIdSchema,
  runPayloadSchema,
  serializeExecution,
  serializeResult,
  serializeRun,
  serializeSettings,
  settingsPayloadSchema,
  updateRunSchema,
} from "@/scrapers/google-maps/schema"
import type {
  ScraperExecutionItem,
  ScraperResultItem,
  ScraperRunItem,
} from "@/scrapers/types"

type ScraperSettingsItem = ReturnType<typeof serializeSettings>
type ScraperSettingsResponse = { settings: ScraperSettingsItem }
type GoogleMapsRunsResponse = ScraperSettingsResponse & {
  runs: ScraperRunItem[]
}
type GoogleMapsRunResponse = {
  run: ScraperRunItem
  latest_execution: ScraperExecutionItem | null
  results: ScraperResultItem[]
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

export function scraperError(error: unknown) {
  return error instanceof Error ? error.message : "Scraper request failed."
}

const loadSettingsFn = createServerFn({ method: "GET" }).handler(async (): Promise<ScraperSettingsResponse> => {
  const workspace = await findWorkspace()
  if (!workspace) return { settings: serializeSettings(null) }
  return { settings: serializeSettings(await settingsRow(workspace.id)) }
})

const saveSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(settingsPayloadSchema)
  .handler(async ({ data }): Promise<ScraperSettingsResponse> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const existing = await settingsRow(workspace.id)
    const updatedAt = now()
    const token = data.token?.trim()
    const values = {
      config: { actorId: data.actorId.trim(), defaultMaxResults: data.defaultMaxResults },
      secretEncrypted: token ? encryptScraperSecret(token) : existing?.secretEncrypted ?? null,
      updatedAt,
    }

    const [row] = existing
      ? await db.update(scraperProviderSettings).set(values).where(and(eq(scraperProviderSettings.workspaceId, workspace.id), eq(scraperProviderSettings.providerKey, apifyProviderKey))).returning()
      : await db.insert(scraperProviderSettings).values({ workspaceId: workspace.id, providerKey: apifyProviderKey, createdAt: updatedAt, ...values }).returning()

    return { settings: serializeSettings(row) }
  })

const loadRunsFn = createServerFn({ method: "GET" }).handler(async (): Promise<GoogleMapsRunsResponse> => {
  const workspace = await findWorkspace()
  if (!workspace) {
    return { settings: serializeSettings(null), runs: [] }
  }
  const runs = await db.select().from(scraperRuns).where(and(eq(scraperRuns.workspaceId, workspace.id), eq(scraperRuns.scraperKey, googleMapsScraperKey))).orderBy(desc(scraperRuns.createdAt))
  return { settings: serializeSettings(await settingsRow(workspace.id)), runs: runs.map(serializeRun) }
})

const saveRunFn = createServerFn({ method: "POST" })
  .inputValidator(updateRunSchema.partial({ runId: true }))
  .handler(async ({ data }): Promise<{ run: ScraperRunItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const updatedAt = now()
    const values = {
      name: data.name.trim(),
      status: data.status,
      input: cleanRunInput(data),
      metadata: {},
      updatedAt,
    }

    const [row] = data.runId
      ? await db.update(scraperRuns).set(values).where(and(eq(scraperRuns.id, data.runId), eq(scraperRuns.workspaceId, workspace.id), eq(scraperRuns.scraperKey, googleMapsScraperKey))).returning()
      : await db.insert(scraperRuns).values({ id: uuid(), workspaceId: workspace.id, scraperKey: googleMapsScraperKey, createdAt: updatedAt, ...values }).returning()

    if (!row) throw new Error("Run not found.")
    return { run: serializeRun(row) }
  })

const deleteRunsFn = createServerFn({ method: "POST" })
  .inputValidator(runIdsSchema)
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const deleted = await db.delete(scraperRuns).where(and(eq(scraperRuns.workspaceId, workspace.id), eq(scraperRuns.scraperKey, googleMapsScraperKey), inArray(scraperRuns.id, data.runIds))).returning({ id: scraperRuns.id })
    return { deleted: deleted.length }
  })

const startRunFn = createServerFn({ method: "POST" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<{ execution: ScraperExecutionItem }> => {
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
    const [execution] = await db.insert(scraperExecutions).values({
      id: uuid(),
      runId: run.id,
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
  .handler(async ({ data }): Promise<{ execution: ScraperExecutionItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const [row] = await db
      .select({ execution: scraperExecutions })
      .from(scraperExecutions)
      .innerJoin(scraperRuns, eq(scraperExecutions.runId, scraperRuns.id))
      .where(and(eq(scraperExecutions.id, data.executionId), eq(scraperRuns.workspaceId, workspace.id), eq(scraperRuns.scraperKey, googleMapsScraperKey)))
      .limit(1)
    const execution = row?.execution
    if (!execution?.providerRunId) throw new Error("Execution not found.")

    const run = await getGoogleMapsRun(execution.runId, workspace.id)
    const token = requiredToken((await requiredSettings(workspace.id)).secretEncrypted)
    const actorRun = await getRun(token, execution.providerRunId)
    const status = mapApifyStatus(actorRun.status)
    const [updated] = await db.update(scraperExecutions).set({
      providerDatasetId: actorRun.defaultDatasetId ?? execution.providerDatasetId,
      status,
      message: actorRun.statusMessage ?? null,
      error: status === "failed" ? actorRun.statusMessage ?? "Apify run failed." : null,
      startedAt: date(actorRun.startedAt) ?? execution.startedAt,
      finishedAt: date(actorRun.finishedAt),
      updatedAt: now(),
    }).where(eq(scraperExecutions.id, execution.id)).returning()

    return { execution: serializeExecution(await importIfReady(updated, run, token)) }
  })

const loadRunFn = createServerFn({ method: "GET" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<GoogleMapsRunResponse> => {
    const workspace = await findWorkspace()
    if (!workspace) throw new Error("Run not found.")
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const executions = await db.select().from(scraperExecutions).where(eq(scraperExecutions.runId, run.id)).orderBy(desc(scraperExecutions.createdAt)).limit(1)
    const latest = executions[0] ?? null
    const results = latest
      ? await db.select().from(scraperResults).where(eq(scraperResults.executionId, latest.id))
      : []

    return {
      run: serializeRun(run),
      latest_execution: latest ? serializeExecution(latest) : null,
      results: results.map(serializeResult),
    }
  })

const updateResultFn = createServerFn({ method: "POST" })
  .inputValidator(resultPayloadSchema)
  .handler(async ({ data }): Promise<{ result: ScraperResultItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const [result] = await db.select().from(scraperResults).where(and(eq(scraperResults.id, data.resultId), eq(scraperResults.runId, run.id))).limit(1)
    if (!result) throw new Error("Result not found.")

    const title = data.title.trim()
    const [updated] = await db.update(scraperResults).set({
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
    }).where(eq(scraperResults.id, result.id)).returning()

    return { result: serializeResult(updated) }
  })

const deleteResultsFn = createServerFn({ method: "POST" })
  .inputValidator(resultIdsSchema)
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const deleted = await db.delete(scraperResults).where(and(eq(scraperResults.runId, run.id), inArray(scraperResults.id, data.resultIds))).returning({ id: scraperResults.id })
    return { deleted: deleted.length }
  })

export const loadScraperSettings = () => loadSettingsFn()
export const saveScraperSettings = (data: z.infer<typeof settingsPayloadSchema>) => saveSettingsFn({ data })
export const loadGoogleMapsRuns = () => loadRunsFn()
export const saveGoogleMapsRun = (data: z.infer<typeof runPayloadSchema> & { runId?: string }) => saveRunFn({ data })
export const deleteGoogleMapsRuns = (runIds: string[]) => deleteRunsFn({ data: { runIds } })
export const startGoogleMapsRun = (runId: string) => startRunFn({ data: { runId } })
export const refreshGoogleMapsExecution = (executionId: string) => refreshExecutionFn({ data: { executionId } })
export const loadGoogleMapsRun = (runId: string) => loadRunFn({ data: { runId } })
export const updateGoogleMapsResult = (data: z.infer<typeof resultPayloadSchema>) => updateResultFn({ data })
export const deleteGoogleMapsResults = (runId: string, resultIds: string[]) => deleteResultsFn({ data: { runId, resultIds } })

async function settingsRow(workspaceId: string) {
  const [row] = await db.select().from(scraperProviderSettings).where(and(eq(scraperProviderSettings.workspaceId, workspaceId), eq(scraperProviderSettings.providerKey, apifyProviderKey))).limit(1)
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
  if (!encrypted) throw new Error("Add an Apify API token in scraper settings first.")
  return decryptScraperSecret(encrypted)
}

async function getGoogleMapsRun(runId: string, workspaceId: string) {
  const [run] = await db.select().from(scraperRuns).where(and(eq(scraperRuns.id, runId), eq(scraperRuns.workspaceId, workspaceId), eq(scraperRuns.scraperKey, googleMapsScraperKey))).limit(1)
  if (!run) throw new Error("Run not found.")
  return run
}

async function importIfReady(execution: CoreScraperExecution, run: CoreScraperRun, token: string) {
  if (execution.status !== "succeeded" || !execution.providerDatasetId) return execution

  const items = await getDatasetItems(token, execution.providerDatasetId, parseRunInput(run.input).maxResults)
  const createdAt = now()
  const rows = items.map((item) => ({
    id: uuid(),
    runId: run.id,
    executionId: execution.id,
    createdAt,
    ...normalizeResult(item),
  }))

  return db.transaction(async (tx) => {
    await tx.delete(scraperResults).where(eq(scraperResults.executionId, execution.id))
    if (rows.length) await tx.insert(scraperResults).values(rows)
    const [updated] = await tx.update(scraperExecutions).set({
      stats: { importedResults: rows.length },
      updatedAt: now(),
    }).where(eq(scraperExecutions.id, execution.id)).returning()
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
