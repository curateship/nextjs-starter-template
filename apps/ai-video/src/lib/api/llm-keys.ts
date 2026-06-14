import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { LlmKeyStatus, LlmProvider } from "@/server/llm-keys"

export type { LlmKeyStatus, LlmProvider }

const providerSchema = z.enum(["openai", "claude", "gemini", "elevenlabs"])

const getStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<LlmKeyStatus[]> => {
    const { getLlmKeyStatusForCurrentUser } = await import("@/server/llm-keys")
    return getLlmKeyStatusForCurrentUser()
  }
)

const setKeyFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ provider: providerSchema, apiKey: z.string().max(500) })
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { setLlmKeyForCurrentUser } = await import("@/server/llm-keys")
    await setLlmKeyForCurrentUser(data.provider, data.apiKey)
    return { ok: true }
  })

export function getLlmKeyStatus() {
  return getStatusFn()
}

export function setLlmKey(provider: LlmProvider, apiKey: string) {
  return setKeyFn({ data: { provider, apiKey } })
}

export function getLlmKeyErrorMessage() {
  return "Could not update the API key."
}
