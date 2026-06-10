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
export const defaultBlastRadiusKm = 0.5
const requiredText = (max: number) => z.string().trim().min(1).max(max)

export const fieldSettingTypes = ["text", "number", "boolean", "tags"] as const
export const fieldSettingSchema = z.object({
  key: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  sourcePath: z.string().trim().min(1).max(255),
  label: z.string().trim().min(1).max(120),
  visible: z.boolean(),
  type: z.enum(fieldSettingTypes),
  order: z.number().int().min(0).max(500),
})
export const fieldSettingsSchema = z.array(fieldSettingSchema).max(100)
export const hubExportMappingTargetKinds = ["directoryTitle", "directoryFeaturedImage", "directoryCategory", "directoryDataField", "richTextBody", "googleMapLocationQuery", "openingHoursPlaceId", "openingHoursText", "customField", "coreContentField", "coreMenuLink", "coreSocialLink"] as const
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

export const googleMapsCanonicalFieldSettings: GoogleMapsFieldSetting[] = [
  { key: "businessName", sourcePath: "businessName", label: "Business", visible: true, type: "text", order: 0 },
  { key: "category", sourcePath: "category", label: "Category", visible: true, type: "text", order: 1 },
  { key: "neighborhood", sourcePath: "neighborhood", label: "Neighborhood", visible: true, type: "text", order: 2 },
  { key: "description", sourcePath: "description", label: "Description", visible: true, type: "text", order: 3 },
  { key: "address", sourcePath: "address", label: "Address", visible: true, type: "text", order: 4 },
  { key: "street", sourcePath: "street", label: "Street", visible: false, type: "text", order: 5 },
  { key: "city", sourcePath: "city", label: "City", visible: true, type: "text", order: 6 },
  { key: "region", sourcePath: "region", label: "Region", visible: true, type: "text", order: 7 },
  { key: "state", sourcePath: "state", label: "State", visible: false, type: "text", order: 8 },
  { key: "country", sourcePath: "country", label: "Country", visible: true, type: "text", order: 9 },
  { key: "countryCode", sourcePath: "countryCode", label: "Country code", visible: false, type: "text", order: 10 },
  { key: "rating", sourcePath: "rating", label: "Rating", visible: true, type: "number", order: 11 },
  { key: "reviewCount", sourcePath: "reviewCount", label: "Reviews", visible: true, type: "number", order: 12 },
  { key: "phone", sourcePath: "phone", label: "Phone", visible: true, type: "text", order: 13 },
  { key: "website", sourcePath: "website", label: "Website", visible: true, type: "text", order: 14 },
  { key: "email", sourcePath: "email", label: "Email", visible: true, type: "text", order: 15 },
  { key: "instagram", sourcePath: "instagram", label: "Instagram", visible: true, type: "text", order: 16 },
  { key: "facebook", sourcePath: "facebook", label: "Facebook", visible: true, type: "text", order: 17 },
  { key: "tiktok", sourcePath: "tiktok", label: "TikTok", visible: true, type: "text", order: 18 },
  { key: "twitter", sourcePath: "twitter", label: "X/Twitter", visible: true, type: "text", order: 19 },
  { key: "linkedin", sourcePath: "linkedin", label: "LinkedIn", visible: true, type: "text", order: 20 },
  { key: "youtube", sourcePath: "youtube", label: "YouTube", visible: true, type: "text", order: 21 },
  { key: "mapsUrl", sourcePath: "mapsUrl", label: "Google Maps URL", visible: false, type: "text", order: 22 },
  { key: "placeId", sourcePath: "placeId", label: "Google Maps Place ID", visible: false, type: "text", order: 23 },
  { key: "latitude", sourcePath: "latitude", label: "Latitude", visible: false, type: "number", order: 24 },
  { key: "longitude", sourcePath: "longitude", label: "Longitude", visible: false, type: "number", order: 25 },
  { key: "openingHours", sourcePath: "openingHours", label: "Opening hours", visible: false, type: "tags", order: 26 },
  { key: "featuredImage", sourcePath: "featuredImage", label: "Featured image", visible: false, type: "text", order: 27 },
  { key: "featuredImageMediaId", sourcePath: "featuredImageMediaId", label: "Featured image media ID", visible: false, type: "text", order: 28 },
  { key: "sourceImageUrl", sourcePath: "sourceImageUrl", label: "Source image URL", visible: false, type: "text", order: 29 },
]

const googleMapsCanonicalFieldKeySet = new Set(googleMapsCanonicalFieldSettings.map((field) => field.key))

export function isGoogleMapsCanonicalFieldKey(key: string) {
  return googleMapsCanonicalFieldKeySet.has(key)
}

export function mergeGoogleMapsFieldSettings(savedSettings: GoogleMapsFieldSetting[] = []) {
  const savedByKey = new Map(savedSettings.map((setting) => [setting.key, setting]))

  return googleMapsCanonicalFieldSettings.map((field, index) => {
    const saved = savedByKey.get(field.key)
    const visible = saved?.visible ?? field.visible
    return {
      ...field,
      visible,
      order: index,
    }
  })
}

export const runInputSchema = z.object({
  keyword: requiredText(500),
  location: requiredText(500),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  useBlastRadius: z.boolean().default(false),
  blastRadiusKm: z.number().min(0.1).max(100).default(defaultBlastRadiusKm),
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
    useBlastRadius: data.useBlastRadius,
    blastRadiusKm: data.blastRadiusKm,
    language: data.language.trim().toLowerCase(),
    maxResults: data.maxResults,
  }
}

export function serializeSettings(row: CoreProviderSettings | null) {
  const config = parseConfig(row?.config)
  return {
    actor_id: config.actorId,
    default_max_results: config.defaultMaxResults,
    field_settings: mergeGoogleMapsFieldSettings(config.fieldSettings),
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
