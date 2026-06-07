import { z } from "zod"

import type {
  CoreProviderExecution,
  CoreProviderSettings,
  CoreProviderResult,
  CoreProviderRunConfig,
} from "@/server/schema"
import {
  executionStatuses,
  runStatuses,
  type ProviderExecutionItem,
  type ProviderExecutionStatus,
  type JsonRecord,
  type JsonValue,
  type ProviderResultItem,
  type ProviderRunConfigItem,
  type ProviderRunConfigStatus,
} from "@/providers/types"

export const apifyProviderKey = "apify"
export const googleMapsProviderKey = "google-maps"
export const defaultApifyActorId = "compass/crawler-google-places"
export const defaultMaxResults = 25
const requiredText = (max: number) => z.string().trim().min(1).max(max)

export const fieldSettingTypes = ["text", "number", "boolean", "tags"] as const
export const fieldSettingSchema = z.object({
  key: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  sourcePath: z.string().trim().min(1).max(255),
  label: z.string().trim().min(1).max(120),
  visible: z.boolean(),
  editable: z.boolean(),
  type: z.enum(fieldSettingTypes),
  order: z.number().int().min(0).max(500),
})
export const fieldSettingsSchema = z.array(fieldSettingSchema).max(100)
export const hubExportMappingTargetKinds = ["directoryTitle", "directoryFeaturedImage", "directoryCategory", "directoryDataField", "richTextBody", "googleMapLocationQuery", "openingHoursPlaceId", "customField", "coreContentField", "coreMenuLink", "coreSocialLink"] as const
export const hubExportMappingSchema = z.object({
  siteId: z.string().trim().min(1).max(100),
  sourceKey: z.string().trim().min(1).max(100),
  targetBlockId: z.string().trim().min(1).max(255),
  targetKind: z.enum(hubExportMappingTargetKinds),
  targetFieldKey: z.string().trim().max(255).default(""),
})
export const hubExportMappingsSchema = z.array(hubExportMappingSchema).max(200)
export const apifyConfigSchema = z.object({
  actorId: requiredText(255),
  defaultMaxResults: z.number().int().min(1).max(500),
  fieldSettings: fieldSettingsSchema.catch([]).default([]),
  hubExportMappings: hubExportMappingsSchema.catch([]).default([]),
})
export const settingsPayloadSchema = z.object({
  actorId: requiredText(255),
  defaultMaxResults: z.number().int().min(1).max(500),
  token: z.string().max(4000).optional(),
})
export const fieldSettingsPayloadSchema = z.object({
  fieldSettings: fieldSettingsSchema,
})
export const hubExportMappingsPayloadSchema = z.object({
  siteId: z.string().trim().min(1).max(100),
  mappings: hubExportMappingsSchema,
})
export type GoogleMapsFieldSetting = z.infer<typeof fieldSettingSchema>
export type GoogleMapsFieldType = GoogleMapsFieldSetting["type"]
export type GoogleMapsHubExportMapping = z.infer<typeof hubExportMappingSchema>

export function googleMapsFieldValue(data: Record<string, unknown>, key: string, sourcePath: string) {
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    const directValue = data[key]
    return googleMapsStructuredFieldValue(sourcePath, directValue) ?? directValue
  }

  const value = valueAtPath(data, sourcePath)
  const structuredValue = googleMapsStructuredFieldValue(sourcePath, value)
  if (structuredValue !== undefined) return structuredValue

  if (!sourcePath.includes(".additionalInfo.")) return value

  const tags = googleMapsAdditionalInfoTags(value)
  return tags.length ? tags : undefined
}

export function hasGoogleMapsAdditionalInfoGroupKey(data: Record<string, unknown>, key: string) {
  return Object.keys(rawAdditionalInfo(data)).some((group) => googleMapsFieldKey(group) === key)
}

export function googleMapsFieldKey(value: string) {
  const parts = value.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const key = parts.map((part, index) => {
    const clean = part.replace(/^[0-9]+/, "")
    if (!clean) return ""
    return index === 0 ? clean.charAt(0).toLowerCase() + clean.slice(1) : clean.charAt(0).toUpperCase() + clean.slice(1)
  }).join("")
  return key || "field"
}

export function googleMapsAdditionalInfoTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    return Object.entries(item as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([label]) => label)
  })
}

function rawAdditionalInfo(data: Record<string, unknown>): Record<string, unknown> {
  const raw = data.raw
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const additionalInfo = (raw as Record<string, unknown>).additionalInfo
  return additionalInfo && typeof additionalInfo === "object" && !Array.isArray(additionalInfo)
    ? additionalInfo as Record<string, unknown>
    : {}
}

function valueAtPath(data: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[key]
  }, data)
}

function googleMapsStructuredFieldValue(sourcePath: string, value: unknown) {
  if (!sourcePath.endsWith("openingHours") || !Array.isArray(value)) return undefined

  const hours = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const day = typeof record.day === "string" ? record.day.trim() : ""
    const text = typeof record.hours === "string" ? record.hours.trim() : ""
    if (day && text) return `${day}: ${text}`
    return text ? [text] : []
  })

  return hours
}

export const runInputSchema = z.object({
  keyword: requiredText(500),
  location: requiredText(500),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  language: z.string().trim().min(2).max(20),
  maxResults: z.number().int().min(1).max(500),
})
export const runPayloadSchema = runInputSchema.extend({
  name: z.string().trim().max(255),
  status: z.enum(runStatuses),
})
export const updateRunSchema = runPayloadSchema.extend({
  runId: z.string().min(1),
})
export const runIdSchema = z.object({ runId: z.string().min(1) })
export const executionIdSchema = z.object({ executionId: z.string().min(1) })

export function parseConfig(value: unknown) {
  return apifyConfigSchema.catch({
    actorId: defaultApifyActorId,
    defaultMaxResults,
    fieldSettings: [],
    hubExportMappings: [],
  }).parse(value)
}

export function parseRunInput(value: unknown) {
  return runInputSchema.parse(value)
}

export function cleanRunInput(data: z.infer<typeof runPayloadSchema>) {
  return {
    keyword: data.keyword.trim(),
    location: data.location.trim(),
    latitude: data.latitude,
    longitude: data.longitude,
    language: data.language.trim().toLowerCase(),
    maxResults: data.maxResults,
  }
}

export function serializeSettings(row: CoreProviderSettings | null) {
  const config = parseConfig(row?.config)
  return {
    actor_id: config.actorId,
    default_max_results: config.defaultMaxResults,
    field_settings: config.fieldSettings,
    hub_export_mappings: config.hubExportMappings,
    has_token: Boolean(row?.secretEncrypted),
  }
}

export function serializeRun(row: CoreProviderRunConfig): ProviderRunConfigItem {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ProviderRunConfigStatus,
    input: record(row.input),
    amount: 0,
    created_at: row.createdAt.toISOString(),
  }
}

export function serializeExecution(row: CoreProviderExecution): ProviderExecutionItem {
  return {
    id: row.id,
    status: row.status as ProviderExecutionStatus,
    message: row.message,
    error: row.error,
    stats: record(row.stats),
    started_at: row.startedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }
}

export function serializeResult(row: CoreProviderResult): ProviderResultItem {
  return {
    id: row.id,
    external_id: row.externalId,
    title: row.title,
    data: record(row.data),
    created_at: row.createdAt.toISOString(),
  }
}

export function importedCount(stats: JsonRecord) {
  return typeof stats.importedResults === "number" ? stats.importedResults : 0
}

export function isTerminalStatus(status: string) {
  return executionStatuses.includes(
    status as (typeof executionStatuses)[number]
  ) && !["queued", "running"].includes(status)
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, jsonValue(item)])
  )
}

function jsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(jsonValue)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonValue(item)])
    )
  }

  return null
}
