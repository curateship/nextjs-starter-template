import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq } from "drizzle-orm"
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

export const loadScraperSettings = () => loadSettingsFn()
export const saveScraperSettings = (data: z.infer<typeof settingsPayloadSchema>) => saveSettingsFn({ data })
export const loadGoogleMapsRuns = () => loadRunsFn()
export const saveGoogleMapsRun = (data: z.infer<typeof runPayloadSchema> & { runId?: string }) => saveRunFn({ data })
export const startGoogleMapsRun = (runId: string) => startRunFn({ data: { runId } })
export const refreshGoogleMapsExecution = (executionId: string) => refreshExecutionFn({ data: { executionId } })
export const loadGoogleMapsRun = (runId: string) => loadRunFn({ data: { runId } })

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
