import { vapiProvider } from "@/server/providers/vapi"
import type { VoiceProvider } from "@/server/providers/types"

// One switch statement when a second provider (Retell, Bland) arrives.
export function getVoiceProvider(): VoiceProvider {
  return vapiProvider
}

// True when the active provider has credentials. Agent saves stay local-only
// until this is true; test calls and campaigns require it.
export function isVoiceProviderConfigured(): boolean {
  return Boolean(process.env.AI_AGENTS_VAPI_API_KEY)
}

// Public webhook endpoint attached to synced assistants. Undefined in local
// dev (no public URL) — polling covers call updates there.
export function getProviderWebhookUrl(): string | undefined {
  const base = process.env.AI_AGENTS_PUBLIC_URL
  if (!base) return undefined
  return `${base.replace(/\/+$/, "")}/api/v1/vapi/webhook`
}
