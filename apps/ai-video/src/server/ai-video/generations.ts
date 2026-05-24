import { and, desc, eq, ilike, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media-storage"
import { uploadToR2 } from "@/server/media-storage"
import { aiVideoGenerations, type AiVideoGeneration } from "@/server/schema"
import { now, uuid } from "@/server/security"
import {
  createFailedSteps,
  createInitialSteps,
  createSucceededSteps,
  getWorkflowModule,
  ugcModuleKey,
  type UGCWorkflowInput,
  type VideoGenerationSettings,
} from "@/server/ai-video/workflows"
import { getVideoProvider } from "@/server/ai-video/providers"

export type GenerationStatus =
  | "draft"
  | "queued"
  | "writing_prompt"
  | "generating"
  | "saving"
  | "succeeded"
  | "failed"

export type GenerationItem = {
  id: string
  module_key: string
  provider: string
  model: string
  status: GenerationStatus
  input: unknown
  prompt: string
  settings: unknown
  steps: unknown
  provider_task_id: string | null
  provider_result_url: string | null
  video_url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type GenerationListResponse = {
  generations: GenerationItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export async function listWorkspaceGenerations({
  userId,
  workspaceId,
  page,
  pageSize,
  status,
  search,
}: {
  userId: string
  workspaceId: string
  page: number
  pageSize: number
  status?: GenerationStatus | "all"
  search?: string
}): Promise<GenerationListResponse> {
  const normalizedPage = Math.max(1, page)
  const normalizedPageSize = Math.min(Math.max(1, pageSize), 100)
  const filters = [
    eq(aiVideoGenerations.userId, userId),
    eq(aiVideoGenerations.workspaceId, workspaceId),
  ]
  if (status && status !== "all") {
    filters.push(eq(aiVideoGenerations.status, status))
  }
  const query = search?.trim()
  if (query) {
    filters.push(ilike(aiVideoGenerations.prompt, `%${query}%`))
  }
  const where = and(...filters)

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiVideoGenerations)
    .where(where)
  const total = totalRow?.count ?? 0
  const rows = await db
    .select()
    .from(aiVideoGenerations)
    .where(where)
    .orderBy(desc(aiVideoGenerations.createdAt))
    .offset((normalizedPage - 1) * normalizedPageSize)
    .limit(normalizedPageSize)

  return {
    generations: rows.map(serializeGeneration),
    total,
    page: normalizedPage,
    page_size: normalizedPageSize,
    total_pages: total ? Math.ceil(total / normalizedPageSize) : 0,
  }
}

export async function createUgcGeneration({
  userId,
  workspaceId,
  input,
  providerKey,
  settings,
}: {
  userId: string
  workspaceId: string
  input: UGCWorkflowInput
  providerKey: string
  settings: VideoGenerationSettings
}) {
  if (!input.consentConfirmed) {
    throw new Error("Confirm actor/reference media permission before generating.")
  }
  assertOwnedReferenceUrl(input.actorImageUrl, userId, workspaceId)
  if (input.productMediaUrl) {
    assertOwnedReferenceUrl(input.productMediaUrl, userId, workspaceId)
  }

  const module = getWorkflowModule(ugcModuleKey)
  if (!module.allowedProviders.includes(providerKey)) {
    throw new Error("Provider is not available for this workflow.")
  }

  const provider = getVideoProvider(providerKey)
  const createdAt = now()
  const [row] = await db
    .insert(aiVideoGenerations)
    .values({
      id: uuid(),
      userId,
      workspaceId,
      moduleKey: module.key,
      provider: provider.key,
      model: provider.defaultModel,
      status: "queued",
      input,
      prompt: input.prompt,
      settings,
      steps: createInitialSteps(),
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!row) {
    throw new Error("Generation was not created.")
  }

  return startProviderGeneration(row)
}

export async function retryGeneration({
  userId,
  workspaceId,
  generationId,
}: {
  userId: string
  workspaceId: string
  generationId: string
}) {
  const row = await getOwnedGeneration(userId, workspaceId, generationId)
  if (row.status !== "failed") {
    throw new Error("Only failed generations can be retried.")
  }

  await db
    .update(aiVideoGenerations)
    .set({
      status: "queued",
      steps: createInitialSteps(),
      error: null,
      providerTaskId: null,
      providerResultUrl: null,
      storagePath: null,
      updatedAt: now(),
    })
    .where(eq(aiVideoGenerations.id, row.id))

  return startProviderGeneration(await getOwnedGeneration(userId, workspaceId, generationId))
}

export async function refreshGeneration({
  userId,
  workspaceId,
  generationId,
}: {
  userId: string
  workspaceId: string
  generationId: string
}) {
  const row = await getOwnedGeneration(userId, workspaceId, generationId)
  if (row.status === "succeeded" || row.status === "failed") {
    return serializeGeneration(row)
  }
  if (!row.providerTaskId) {
    return serializeGeneration(row)
  }

  const provider = getVideoProvider(row.provider)
  const providerStatus = await provider.getGenerationStatus(row.providerTaskId)
  if (providerStatus.status === "failed") {
    const [updated] = await db
      .update(aiVideoGenerations)
      .set({
        status: "failed",
        steps: createFailedSteps(),
        error: providerStatus.error || "Video generation failed.",
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, row.id))
      .returning()
    return serializeGeneration(updated ?? row)
  }

  if (providerStatus.status !== "succeeded" || !providerStatus.resultUrl) {
    const [updated] = await db
      .update(aiVideoGenerations)
      .set({
        status: "generating",
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, row.id))
      .returning()
    return serializeGeneration(updated ?? row)
  }

  await db
    .update(aiVideoGenerations)
    .set({
      status: "saving",
      providerResultUrl: providerStatus.resultUrl,
      updatedAt: now(),
    })
    .where(eq(aiVideoGenerations.id, row.id))

  const downloaded = await provider.downloadResult(providerStatus.resultUrl)
  const storagePath = `${row.userId}/${row.workspaceId}/generations/${row.id}.${extensionForContentType(downloaded.contentType)}`
  await uploadToR2(storagePath, downloaded.data, downloaded.contentType)

  const [updated] = await db
    .update(aiVideoGenerations)
    .set({
      status: "succeeded",
      steps: createSucceededSteps(),
      providerResultUrl: providerStatus.resultUrl,
      storagePath,
      error: null,
      updatedAt: now(),
    })
    .where(eq(aiVideoGenerations.id, row.id))
    .returning()

  return serializeGeneration(updated ?? row)
}

export async function getOwnedGeneration(
  userId: string,
  workspaceId: string,
  generationId: string
) {
  const [row] = await db
    .select()
    .from(aiVideoGenerations)
    .where(
      and(
        eq(aiVideoGenerations.id, generationId),
        eq(aiVideoGenerations.userId, userId),
        eq(aiVideoGenerations.workspaceId, workspaceId)
      )
    )
    .limit(1)

  if (!row) {
    throw new Error("Generation not found.")
  }

  return row
}

export function serializeGeneration(row: AiVideoGeneration): GenerationItem {
  return {
    id: row.id,
    module_key: row.moduleKey,
    provider: row.provider,
    model: row.model,
    status: row.status as GenerationStatus,
    input: row.input,
    prompt: row.prompt,
    settings: row.settings,
    steps: row.steps,
    provider_task_id: row.providerTaskId,
    provider_result_url: row.providerResultUrl,
    video_url: row.storagePath ? getPublicMediaUrl(row.storagePath) : null,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

async function startProviderGeneration(row: AiVideoGeneration) {
  try {
    const provider = getVideoProvider(row.provider)
    const input = row.input as UGCWorkflowInput
    const result = await provider.createGeneration({
      prompt: row.prompt,
      model: row.model,
      settings: row.settings as VideoGenerationSettings,
      referenceUrls: [input.actorImageUrl, input.productMediaUrl].filter(Boolean) as string[],
    })

    const [updated] = await db
      .update(aiVideoGenerations)
      .set({
        status: result.status === "succeeded" ? "generating" : result.status,
        providerTaskId: result.providerTaskId,
        providerResultUrl: result.resultUrl,
        error: result.error ?? null,
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, row.id))
      .returning()

    return serializeGeneration(updated ?? row)
  } catch (error) {
    const [updated] = await db
      .update(aiVideoGenerations)
      .set({
        status: "failed",
        steps: createFailedSteps(),
        error: error instanceof Error ? error.message : "Video generation failed.",
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, row.id))
      .returning()

    return serializeGeneration(updated ?? row)
  }
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("webm")) return "webm"
  if (contentType.includes("quicktime")) return "mov"
  return "mp4"
}

function assertOwnedReferenceUrl(url: string, userId: string, workspaceId: string) {
  const baseUrl = process.env.AI_VIDEO_R2_PUBLIC_URL?.replace(/\/+$/, "")
  if (!baseUrl) {
    throw new Error("AI_VIDEO_R2_PUBLIC_URL is required for reference media.")
  }
  const base = new URL(baseUrl)
  const target = new URL(url)
  const basePath = base.pathname.replace(/\/+$/, "")
  const expectedPath = `${basePath}/${userId}/${workspaceId}/`.replace(/\/+/g, "/")
  if (
    target.origin !== base.origin ||
    !target.pathname.startsWith(expectedPath)
  ) {
    throw new Error("Reference media must come from the workspace media library.")
  }
}
