import { createHash } from "node:crypto"

import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import {
  createMediaFromBytes,
  serializeMedia,
  validateMediaFile,
} from "@/server/media"
import { requireAppOrigin } from "@/server/origin"
import {
  providerExecutions,
  providerSettings,
  providerResults,
  providerRunConfigs,
  type CoreProviderExecution,
  type CoreProviderRunConfig,
} from "@/server/schema"
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
const remoteImageMaxBytes = 10 * 1024 * 1024
const remoteImageTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
])
const googleImageHosts = [
  "googleusercontent.com",
  "googleapis.com",
  "gstatic.com",
]
const resultIdsSchema = z.object({
  runId: z.string().min(1),
  resultIds: z.array(z.string().min(1)).min(1),
})
const runIdsSchema = z.object({
  runIds: z.array(z.string().min(1)).min(1),
})
const simpleResultValueSchema = z.union([
  z.string().trim().max(4000),
  z.number(),
  z.boolean(),
  z.null(),
])
const resultPayloadSchema = z.object({
  runId: z.string().min(1),
  resultId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  data: z.record(z.string().min(1).max(100), simpleResultValueSchema),
})
const readOnlyResultFields = new Set([
  "raw",
  "mapsUrl",
  "placeId",
  "latitude",
  "longitude",
  "sourceImageUrl",
])

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

    return { execution: serializeExecution(await importIfReady(execution, run, token, workspace.userId)) }
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

    return { execution: serializeExecution(await importIfReady(updated, run, token, workspace.userId)) }
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
      ? await db.select().from(providerResults).where(eq(providerResults.executionId, latest.id))
      : []

    return {
      run: serializeRun(run),
      latest_execution: latest ? serializeExecution(latest) : null,
      results: results.map(serializeResult),
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
    const currentData = record(result.data)
    const [updated] = await db.update(providerResults).set({
      title,
      data: mergeResultData(currentData, data.data, title),
    }).where(eq(providerResults.id, result.id)).returning()

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

    const deleted = await db.delete(providerResults).where(inArray(providerResults.id, ownedResultIds)).returning({ id: providerResults.id })
    return { deleted: deleted.length }
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

async function importIfReady(execution: CoreProviderExecution, run: CoreProviderRunConfig, token: string, userId: string) {
  if (execution.status !== "succeeded" || !execution.providerDatasetId) return execution

  const items = await getDatasetItems(token, execution.providerDatasetId, parseRunInput(run.input).maxResults)
  const createdAt = now()
  const rows = []
  let importedImages = 0

  for (const item of items) {
    const normalized = normalizeResult(item)
    const imageResult = await saveResultImage(userId, normalized.title, record(normalized.data))
    if (imageResult.saved) importedImages += 1
    rows.push({
      id: uuid(),
      runConfigId: run.id,
      executionId: execution.id,
      createdAt,
      ...normalized,
      data: imageResult.data,
    })
  }

  return db.transaction(async (tx) => {
    await tx.delete(providerResults).where(eq(providerResults.executionId, execution.id))
    if (rows.length) await tx.insert(providerResults).values(rows)
    const [updated] = await tx.update(providerExecutions).set({
      stats: { importedResults: rows.length, importedImages },
      updatedAt: now(),
    }).where(eq(providerExecutions.id, execution.id)).returning()
    return updated
  })
}

async function saveResultImage(userId: string, title: string, data: Record<string, unknown>) {
  const sourceUrl = stringValue(data.sourceImageUrl)
  if (!sourceUrl) return { data, saved: false }

  try {
    const image = await downloadGoogleImage(sourceUrl)
    const extension = extensionForImageMimeType(image.mimeType)
    const hash = createHash("sha1").update(sourceUrl).digest("hex")
    const media = serializeMedia(await createMediaFromBytes({
      userId,
      originalName: `${title || "google-maps-image"}.${extension}`,
      altText: title,
      mimeType: image.mimeType,
      data: image.data,
      storagePath: `${userId}/imports/google-maps/${hash}.${extension}`,
      createdAt: now(),
    }))

    return {
      data: {
        ...data,
        featuredImage: media.url,
        featuredImageMediaId: media.id,
      },
      saved: true,
    }
  } catch {
    return { data, saved: false }
  }
}

async function downloadGoogleImage(sourceUrl: string) {
  const url = safeGoogleImageUrl(sourceUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
    })
    if (!response.ok) throw new Error("Image download failed.")

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
    if (!mimeType || !remoteImageTypes.has(mimeType)) {
      throw new Error("Unsupported image type.")
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0)
    if (contentLength > remoteImageMaxBytes) {
      throw new Error("Image file is too large.")
    }

    const data = await responseBytes(response)
    validateMediaFile(mimeType, data.byteLength)
    return { data, mimeType }
  } finally {
    clearTimeout(timeout)
  }
}

async function responseBytes(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(await response.arrayBuffer())

  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > remoteImageMaxBytes) {
      throw new Error("Image file is too large.")
    }
    chunks.push(value)
  }

  const data = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return data
}

function safeGoogleImageUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl)
  const hostname = parsed.hostname.toLowerCase()
  if (
    parsed.protocol !== "https:" ||
    !googleImageHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  ) {
    throw new Error("Unsupported image host.")
  }
  return parsed.toString()
}

function extensionForImageMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/gif") return "gif"
  if (mimeType === "image/webp") return "webp"
  return "jpg"
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

function mergeResultData(
  currentData: Record<string, unknown>,
  updates: Record<string, string | number | boolean | null>,
  title: string
) {
  const merged = { ...currentData, businessName: title }

  Object.entries(updates).forEach(([key, value]) => {
    if (!canUpdateResultField(key, currentData)) return
    merged[key] = key === "businessName" ? title : cleanResultValue(key, value)
  })

  return merged
}

function canUpdateResultField(key: string, currentData: Record<string, unknown>) {
  if (readOnlyResultFields.has(key)) return false
  if (key === "businessName") return true
  if (!Object.prototype.hasOwnProperty.call(currentData, key)) return false

  const value = currentData[key]
  return value === null || ["string", "number", "boolean"].includes(typeof value)
}

function cleanResultValue(key: string, value: string | number | boolean | null) {
  if (key === "website") return typeof value === "string" ? cleanUrl(value) : null
  if (typeof value === "string") return cleanOptional(value)
  return value
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
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
