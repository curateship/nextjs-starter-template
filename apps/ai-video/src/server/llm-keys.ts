import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  looksEncrypted,
} from "@/server/encryption"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoLlmApiKeys } from "@/server/schema"
import { now, requireAdminUser } from "@/server/security"

// The providers whose keys the workspace can configure. ElevenLabs isn't an
// LLM but reuses this same key store/settings UI for its voice-generation key.
const LLM_PROVIDERS = ["openai", "claude", "gemini", "elevenlabs"] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]

// Env var that backs each provider when no key is saved in settings. Settings
// take precedence so a saved key overrides the deployment's env var.
const ENV_VAR: Record<LlmProvider, string> = {
  openai: "AI_VIDEO_OPENAI_API_KEY",
  claude: "AI_VIDEO_ANTHROPIC_API_KEY",
  gemini: "AI_VIDEO_GEMINI_API_KEY",
  elevenlabs: "AI_VIDEO_ELEVENLABS_API_KEY",
}

// What the settings UI is allowed to know about a key: that it exists, where it
// comes from, and a masked tail — never the raw key.
export type LlmKeyStatus = {
  provider: LlmProvider
  configured: boolean
  maskedKey: string | null
  source: "settings" | "env" | null
}

// Resolves a provider's key (saved key wins, else the env var). SERVER ONLY —
// the result is a live secret and must never reach the client.
export async function getLlmKey(provider: LlmProvider): Promise<string | null> {
  const [row] = await db
    .select()
    .from(aiVideoLlmApiKeys)
    .where(eq(aiVideoLlmApiKeys.provider, provider))
    .limit(1)
  if (row?.apiKey) {
    const key = readStoredKey(row.apiKey)
    if (key) return key
    // Encrypted but unreadable (key missing/rotated) — fall back to the env var.
  }
  return process.env[ENV_VAR[provider]] || null
}

// Reads a stored value: decrypts if it's in encrypted form, otherwise treats it
// as legacy/plaintext (deployments with no encryption key configured).
function readStoredKey(stored: string): string | null {
  if (looksEncrypted(stored)) return decryptSecret(stored)
  return stored
}

// Shows only the last 4 characters so the UI can confirm which key is set
// without exposing it.
function maskKey(key: string): string {
  return `••••••••${key.slice(-4)}`
}

// Per-provider status for the settings UI. Admin-only: managing workspace keys
// is an admin action, like the rest of Settings.
export async function getLlmKeyStatusForCurrentUser(): Promise<LlmKeyStatus[]> {
  await requireAdminUser()
  const rows = await db.select().from(aiVideoLlmApiKeys)
  const saved = new Map(rows.map((row) => [row.provider as LlmProvider, row.apiKey]))

  return LLM_PROVIDERS.map((provider) => {
    const stored = saved.get(provider)
    if (stored) {
      const key = readStoredKey(stored)
      return {
        provider,
        configured: true,
        maskedKey: key ? maskKey(key) : null,
        source: "settings" as const,
      }
    }
    const envKey = process.env[ENV_VAR[provider]]
    if (envKey) {
      return {
        provider,
        configured: true,
        maskedKey: maskKey(envKey),
        source: "env" as const,
      }
    }
    return { provider, configured: false, maskedKey: null, source: null }
  })
}

// Saves a provider's key (encrypted at rest when an encryption key is
// configured), or removes it when given an empty string. Admin-only.
export async function setLlmKeyForCurrentUser(
  provider: LlmProvider,
  apiKey: string
): Promise<void> {
  requireAppOrigin()
  await requireAdminUser()

  // Strip surrounding whitespace/newlines from pasted keys (saved value only,
  // not live typing).
  const trimmed = apiKey.trim()
  if (!trimmed) {
    await db.delete(aiVideoLlmApiKeys).where(eq(aiVideoLlmApiKeys.provider, provider))
    return
  }

  const stored = isEncryptionConfigured() ? encryptSecret(trimmed) : trimmed
  const ts = now()
  await db
    .insert(aiVideoLlmApiKeys)
    .values({ provider, apiKey: stored, createdAt: ts, updatedAt: ts })
    .onConflictDoUpdate({
      target: aiVideoLlmApiKeys.provider,
      set: { apiKey: stored, updatedAt: ts },
    })
}
