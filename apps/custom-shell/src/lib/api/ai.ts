import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { AI_PROVIDERS, type AiProvider } from "@/lib/ai-models"
import {
  getAiKeyStatuses,
  removeAiKey,
  setAiKey,
  testAiKey,
  type AiKeyStatus,
  type AiKeyTestResult,
} from "@/server/ai-keys"
import { requireAppOrigin } from "@/server/origin"
import { requireAdmin } from "@/server/security"

export type { AiKeyStatus, AiKeyTestResult, AiProvider }

const aiErrorMessages: Record<string, string> = {
  FORBIDDEN: "Only an admin can manage AI keys.",
  AUTH_REQUIRED: "Please sign in again.",
  ENCRYPTION_NOT_CONFIGURED:
    "The server can't store keys yet: its CUSTOM_SHELL_SECRET_ENCRYPTION_KEY setting is missing. Nothing was saved — keys are never stored unscrambled.",
  SECRET_UNREADABLE:
    "The saved key can't be read back because the server's scrambling secret changed. Paste the key again to fix it.",
  EMPTY_KEY: "Paste a key before saving.",
  NO_KEY: "There's no key to test yet — paste one first.",
}

export function getAiErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(aiErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? aiErrorMessages[matched]
    : "Something went wrong with the AI key settings. Please try again."
}

const providerSchema = z.enum(AI_PROVIDERS)

const loadAiKeyStatusesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiKeyStatus[]> => {
    await requireAdmin()
    return getAiKeyStatuses()
  }
)

export function loadAiKeyStatuses() {
  return loadAiKeyStatusesFn()
}

// Save and remove both return the fresh statuses so the card never shows a
// stale masked tail after a write.
const saveAiKeyFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      provider: providerSchema,
      // Long enough for any real provider key, short enough to reject junk.
      apiKey: z.string().min(1).max(1000),
    })
  )
  .handler(async ({ data }): Promise<AiKeyStatus[]> => {
    requireAppOrigin()
    await requireAdmin()
    await setAiKey(data.provider, data.apiKey)
    return getAiKeyStatuses()
  })

export function saveAiKey(provider: AiProvider, apiKey: string) {
  return saveAiKeyFn({ data: { provider, apiKey } })
}

const removeAiKeyFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ provider: providerSchema }))
  .handler(async ({ data }): Promise<AiKeyStatus[]> => {
    requireAppOrigin()
    await requireAdmin()
    await removeAiKey(data.provider)
    return getAiKeyStatuses()
  })

export function removeAiProviderKey(provider: AiProvider) {
  return removeAiKeyFn({ data: { provider } })
}

// POST although it changes nothing: the pasted key rides in the body, and a
// secret must never sit in a GET url that request logs would keep.
const testAiKeyFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      provider: providerSchema,
      apiKey: z.string().max(1000).optional(),
    })
  )
  .handler(async ({ data }): Promise<AiKeyTestResult> => {
    requireAppOrigin()
    await requireAdmin()
    return testAiKey(data.provider, data.apiKey)
  })

export function testAiProviderKey(provider: AiProvider, apiKey?: string) {
  return testAiKeyFn({
    data: { provider, apiKey: apiKey?.trim() ? apiKey : undefined },
  })
}
