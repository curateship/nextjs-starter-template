import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  createUgcGeneration,
  getOwnedGeneration,
  listWorkspaceGenerations,
  refreshGeneration,
  retryGeneration,
  serializeGeneration,
  type GenerationItem,
  type GenerationListResponse,
  type GenerationStatus,
} from "@/server/ai-video/generations"
import { writeUgcPromptDraft, type UGCPromptDraft } from "@/server/ai-video/prompt-writer"
import {
  ugcModuleKey,
  ugcWorkflow,
  type UGCWorkflowInput,
  type VideoGenerationSettings,
} from "@/server/ai-video/workflows"
import { requireAppOrigin } from "@/server/origin"
import { findCurrentUser } from "@/server/security"

export type {
  GenerationItem,
  GenerationListResponse,
  GenerationStatus,
  UGCPromptDraft,
  UGCWorkflowInput,
  VideoGenerationSettings,
}

const promptDraftSchema = z.object({
  actorImageUrl: z.string().min(1),
  actorNotes: z.string().optional(),
  productName: z.string().min(1).max(255),
  audience: z.string().min(1).max(500),
  offer: z.string().min(1).max(500),
  productNotes: z.string().optional(),
  productMediaUrl: z.string().optional(),
  hook: z.string().optional(),
  voiceTone: z.string().min(1).max(255),
})

const settingsSchema = z.object({
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
  durationSeconds: z.number().int().min(4).max(30),
  resolution: z.enum(["720p", "1080p"]),
  nativeAudio: z.boolean(),
})

const ugcInputSchema = promptDraftSchema.extend({
  hook: z.string().optional(),
  script: z.string().min(1).max(6000),
  prompt: z.string().min(1).max(6000),
  consentConfirmed: z.boolean(),
})

const createGenerationSchema = z.object({
  input: ugcInputSchema,
  provider: z.enum(["seedance"]),
  settings: settingsSchema,
})

const listGenerationsSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    status: z
      .enum([
        "all",
        "draft",
        "queued",
        "writing_prompt",
        "generating",
        "saving",
        "succeeded",
        "failed",
      ])
      .optional(),
    search: z.string().optional(),
  })
  .optional()

const generationIdSchema = z.object({
  generationId: z.string().min(1),
})

export function getGenerationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Generation request failed."
}

const draftUgcPromptFn = createServerFn({ method: "POST" })
  .inputValidator(promptDraftSchema)
  .handler(async ({ data }): Promise<UGCPromptDraft> => {
    requireAppOrigin()
    await requireUser()
    return writeUgcPromptDraft(data)
  })

const createGenerationFn = createServerFn({ method: "POST" })
  .inputValidator(createGenerationSchema)
  .handler(async ({ data }): Promise<GenerationItem> => {
    requireAppOrigin()
    const user = await requireUser()
    const workspace = await requireWorkspace(user.id)
    return createUgcGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      input: data.input,
      providerKey: data.provider,
      settings: data.settings,
    })
  })

const listGenerationsFn = createServerFn({ method: "GET" })
  .inputValidator(listGenerationsSchema)
  .handler(async ({ data }): Promise<GenerationListResponse> => {
    const user = await requireUser()
    const workspace = await requireWorkspace(user.id)
    return listWorkspaceGenerations({
      userId: user.id,
      workspaceId: workspace.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 20,
      status: data?.status ?? "all",
      search: data?.search,
    })
  })

const refreshGenerationFn = createServerFn({ method: "POST" })
  .inputValidator(generationIdSchema)
  .handler(async ({ data }): Promise<GenerationItem> => {
    requireAppOrigin()
    const user = await requireUser()
    const workspace = await requireWorkspace(user.id)
    return refreshGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      generationId: data.generationId,
    })
  })

const retryGenerationFn = createServerFn({ method: "POST" })
  .inputValidator(generationIdSchema)
  .handler(async ({ data }): Promise<GenerationItem> => {
    requireAppOrigin()
    const user = await requireUser()
    const workspace = await requireWorkspace(user.id)
    return retryGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      generationId: data.generationId,
    })
  })

const loadGenerationFn = createServerFn({ method: "GET" })
  .inputValidator(generationIdSchema)
  .handler(async ({ data }): Promise<GenerationItem> => {
    const user = await requireUser()
    const workspace = await requireWorkspace(user.id)
    const generation = await getOwnedGeneration(
      user.id,
      workspace.id,
      data.generationId
    )
    return serializeGeneration(generation)
  })

export function getUgcWorkflow() {
  return ugcWorkflow
}

export function draftUgcPrompt(input: z.infer<typeof promptDraftSchema>) {
  return draftUgcPromptFn({ data: input })
}

export function createGeneration(data: z.infer<typeof createGenerationSchema>) {
  return createGenerationFn({ data })
}

export function listGenerations(data: z.infer<typeof listGenerationsSchema> = {}) {
  return listGenerationsFn({ data })
}

export function refreshGenerationStatus(generationId: string) {
  return refreshGenerationFn({ data: { generationId } })
}

export function retryFailedGeneration(generationId: string) {
  return retryGenerationFn({ data: { generationId } })
}

export function loadGeneration(generationId: string) {
  return loadGenerationFn({ data: { generationId } })
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
  }
  return user
}

async function requireWorkspace(userId: string) {
  const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
  return getOrCreateCurrentWorkspace(userId)
}

export const activeModuleKey = ugcModuleKey
