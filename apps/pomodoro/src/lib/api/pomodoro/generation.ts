import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import { loadAccountStorage } from "@/server/media/library"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { generationKeysConfigured } from "@/server/pomodoro/generation-providers"
import {
  listGenerations,
  loadGenerationAllowance,
  queueGeneration,
  reserveGenerationCredit,
  type GenerationRow,
} from "@/server/pomodoro/generation"
import {
  PROMPT_MAX_LENGTH,
  PROMPT_MIN_LENGTH,
  type GenerationKind,
} from "@/lib/pomodoro/generation"

export type { GenerationRow }

/** What the generator panel needs to draw itself. */
export type GenerationPanel = {
  generations: GenerationRow[]
  /** How many of this kind the plan allows each month; 0 means not allowed. */
  limit: number
  left: number
  /** The provider has a key. Without one the panel says so before you type. */
  providerReady: boolean
}

export const getGenerationErrorMessage = createErrorMessage(
  {
    GENERATION_NOT_ALLOWED:
      "AI generation is a Pro perk. Upgrade to make your own.",
    GENERATION_LIMIT_REACHED:
      "You have used this month's AI generations. You get a fresh batch on the first.",
    PROVIDER_NOT_CONFIGURED:
      "AI generation is not set up on this server yet. An operator needs to add the provider key under Settings → AI.",
    STORAGE_QUOTA_EXCEEDED:
      "Your storage is full, and a generated file needs somewhere to go. Delete something you no longer use and try again.",
    RATE_LIMITED:
      "That is a lot of requests at once. Please wait a few minutes and try again.",
  },
  "That request did not go through. Please try again."
)

const kindSchema = z.enum(["background", "soundscape"])

const panelFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ kind: kindSchema }))
  .handler(async ({ data, context }): Promise<GenerationPanel> => {
    const [generations, allowance, keys] = await Promise.all([
      listGenerations(context.user.id, data.kind),
      loadGenerationAllowance(context.user.id, data.kind),
      generationKeysConfigured(),
    ])
    return {
      generations,
      limit: allowance.limit,
      left: allowance.left,
      providerReady: keys[data.kind],
    }
  })

const requestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      kind: kindSchema,
      prompt: z.string().trim().min(PROMPT_MIN_LENGTH).max(PROMPT_MAX_LENGTH),
    })
  )
  .handler(async ({ data, context }) => {
    // The key first, so a server with nothing configured says so plainly
    // instead of taking a credit and failing a minute later.
    const keys = await generationKeysConfigured()
    if (!keys[data.kind]) throw new Error("PROVIDER_NOT_CONFIGURED")

    const { limit } = await loadGenerationAllowance(context.user.id, data.kind)
    if (limit <= 0) throw new Error("GENERATION_NOT_ALLOWED")

    // The finished file lands in the same bucket an upload does, so the same
    // 2 GB cap applies. Checked here rather than in the worker, because a
    // member who is full should be told now and not charged a credit for a
    // file that has nowhere to go.
    const [entitlements, storage] = await Promise.all([
      loadPomodoroEntitlements(context.user.id),
      loadAccountStorage(context.user.id),
    ])
    if (storage.bytes >= entitlements.storageLimitBytes) {
      throw new Error("STORAGE_QUOTA_EXCEEDED")
    }

    // After the plan check, so somebody who may not generate at all cannot
    // spend a paying member's share of the limiter.
    await enforceRateLimit(`pomodoro-generate:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 10 * 60,
    })

    const { month, left } = await reserveGenerationCredit(
      context.user.id,
      data.kind,
      limit
    )
    const job = await queueGeneration({
      userId: context.user.id,
      kind: data.kind,
      prompt: data.prompt,
      month,
    })

    return { id: job.id, left }
  })

export const loadGenerationPanel = (kind: GenerationKind) =>
  panelFn({ data: { kind } })

export const requestGeneration = (kind: GenerationKind, prompt: string) =>
  requestFn({ data: { kind, prompt } })
