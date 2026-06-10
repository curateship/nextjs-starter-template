import { createHash } from "node:crypto"
import { lookup } from "node:dns/promises"
import { request as httpRequest, type IncomingHttpHeaders } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib"

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
  type CoreProviderResult,
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
  fieldSettingsPayloadSchema,
  googleMapsProviderKey,
  hubExportMappingsPayloadSchema,
  isGoogleMapsCanonicalFieldKey,
  mergeGoogleMapsFieldSettings,
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
  type GoogleMapsFieldSetting,
  type GoogleMapsFieldType,
  type GoogleMapsHubExportMapping,
} from "@/providers/google-maps/schema"
import type {
  ProviderExecutionItem,
  ProviderResultItem,
  ProviderRunConfigItem,
} from "@/providers/types"

export type { GoogleMapsHubExportMapping }

type ProviderSettingsItem = ReturnType<typeof serializeSettings>
type ProviderSettingsResponse = { settings: ProviderSettingsItem }
type GoogleMapsRunsResponse = ProviderSettingsResponse & {
  runs: ProviderRunConfigItem[]
}
type GoogleMapsRunResponse = {
  run: ProviderRunConfigItem
  latest_execution: ProviderExecutionItem | null
  results: ProviderResultItem[]
  field_settings: GoogleMapsFieldSetting[]
  hub_export_mappings: GoogleMapsHubExportMapping[]
}
type FieldSettingsResponse = {
  field_settings: GoogleMapsFieldSetting[]
}
type HubExportMappingsResponse = {
  hub_export_mappings: GoogleMapsHubExportMapping[]
}
export type GoogleMapsSocialPlatform = (typeof socialPlatforms)[number]
export type GoogleMapsEnhanceField = (typeof enhanceFields)[number]
export type GoogleMapsEnhanceResponse = {
  enhanced: number
  skipped: number
  failed: number
}
export type HubExportSite = {
  id: string
  name: string
  subdomain: string
  custom_domain: string | null
  status: string
}
export type HubTemplateTarget = {
  kind: GoogleMapsHubExportMapping["targetKind"]
  field_key: string
  label: string
  value_type: string
}
export type HubTemplateBlock = {
  id: string
  type: string
  title: string
  display_order: number
  layout_column: "main" | "sidebar"
  targets: HubTemplateTarget[]
}
export type HubDirectoryTemplateScan = {
  template: { id: string; name: string } | null
  category_parents?: Array<{ id: string; title: string }>
  blocks: HubTemplateBlock[]
}
export type HubExportStatus = "draft" | "published"
const remoteImageMaxBytes = 10 * 1024 * 1024
const websiteHtmlMaxBytes = 5 * 1024 * 1024
const websiteFetchTimeoutMs = 10_000
const enhanceResultsMax = 200
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
const socialPlatforms = ["instagram", "facebook", "tiktok", "twitter", "linkedin", "youtube"] as const
const enhanceFields = [...socialPlatforms, "email"] as const
const enhanceFieldSchema = z.enum(enhanceFields)
const resultIdsSchema = z.object({
  runId: z.string().min(1),
  resultIds: z.array(z.string().min(1)).min(1),
})
const enhanceResultsSchema = resultIdsSchema.extend({
  resultIds: z.array(z.string().min(1)).min(1).max(enhanceResultsMax),
  platforms: z.array(enhanceFieldSchema).min(1),
})
const hubExportSchema = resultIdsSchema.extend({
  siteId: z.string().min(1),
  status: z.enum(["draft", "published"]),
})
const runIdsSchema = z.object({
  runIds: z.array(z.string().min(1)).min(1),
})
const simpleResultValueSchema = z.union([
  z.string().trim().max(4000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().trim().max(500)).max(100),
])
const resultPayloadSchema = z.object({
  runId: z.string().min(1),
  resultId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  data: z.record(z.string().min(1).max(100), simpleResultValueSchema),
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
    const existingConfig = parseConfig(existing?.config)
    const values = {
      config: {
        actorId: data.actorId.trim(),
        defaultMaxResults: data.defaultMaxResults,
        fieldSettings: existingConfig.fieldSettings,
        hubExportMappings: existingConfig.hubExportMappings,
      },
      secretEncrypted: token ? encryptProviderSecret(token) : existing?.secretEncrypted ?? null,
      updatedAt,
    }

    const [row] = existing
      ? await db.update(providerSettings).set(values).where(and(eq(providerSettings.workspaceId, workspace.id), eq(providerSettings.providerKey, apifyProviderKey))).returning()
      : await db.insert(providerSettings).values({ workspaceId: workspace.id, providerKey: apifyProviderKey, createdAt: updatedAt, ...values }).returning()

    return { settings: serializeSettings(row) }
  })

const saveFieldSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(fieldSettingsPayloadSchema)
  .handler(async ({ data }): Promise<FieldSettingsResponse> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const existing = await settingsRow(workspace.id)
    const updatedAt = now()
    const config = parseConfig(existing?.config)
    const fieldSettings = cleanFieldSettings(data.fieldSettings)
    const values = {
      config: { ...config, fieldSettings },
      secretEncrypted: existing?.secretEncrypted ?? null,
      updatedAt,
    }

    const [row] = existing
      ? await db.update(providerSettings).set(values).where(and(eq(providerSettings.workspaceId, workspace.id), eq(providerSettings.providerKey, apifyProviderKey))).returning()
      : await db.insert(providerSettings).values({ workspaceId: workspace.id, providerKey: apifyProviderKey, createdAt: updatedAt, ...values }).returning()

    return { field_settings: mergeGoogleMapsFieldSettings(parseConfig(row.config).fieldSettings) }
  })

const saveHubExportMappingsFn = createServerFn({ method: "POST" })
  .inputValidator(hubExportMappingsPayloadSchema)
  .handler(async ({ data }): Promise<HubExportMappingsResponse> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const existing = await settingsRow(workspace.id)
    const updatedAt = now()
    const config = parseConfig(existing?.config)
    const siteMappings = data.mappings
      .filter((mapping) => mapping.siteId === data.siteId && mapping.targetKind !== "directoryDataField" && isGoogleMapsCanonicalFieldKey(mapping.sourceKey))
      .map((mapping) => ({
        ...mapping,
        targetFieldKey: mapping.targetFieldKey || hubExportTargetDefaultFieldKey(mapping.targetKind),
      }))
    const hubExportMappings = [
      ...config.hubExportMappings.filter((mapping) => mapping.siteId !== data.siteId),
      ...siteMappings,
    ]
    const values = {
      config: { ...config, hubExportMappings },
      secretEncrypted: existing?.secretEncrypted ?? null,
      updatedAt,
    }

    const [row] = existing
      ? await db.update(providerSettings).set(values).where(and(eq(providerSettings.workspaceId, workspace.id), eq(providerSettings.providerKey, apifyProviderKey))).returning()
      : await db.insert(providerSettings).values({ workspaceId: workspace.id, providerKey: apifyProviderKey, createdAt: updatedAt, ...values }).returning()

    return { hub_export_mappings: parseConfig(row.config).hubExportMappings }
  })

const loadRunsFn = createServerFn({ method: "GET" }).handler(async (): Promise<GoogleMapsRunsResponse> => {
  const workspace = await findWorkspace()
  if (!workspace) {
    return { settings: serializeSettings(null), runs: [] }
  }
  const runs = await db.select().from(providerRunConfigs).where(and(eq(providerRunConfigs.workspaceId, workspace.id), eq(providerRunConfigs.providerKey, googleMapsProviderKey))).orderBy(desc(providerRunConfigs.createdAt))
  const amountByRun = await resultCountsByRun(runs.map((run) => run.id))
  return {
    settings: serializeSettings(await settingsRow(workspace.id)),
    runs: runs.map((run) => ({ ...serializeRun(run), amount: amountByRun.get(run.id) ?? 0 })),
  }
})

const saveRunFn = createServerFn({ method: "POST" })
  .inputValidator(updateRunSchema.partial({ runId: true }))
  .handler(async ({ data }): Promise<{ run: ProviderRunConfigItem }> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const updatedAt = now()
    const input = cleanRunInput(data)
    const existing = data.runId ? await getGoogleMapsRun(data.runId, workspace.id) : null
    const metadata = existing ? await metadataForSavedRun(existing, input) : {}
    const values = {
      name: data.name.trim() || defaultRunName(input),
      status: data.status,
      input,
      metadata,
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
    const input = startInputForRun(run)
    const actorRun = await startActor({
      token,
      actorId: settings.config.actorId,
      input,
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
      stats: input.searchMode === "urls" ? { queriedUrls: input.urls } : {},
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
    const results = await db.select().from(providerResults).where(eq(providerResults.runConfigId, run.id)).orderBy(desc(providerResults.createdAt))

    const config = parseConfig((await settingsRow(workspace.id))?.config)
    return {
      run: serializeRun(run),
      latest_execution: latest ? serializeExecution(latest) : null,
      results: results.map(serializeResult),
      field_settings: mergeGoogleMapsFieldSettings(config.fieldSettings),
      hub_export_mappings: config.hubExportMappings,
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
    const fieldTypes = visibleFieldTypes(parseConfig((await settingsRow(workspace.id))?.config).fieldSettings)
    const [updated] = await db.update(providerResults).set({
      title,
      data: mergeResultData(currentData, data.data, title, fieldTypes),
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

const enhanceResultsFn = createServerFn({ method: "POST" })
  .inputValidator(enhanceResultsSchema)
  .handler(async ({ data }): Promise<GoogleMapsEnhanceResponse> => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const rows = await db
      .select()
      .from(providerResults)
      .where(and(eq(providerResults.runConfigId, run.id), inArray(providerResults.id, data.resultIds)))
    const fields = Array.from(new Set(data.platforms))
    let enhanced = 0
    let skipped = 0
    let failed = 0

    for (const result of rows) {
      const currentData = record(result.data)
      const website = cleanUrl(stringValue(currentData.website) ?? undefined)
      const missingFields = fields.filter((field) => !stringValue(currentData[field]))

      if (!website || !missingFields.length) {
        skipped += 1
        continue
      }

      try {
        const directSocialLink = socialLinkForHref(website, new URL(website))
        const found = directSocialLink
          ? { [directSocialLink.platform]: directSocialLink.url }
          : await findContactDetails(website, missingFields)
        const updates = Object.fromEntries(
          missingFields
            .map((field) => [field, found[field]] as const)
            .filter(([, value]) => Boolean(value))
        )

        if (!Object.keys(updates).length) {
          skipped += 1
          continue
        }

        await db.update(providerResults).set({
          data: { ...currentData, ...updates },
        }).where(eq(providerResults.id, result.id))
        enhanced += 1
      } catch {
        failed += 1
      }
    }

    skipped += Math.max(0, data.resultIds.length - rows.length)
    return { enhanced, skipped, failed }
  })

const loadHubExportSitesFn = createServerFn({ method: "GET" }).handler(async (): Promise<{ sites: HubExportSite[] }> => {
  await requireAdmin()
  const response = await hubBridgeFetch("/api/core/sites")
  const payload = await response.json() as { sites?: HubExportSite[] }
  return { sites: Array.isArray(payload.sites) ? payload.sites : [] }
})

const loadHubDirectoryTemplateScanFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ siteId: z.string().min(1) }))
  .handler(async ({ data }): Promise<HubDirectoryTemplateScan> => {
    await requireAdmin()
    const response = await hubBridgeFetch(`/api/core/directory-templates/default?site_id=${encodeURIComponent(data.siteId)}`)
    return response.json() as Promise<HubDirectoryTemplateScan>
  })

const exportResultsToHubFn = createServerFn({ method: "POST" })
  .inputValidator(hubExportSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const workspace = await requireWorkspace()
    const run = await getGoogleMapsRun(data.runId, workspace.id)
    const rows = await db
      .select()
      .from(providerResults)
      .where(and(eq(providerResults.runConfigId, run.id), inArray(providerResults.id, data.resultIds)))

    if (!rows.length) throw new Error("Select at least one result to export.")

    const config = parseConfig((await settingsRow(workspace.id))?.config)
    const mappings = config.hubExportMappings
      .filter((mapping) => mapping.siteId === data.siteId && mapping.targetKind !== "directoryDataField" && isGoogleMapsCanonicalFieldKey(mapping.sourceKey))
      .map(({ sourceKey, targetBlockId, targetKind, targetFieldKey }) => ({
        sourceKey,
        targetBlockId,
        targetKind,
        targetFieldKey,
      }))
    const mappingSourceKeys = new Set(mappings.map((mapping) => mapping.sourceKey))
    const response = await hubBridgeFetch("/api/core/directories/google-maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: data.siteId,
        status: data.status,
        mappings,
        items: rows.map((result) => resultToHubRecord(result, mappingSourceKeys)),
      }),
    })

    return response.json() as Promise<{
      created: number
      updated: number
      errors: number
      results: Array<{
        source_type: string
        source_id: string | null
        action: "created" | "updated" | "error"
        directory_id?: string
        slug?: string
        error?: string
      }>
    }>
  })

export const loadProviderSettings = () => loadSettingsFn()
export const saveProviderSettings = (data: z.infer<typeof settingsPayloadSchema>) => saveSettingsFn({ data })
export const saveGoogleMapsFieldSettings = (data: z.infer<typeof fieldSettingsPayloadSchema>) => saveFieldSettingsFn({ data })
export const saveGoogleMapsHubExportMappings = (data: z.infer<typeof hubExportMappingsPayloadSchema>) => saveHubExportMappingsFn({ data })
export const loadGoogleMapsRuns = () => loadRunsFn()
export const saveGoogleMapsRun = (data: z.infer<typeof runPayloadSchema> & { runId?: string }) => saveRunFn({ data })
export const deleteGoogleMapsRuns = (runIds: string[]) => deleteRunsFn({ data: { runIds } })
export const startGoogleMapsRun = (runId: string) => startRunFn({ data: { runId } })
export const refreshGoogleMapsExecution = (executionId: string) => refreshExecutionFn({ data: { executionId } })
export const loadGoogleMapsRun = (runId: string) => loadRunFn({ data: { runId } })
export const updateGoogleMapsResult = (data: z.infer<typeof resultPayloadSchema>) => updateResultFn({ data })
export const deleteGoogleMapsResults = (runId: string, resultIds: string[]) => deleteResultsFn({ data: { runId, resultIds } })
export const enhanceGoogleMapsResults = (data: z.infer<typeof enhanceResultsSchema>) => enhanceResultsFn({ data })
export const loadHubExportSites = () => loadHubExportSitesFn()
export const loadHubDirectoryTemplateScan = (siteId: string) => loadHubDirectoryTemplateScanFn({ data: { siteId } })
export const exportGoogleMapsResultsToHub = (data: z.infer<typeof hubExportSchema>) => exportResultsToHubFn({ data })

function defaultRunName(input: ReturnType<typeof cleanRunInput>) {
  if (input.searchMode === "urls") return `${input.urls.length} Google Maps ${input.urls.length === 1 ? "URL" : "URLs"}`
  if (input.searchMode === "url") return "Google Maps URL"
  return `${input.keyword} in ${input.location}`
}

function hubExportTargetDefaultFieldKey(targetKind: GoogleMapsHubExportMapping["targetKind"]) {
  if (targetKind === "directoryTitle") return "title"
  if (targetKind === "directoryFeaturedImage") return "featuredImage"
  if (targetKind === "directoryCategory") return "category"
  if (targetKind === "richTextBody") return "body"
  if (targetKind === "googleMapLocationQuery") return "locationQuery"
  if (targetKind === "openingHoursPlaceId") return "placeId"
  if (targetKind === "openingHoursText") return "hoursText"
  return ""
}

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

function startInputForRun(run: CoreProviderRunConfig) {
  const input = parseRunInput(run.input)
  if (input.searchMode !== "urls" || !input.skipKnownUrls) return input

  const queriedUrls = new Set(runMetadata(run.metadata).queriedUrls)
  const urls = input.urls.filter((url) => !queriedUrls.has(url))
  if (!urls.length) throw new Error("All URLs in this run have already been queried.")
  return { ...input, urls }
}

async function metadataForSavedRun(existing: CoreProviderRunConfig, input: ReturnType<typeof cleanRunInput>) {
  const metadata = runMetadata(existing.metadata)
  if (input.searchMode !== "urls") return metadata
  if (metadata.queriedUrls.length) return metadata

  const existingInput = parseRunInput(existing.input)
  if (existingInput.searchMode !== "urls") return metadata
  if (await resultCount(existing.id) === 0) return metadata

  return {
    ...metadata,
    queriedUrls: Array.from(new Set([...metadata.queriedUrls, ...existingInput.urls])),
  }
}

async function resultCountsByRun(runIds: string[]) {
  if (!runIds.length) return new Map<string, number>()
  const rows = await db
    .select({
      runConfigId: providerResults.runConfigId,
      amount: sql<number>`count(*)::int`,
    })
    .from(providerResults)
    .where(inArray(providerResults.runConfigId, runIds))
    .groupBy(providerResults.runConfigId)

  return new Map(rows.map((row) => [row.runConfigId, row.amount]))
}

async function resultCount(runId: string) {
  return (await resultCountsByRun([runId])).get(runId) ?? 0
}

async function importIfReady(execution: CoreProviderExecution, run: CoreProviderRunConfig, token: string, userId: string) {
  if (execution.status !== "succeeded" || !execution.providerDatasetId) return execution

  const runInput = parseRunInput(run.input)
  const executionUrls = executionQueriedUrls(execution.stats, runInput.urls)
  const input = runInput.searchMode === "urls" ? { ...runInput, urls: executionUrls } : runInput
  const resultLimit = input.searchMode === "urls" ? input.urls.length : input.maxResults
  const items = await getDatasetItems(token, execution.providerDatasetId, resultLimit)
  const existingResults = await db.select().from(providerResults).where(eq(providerResults.runConfigId, run.id))
  const existingKeys = new Set(
    existingResults
      .filter((result) => result.executionId !== execution.id)
      .map((result) => resultDedupKey(result.externalId, result.title, record(result.data)))
      .filter((key) => key !== null)
  )
  const createdAt = now()
  const rows: (typeof providerResults.$inferInsert)[] = []
  const rowKeys = new Set<string>()
  let importedImages = 0

  for (const item of items) {
    const normalized = normalizeResult(item)
    const fixedData = fixedResultData({
      ...record(normalized.data),
      ...(input.neighborhood ? { neighborhood: input.neighborhood } : {}),
    })
    const key = resultDedupKey(normalized.externalId, normalized.title, fixedData)
    if (key && existingKeys.has(key)) continue
    if (key && rowKeys.has(key)) continue
    if (key) rowKeys.add(key)
    const imageResult = await saveResultImage(userId, normalized.title, fixedData)
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
    if (input.searchMode === "urls" && input.urls.length) {
      const metadata = runMetadata(run.metadata)
      await tx.update(providerRunConfigs).set({
        metadata: { ...metadata, queriedUrls: Array.from(new Set([...metadata.queriedUrls, ...input.urls])) },
      }).where(eq(providerRunConfigs.id, run.id))
    }
    const [updated] = await tx.update(providerExecutions).set({
      stats: { ...record(execution.stats), importedResults: rows.length, skippedDuplicates: items.length - rows.length, importedImages },
      updatedAt: now(),
    }).where(eq(providerExecutions.id, execution.id)).returning()
    return updated
  })
}

async function hubBridgeFetch(path: string, init: RequestInit = {}) {
  const baseUrl = hubBridgeBaseUrl()
  const token = process.env.CORE_HUB_BRIDGE_TOKEN?.trim()

  if (!baseUrl) throw new Error("Core Hub bridge URL is not configured.")
  if (!token) throw new Error("CORE_HUB_BRIDGE_TOKEN is not configured.")

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.ok) return response

  const error = await response.json().catch(() => null) as { error?: string } | null
  throw new Error(error?.error || `Hub bridge request failed (${response.status}).`)
}

function hubBridgeBaseUrl() {
  const override = cleanBaseUrl(process.env.CORE_HUB_BASE_URL)
  if (override) return override

  const localUrl = cleanBaseUrl(process.env.CORE_HUB_LOCAL_BASE_URL)
  const productionUrl = cleanBaseUrl(process.env.CORE_HUB_PRODUCTION_BASE_URL)
  return process.env.NODE_ENV === "production"
    ? productionUrl || localUrl
    : localUrl || productionUrl
}

function cleanBaseUrl(value?: string) {
  return value?.trim().replace(/\/+$/, "") || ""
}

function resultToHubRecord(result: CoreProviderResult, mappingSourceKeys = new Set<string>()) {
  const data = record(result.data)
  const hubRecord: Record<string, unknown> = {
    google_maps_place_id: stringValue(data.placeId),
    businessName: stringValue(data.businessName) || result.title,
  }

  mappingSourceKeys.forEach((key) => {
    if (hubRecord[key] !== undefined) return
    const value = data[key]
    if (value !== undefined) hubRecord[key] = value
  })

  return hubRecord
}

function fixedResultData(data: Record<string, unknown>) {
  const fixedData = {
    ...data,
    neighborhood: stringValue(data.neighborhood),
    city: stringValue(data.city),
    region: stringValue(data.region) ?? stringValue(data.state),
    country: stringValue(data.country) ?? stringValue(data.countryCode),
  }

  return Object.fromEntries(
    Object.entries(fixedData).filter(([key]) => isGoogleMapsCanonicalFieldKey(key))
  )
}

function resultDedupKey(externalId: string | null, title: string, data: Record<string, unknown>) {
  const placeId = stringValue(data.placeId)
  if (placeId) return `place:${placeId}`

  const external = stringValue(externalId)
  if (external) return `external:${external}`

  const mapsUrl = stringValue(data.mapsUrl)
  if (mapsUrl) return `maps:${mapsUrl}`

  const address = stringValue(data.address)
  const name = title.trim().toLowerCase()
  return name && address ? `fallback:${name}:${address.toLowerCase()}` : null
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
    !["http:", "https:"].includes(parsed.protocol) ||
    !googleImageHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  ) {
    throw new Error("Unsupported image host.")
  }
  parsed.protocol = "https:"
  return parsed.toString()
}

function extensionForImageMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/gif") return "gif"
  if (mimeType === "image/webp") return "webp"
  return "jpg"
}

async function findContactDetails(website: string, fields: GoogleMapsEnhanceField[]) {
  let url = new URL(website)
  let triedApexFallback = false

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: WebsiteResponse
    try {
      response = await fetchPublicWebsite(url)
    } catch (error) {
      if (!triedApexFallback && url.hostname.toLowerCase().startsWith("www.")) {
        triedApexFallback = true
        url.hostname = url.hostname.slice(4)
        continue
      }
      throw error
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = headerValue(response.headers.location)
      if (!location) throw new Error("Website redirect is missing a location.")
      url = new URL(location, url)
      continue
    }

    if (response.status < 200 || response.status >= 300) throw new Error("Website request failed.")

    const contentType = headerValue(response.headers["content-type"])?.split(";")[0]?.trim().toLowerCase()
    if (contentType && !["text/html", "application/xhtml+xml"].includes(contentType)) {
      throw new Error("Website is not HTML.")
    }

    const contentLength = Number(headerValue(response.headers["content-length"]) ?? 0)
    if (contentLength > websiteHtmlMaxBytes) throw new Error("Website HTML is too large.")

    const details = extractContactDetails(response.body, url, fields)
    const missingFields = fields.filter((field) => !details[field])

    for (const widgetUrl of contactWidgetUrls(response.body, url)) {
      if (!missingFields.length) break
      const widgetResponse = await fetchPublicWebsite(widgetUrl)
      if (widgetResponse.status < 200 || widgetResponse.status >= 300) continue
      Object.assign(details, extractContactDetails(widgetResponse.body, widgetUrl, missingFields))
      missingFields.splice(0, missingFields.length, ...fields.filter((field) => !details[field]))
    }

    return details
  }

  throw new Error("Website redirected too many times.")
}

type PublicAddress = { address: string; family: 4 | 6 }
type WebsiteResponse = {
  status: number
  headers: IncomingHttpHeaders
  body: string
}

async function fetchPublicWebsite(url: URL): Promise<WebsiteResponse> {
  const pinnedAddress = await assertPublicWebsiteUrl(url)
  const request = url.protocol === "https:" ? httpsRequest : httpRequest

  return new Promise((resolve, reject) => {
    const req = request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
        "User-Agent": "Mozilla/5.0 (compatible; CoreEnhance/1.0)",
      },
      servername: url.hostname,
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          callback(null, [pinnedAddress])
          return
        }
        callback(null, pinnedAddress.address, pinnedAddress.family)
      },
    }, (res) => {
      const chunks: Uint8Array[] = []
      let total = 0

      res.on("data", (chunk: Uint8Array) => {
        total += chunk.byteLength
        if (total > websiteHtmlMaxBytes) {
          req.destroy(new Error("Website HTML is too large."))
          return
        }
        chunks.push(chunk)
      })

      res.on("end", () => {
        const body = decodeWebsiteBody(chunks, total, headerValue(res.headers["content-encoding"]))
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
        })
      })
    })

    req.setTimeout(websiteFetchTimeoutMs, () => {
      req.destroy(new Error("Website request timed out."))
    })
    req.on("error", reject)
    req.end()
  })
}

async function assertPublicWebsiteUrl(url: URL): Promise<PublicAddress> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid website URL.")
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateAddress(hostname)) {
    throw new Error("Invalid website host.")
  }

  const addresses = await lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Invalid website host.")
  }

  const address = addresses.find((item) => item.family === 4) ?? addresses[0]
  return {
    address: address.address,
    family: address.family === 6 ? 6 : 4,
  }
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function concatBytes(chunks: Uint8Array[], total: number) {
  const data = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return data
}

function decodeWebsiteBody(chunks: Uint8Array[], total: number, encoding?: string) {
  const data = concatBytes(chunks, total)
  const normalized = encoding?.split(",")[0]?.trim().toLowerCase()
  const decoded = normalized === "gzip"
    ? gunzipSync(data)
    : normalized === "deflate"
      ? inflateSync(data)
      : normalized === "br"
        ? brotliDecompressSync(data)
        : data

  if (decoded.byteLength > websiteHtmlMaxBytes) throw new Error("Website HTML is too large.")
  return new TextDecoder().decode(decoded)
}

function extractContactDetails(html: string, baseUrl: URL, fields: GoogleMapsEnhanceField[]) {
  const selected = new Set(fields)
  const links: Partial<Record<GoogleMapsEnhanceField, string>> = {}
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi
  const hrefs: string[] = []

  for (const match of html.matchAll(hrefPattern)) {
    const rawHref = normalizeCandidateHref(match[1] ?? match[2] ?? match[3] ?? "")
    hrefs.push(rawHref)
    const email = emailFromMailto(rawHref)
    if (selected.has("email") && email && !links.email) links.email = email

    const socialLink = socialLinkForHref(rawHref, baseUrl)
    if (!socialLink || !selected.has(socialLink.platform) || links[socialLink.platform]) continue
    links[socialLink.platform] = socialLink.url
  }

  const socialUrlPattern = /https?:\\?\/\\?\/(?:www\.)?(?:instagram\.com|facebook\.com|fb\.com|tiktok\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|youtu\.be)[^\s"'<>)]*/gi
  for (const match of html.matchAll(socialUrlPattern)) {
    const socialLink = socialLinkForHref(normalizeCandidateHref(match[0]), baseUrl)
    if (!socialLink || !selected.has(socialLink.platform) || links[socialLink.platform]) continue
    links[socialLink.platform] = socialLink.url
  }

  if (selected.has("email") && !links.email) links.email = emailFromText(html) ?? undefined
  if (selected.has("instagram") && !links.instagram) {
    links.instagram = hrefs.map((href) => instagramMediaLinkForHref(href, baseUrl)).find(Boolean) ?? undefined
  }

  return links
}

function contactWidgetUrls(html: string, baseUrl: URL) {
  const iframePattern = /<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi
  const urls: URL[] = []

  for (const match of html.matchAll(iframePattern)) {
    const rawSrc = normalizeCandidateHref(match[1] ?? match[2] ?? match[3] ?? "")
    const url = safeWidgetUrl(rawSrc, baseUrl)
    if (url) urls.push(url)
  }

  return urls.slice(0, 3)
}

function safeWidgetUrl(rawSrc: string, baseUrl: URL) {
  try {
    const url = new URL(rawSrc, baseUrl)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    if (url.protocol !== "https:" || hostname !== "cdn.lightwidget.com" || !url.pathname.startsWith("/widgets/")) return null
    return url
  } catch {
    return null
  }
}

function socialLinkForHref(rawHref: string, baseUrl: URL): { platform: GoogleMapsSocialPlatform; url: string } | null {
  try {
    const url = new URL(rawHref, baseUrl)
    if (!["http:", "https:"].includes(url.protocol)) return null

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    const platform = socialPlatformForHost(hostname)
    if (!platform || !isSocialProfileUrl(platform, url)) return null

    url.hash = ""
    return { platform, url: url.toString() }
  } catch {
    return null
  }
}

function instagramMediaLinkForHref(rawHref: string, baseUrl: URL) {
  try {
    const url = new URL(rawHref, baseUrl)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    if (!["http:", "https:"].includes(url.protocol) || hostname !== "instagram.com") return null

    const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? ""
    if (!["p", "reel", "tv"].includes(first)) return null

    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

function socialPlatformForHost(hostname: string): GoogleMapsSocialPlatform | null {
  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram"
  if (hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.com") return "facebook"
  if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tiktok"
  if (hostname === "twitter.com" || hostname.endsWith(".twitter.com") || hostname === "x.com") return "twitter"
  if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) return "linkedin"
  if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") return "youtube"
  return null
}

function isSocialProfileUrl(platform: GoogleMapsSocialPlatform, url: URL) {
  const segments = url.pathname.split("/").filter(Boolean)
  const first = segments[0]?.toLowerCase() ?? ""
  if (!first) return false

  if (platform === "instagram") return !["p", "reel", "explore", "stories", "share"].includes(first)
  if (platform === "facebook") return !["sharer", "share", "dialog", "plugins", "events", "groups"].includes(first)
  if (platform === "tiktok") return first.startsWith("@")
  if (platform === "twitter") return !["intent", "share", "home", "i", "search"].includes(first)
  if (platform === "linkedin") return ["company", "in", "school", "showcase"].includes(first) && Boolean(segments[1])
  if (platform === "youtube") return first.startsWith("@") || ["channel", "c", "user"].includes(first)
  return false
}

function normalizeCandidateHref(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .trim()
}

function emailFromMailto(value: string) {
  if (!value.toLowerCase().startsWith("mailto:")) return null
  return cleanEmail(value.slice(7).split("?")[0])
}

function emailFromText(value: string) {
  return cleanEmail(normalizeCandidateHref(value))
}

function cleanEmail(value: string | undefined) {
  if (!value) return null
  const decoded = decodeURIComponentSafe(value)
  const match = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0].toLowerCase() : null
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isPrivateAddress(address: string) {
  const ipVersion = isIP(address)
  if (ipVersion === 4) return isPrivateIpv4(address)
  if (ipVersion === 6) return isPrivateIpv6(address)
  return false
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true

  const [a, b, c] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase()
  const mappedIpv4 = normalized.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] || ""
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4)

  if (normalized === "::" || normalized === "::1") return true
  if (/^(?:0+:){7}(?:0+|1)$/.test(normalized)) return true

  const firstSegment = normalized.split(":")[0]
  const firstValue = Number.parseInt(firstSegment, 16)
  if (!Number.isFinite(firstValue)) return false

  return (
    (firstValue & 0xfe00) === 0xfc00 ||
    (firstValue & 0xffc0) === 0xfe80 ||
    (firstValue & 0xff00) === 0xff00 ||
    normalized.startsWith("2001:db8:")
  )
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

function runMetadata(value: unknown) {
  const metadata = record(value)
  return { ...metadata, queriedUrls: stringArray(metadata.queriedUrls) }
}

function executionQueriedUrls(stats: unknown, fallbackUrls: string[]) {
  const queriedUrls = stringArray(record(stats).queriedUrls)
  return queriedUrls.length ? queriedUrls : fallbackUrls
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : []
}

function mergeResultData(
  currentData: Record<string, unknown>,
  updates: Record<string, string | number | boolean | null | string[]>,
  title: string,
  fieldTypes: Map<string, GoogleMapsFieldType>
) {
  const merged: Record<string, unknown> = { ...currentData, businessName: title }

  Object.entries(updates).forEach(([key, value]) => {
    const type = fieldTypes.get(key)
    if (!canUpdateResultField(key, fieldTypes)) return
    merged[key] = key === "businessName" ? title : cleanResultValue(key, value, type)
  })

  return merged
}

function canUpdateResultField(
  key: string,
  fieldTypes: Map<string, GoogleMapsFieldType>
) {
  if (fieldTypes.has(key)) return true
  return key === "businessName" || key === "featuredImage"
}

function cleanResultValue(key: string, value: string | number | boolean | null | string[], type?: GoogleMapsFieldType) {
  if (type === "tags") return Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : []
  if (Array.isArray(value)) return null
  if (key === "email") return typeof value === "string" ? cleanEmail(value) : null
  if (key === "website" || key === "featuredImage") return typeof value === "string" ? cleanUrl(value) : null
  if (typeof value === "string") return cleanOptional(value)
  return value
}

function visibleFieldTypes(fieldSettings: GoogleMapsFieldSetting[]) {
  return new Map(
    mergeGoogleMapsFieldSettings(fieldSettings)
      .filter((setting) => setting.visible)
      .map((setting) => [setting.key, setting.type])
  )
}

function cleanFieldSettings(fieldSettings: GoogleMapsFieldSetting[]) {
  const canonicalSettings = fieldSettings.filter((setting) => isGoogleMapsCanonicalFieldKey(setting.key))
  return mergeGoogleMapsFieldSettings(canonicalSettings)
    .map((setting, index) => ({ ...setting, sourcePath: setting.key, order: index }))
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
