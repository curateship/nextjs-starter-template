import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

import {
  AI_PROVIDERS,
  AI_USAGE_RANGES,
  type AiProvider,
  type AiUsageRange,
} from "@/lib/ai-models"
import {
  getAiKeyStatuses,
  removeAiKey,
  setAiKey,
  testAiKey,
  type AiKeyStatus,
  type AiKeyTestResult,
} from "@/server/ai/keys"
import {
  loadAiUsageDashboard as loadAiUsageDashboardQuery,
  loadMyAiUsage as loadMyAiUsageQuery,
  setAiAllowanceOverride,
  type AiUsageDashboard,
  type AiUsagePersonRow,
  type MyAiRecentCall,
  type MyAiUsage,
} from "@/server/ai/usage"
import { adminGet, adminPost, userGet } from "@/server/guards"

export { AI_USAGE_RANGES }
export type {
  AiKeyStatus,
  AiKeyTestResult,
  AiProvider,
  AiUsageDashboard,
  AiUsagePersonRow,
  AiUsageRange,
  MyAiRecentCall,
  MyAiUsage,
}

export const getAiErrorMessage = createErrorMessage(
  {
    FORBIDDEN: "Only an admin can manage AI keys.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server can't store keys yet: its CUSTOM_SHELL_SECRET_ENCRYPTION_KEY setting is missing. Nothing was saved — keys are never stored unscrambled.",
    SECRET_UNREADABLE:
      "The saved key can't be read back because the server's scrambling secret changed. Paste the key again to fix it.",
    EMPTY_KEY: "Paste a key before saving.",
    NO_KEY: "There's no key to test yet — paste one first.",
    AI_LIMIT_REACHED:
      "This month's AI allowance is used up. It starts fresh on the 1st.",
  },
  "We could not load or save the AI settings. Please try again."
)

const loadAiUsageDashboardFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ range: z.enum(AI_USAGE_RANGES) }))
  .handler(async ({ data }): Promise<AiUsageDashboard> => {
    return loadAiUsageDashboardQuery(data.range)
  })

export function loadAiUsageDashboard(range: AiUsageRange) {
  return loadAiUsageDashboardFn({ data: { range } })
}

const providerSchema = z.enum(AI_PROVIDERS)

const loadAiKeyStatusesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<AiKeyStatus[]> => {
    return getAiKeyStatuses()
  })

export function loadAiKeyStatuses() {
  return loadAiKeyStatusesFn()
}

// Save and remove both return the fresh statuses so the card never shows a
// stale masked tail after a write.
const saveAiKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      provider: providerSchema,
      // Long enough for any real provider key, short enough to reject junk.
      apiKey: z.string().min(1).max(1000),
    })
  )
  .handler(async ({ data }): Promise<AiKeyStatus[]> => {
    await setAiKey(data.provider, data.apiKey)
    return getAiKeyStatuses()
  })

export function saveAiKey(provider: AiProvider, apiKey: string) {
  return saveAiKeyFn({ data: { provider, apiKey } })
}

const removeAiKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ provider: providerSchema }))
  .handler(async ({ data }): Promise<AiKeyStatus[]> => {
    await removeAiKey(data.provider)
    return getAiKeyStatuses()
  })

export function removeAiProviderKey(provider: AiProvider) {
  return removeAiKeyFn({ data: { provider } })
}

// POST although it changes nothing: the pasted key rides in the body, and a
// secret must never sit in a GET url that request logs would keep.
const testAiKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      provider: providerSchema,
      apiKey: z.string().max(1000).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<AiKeyTestResult> => {
    return testAiKey(data.provider, context.user.id, data.apiKey)
  })

export function testAiProviderKey(provider: AiProvider, apiKey?: string) {
  return testAiKeyFn({
    data: { provider, apiKey: apiKey?.trim() ? apiKey : undefined },
  })
}

// Setting one person's own AI ceiling. Admin-only: the ceiling decides what
// an account can spend. There is no read twin — the accounts list and the
// account page already carry the override on their rows.
const saveAiAllowanceOverrideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      // Cents so nothing downstream rounds; null takes the override away.
      monthlyCents: z.number().int().min(0).max(100_000_000).nullable(),
    })
  )
  .handler(async ({ data }): Promise<void> => {
    await setAiAllowanceOverride(data.userId, data.monthlyCents)
  })

export function saveAiAllowanceOverride(
  userId: string,
  monthlyCents: number | null
) {
  return saveAiAllowanceOverrideFn({ data: { userId, monthlyCents } })
}

// The signed-in person's own usage. The ordinary member guard, and no input
// at all: the account it reads is the one the session says, so a hand-made
// request cannot name somebody else.
const loadMyAiUsageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<MyAiUsage> => {
    return loadMyAiUsageQuery(context.user.id)
  })

export function loadMyAiUsage() {
  return loadMyAiUsageFn()
}
