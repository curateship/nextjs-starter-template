import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/encryption"
import { customShellAiProviderKeys } from "@/server/schema"
import { now } from "@/server/security"

// The app-wide AI provider key store. Auth lives in the API layer
// (src/lib/api/ai.ts): every caller there is behind requireAdmin, and the
// writes behind requireAppOrigin, matching how the other stores are guarded.

export const AI_PROVIDERS = ["anthropic", "openai"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

// Env var that backs each provider when no key is saved in Settings. A saved
// key always wins, so an admin can override the deployment's key from the UI.
const ENV_VAR: Record<AiProvider, string> = {
  anthropic: "CUSTOM_SHELL_ANTHROPIC_API_KEY",
  openai: "CUSTOM_SHELL_OPENAI_API_KEY",
}

/**
 * What the settings UI is allowed to know about a key: that it exists, where
 * it comes from, and a masked tail — never the key itself.
 */
export type AiKeyStatus = {
  provider: AiProvider
  configured: boolean
  maskedKey: string | null
  source: "settings" | "env" | null
  /**
   * A row exists but can no longer be unscrambled — the server's
   * CUSTOM_SHELL_SECRET_ENCRYPTION_KEY changed or went missing. The fix is
   * pasting the key again, and the UI says so instead of crashing the page.
   */
  unreadable: boolean
}

/**
 * Resolves the key AI features call the provider with. A saved key is
 * authoritative; if it cannot be decrypted this throws instead of silently
 * falling back to the env var. SERVER ONLY — the result is a live secret and
 * must never be returned to the browser.
 */
export async function getAiKey(provider: AiProvider): Promise<string | null> {
  const [row] = await db
    .select()
    .from(customShellAiProviderKeys)
    .where(eq(customShellAiProviderKeys.provider, provider))
    .limit(1)
  if (row?.apiKey) {
    return decryptSecret(row.apiKey)
  }
  return process.env[ENV_VAR[provider]] || null
}

/** Only the last 4 characters, enough to recognise which key is set. */
function maskKey(key: string): string {
  return `••••${key.slice(-4)}`
}

export async function getAiKeyStatuses(): Promise<AiKeyStatus[]> {
  const rows = await db.select().from(customShellAiProviderKeys)
  const saved = new Map(
    rows.map((row) => [row.provider as AiProvider, row.apiKey])
  )

  return AI_PROVIDERS.map((provider) => {
    const stored = saved.get(provider)
    if (stored) {
      try {
        return {
          provider,
          configured: true,
          maskedKey: maskKey(decryptSecret(stored)),
          source: "settings" as const,
          unreadable: false,
        }
      } catch {
        return {
          provider,
          configured: false,
          maskedKey: null,
          source: "settings" as const,
          unreadable: true,
        }
      }
    }
    const envKey = process.env[ENV_VAR[provider]]
    if (envKey) {
      return {
        provider,
        configured: true,
        maskedKey: maskKey(envKey),
        source: "env" as const,
        unreadable: false,
      }
    }
    return {
      provider,
      configured: false,
      maskedKey: null,
      source: null,
      unreadable: false,
    }
  })
}

/**
 * Saves a provider's key encrypted at rest. Throws ENCRYPTION_NOT_CONFIGURED
 * (from `encryptSecret`) rather than ever storing plain text.
 */
export async function setAiKey(
  provider: AiProvider,
  apiKey: string
): Promise<void> {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error("EMPTY_KEY")

  const stored = encryptSecret(trimmed)
  const ts = now()
  await db
    .insert(customShellAiProviderKeys)
    .values({ provider, apiKey: stored, createdAt: ts, updatedAt: ts })
    .onConflictDoUpdate({
      target: customShellAiProviderKeys.provider,
      set: { apiKey: stored, updatedAt: ts },
    })
}

/** Deletes the saved row; the provider falls back to its env var, if any. */
export async function removeAiKey(provider: AiProvider): Promise<void> {
  await db
    .delete(customShellAiProviderKeys)
    .where(eq(customShellAiProviderKeys.provider, provider))
}

/**
 * The four ways a key test can end. "rejected" and "unreachable" are verdicts
 * the UI words for the user, not errors; "error" carries the provider's HTTP
 * status because "it broke" without the number is undebuggable.
 */
export type AiKeyTestResult =
  | { result: "ok" }
  | { result: "rejected" }
  | { result: "unreachable" }
  | { result: "error"; status: number }

// The cheapest real authenticated call each provider has: list models. It
// proves the key without spending tokens.
const TEST_REQUEST: Record<AiProvider, { url: string; headers: (key: string) => Record<string, string> }> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models?limit=1",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
}

/**
 * Makes one tiny real call with `candidateKey` if given (a pasted key being
 * checked before saving), otherwise with the saved/env key. Throws NO_KEY when
 * there is nothing to test.
 */
export async function testAiKey(
  provider: AiProvider,
  candidateKey?: string
): Promise<AiKeyTestResult> {
  const key = candidateKey?.trim() || (await getAiKey(provider))
  if (!key) throw new Error("NO_KEY")

  const request = TEST_REQUEST[provider]
  let response: Response
  try {
    response = await fetch(request.url, {
      headers: request.headers(key),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { result: "unreachable" }
  }

  if (response.ok) return { result: "ok" }
  if (response.status === 401 || response.status === 403) {
    return { result: "rejected" }
  }
  return { result: "error", status: response.status }
}
