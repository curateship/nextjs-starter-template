import { z } from "zod"

import type {
  CoreScraperExecution,
  CoreScraperProviderSettings,
  CoreScraperResult,
  CoreScraperRun,
} from "@/server/schema"
import { executionStatuses, runStatuses } from "@/scrapers/types"

export const apifyProviderKey = "apify"
export const googleMapsScraperKey = "google-maps"
export const defaultApifyActorId = "compass/crawler-google-places"
export const defaultMaxResults = 25
const requiredText = (max: number) => z.string().trim().min(1).max(max)

export const apifyConfigSchema = z.object({
  actorId: requiredText(255),
  defaultMaxResults: z.number().int().min(1).max(500),
})
export const settingsPayloadSchema = apifyConfigSchema.extend({
  token: z.string().max(4000).optional(),
})
export const runInputSchema = z.object({
  keyword: requiredText(500),
  location: requiredText(500),
  language: z.string().trim().min(2).max(20),
  maxResults: z.number().int().min(1).max(500),
})
export const runPayloadSchema = runInputSchema.extend({
  name: requiredText(255),
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
  }).parse(value)
}

export function parseRunInput(value: unknown) {
  return runInputSchema.parse(value)
}

export function cleanRunInput(data: z.infer<typeof runPayloadSchema>) {
  return {
    keyword: data.keyword.trim(),
    location: data.location.trim(),
    language: data.language.trim().toLowerCase(),
    maxResults: data.maxResults,
  }
}

export function serializeSettings(row: CoreScraperProviderSettings | null) {
  const config = parseConfig(row?.config)
  return {
    actor_id: config.actorId,
    default_max_results: config.defaultMaxResults,
    has_token: Boolean(row?.secretEncrypted),
  }
}

export function serializeRun(row: CoreScraperRun) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    input: record(row.input),
    created_at: row.createdAt.toISOString(),
  }
}

export function serializeExecution(row: CoreScraperExecution) {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    error: row.error,
    stats: record(row.stats),
    started_at: row.startedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }
}

export function serializeResult(row: CoreScraperResult) {
  return {
    id: row.id,
    external_id: row.externalId,
    title: row.title,
    data: record(row.data),
  }
}

export function importedCount(stats: Record<string, unknown>) {
  return typeof stats.importedResults === "number" ? stats.importedResults : 0
}

export function isTerminalStatus(status: string) {
  return executionStatuses.includes(
    status as (typeof executionStatuses)[number]
  ) && !["queued", "running"].includes(status)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
