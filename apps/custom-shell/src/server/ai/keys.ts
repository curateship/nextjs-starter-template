import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { customShellAiProviderKeys } from "@/server/schema"
import { now } from "@/server/auth/security"

import {
  AI_KEY_TEST_MODEL,
  AI_PROVIDERS,
  type AiProvider,
} from "@/lib/ai-models"
import { runAiCall, type AiCallUsage } from "@/server/ai/usage"

// The app-wide AI provider key store. Auth lives in the API layer
// (src/lib/api/ai.ts): every caller there is behind requireAdmin, and the
// writes behind requireAppOrigin, matching how the other stores are guarded.
// The provider list itself lives in src/lib/ai-models.ts, shared with the UI.

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

/** A test verdict travelling as a throw, so `runAiCall` records a failed row. */
class AiKeyTestFailure extends Error {
  readonly verdict: AiKeyTestResult

  constructor(verdict: AiKeyTestResult) {
    super(`AI key test: ${verdict.result}`)
    this.verdict = verdict
  }
}

// One tiny real generation per provider — a couple of tokens on the cheapest
// model — so the test proves the key the way real features will use it, and
// puts a genuine row on the usage meter.
const TEST_CALL: Record<
  AiProvider,
  {
    url: string
    headers: (key: string) => Record<string, string>
    body: (model: string) => string
    usage: (payload: Record<string, unknown>) => AiCallUsage
  }
> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    }),
    body: (model) =>
      JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "Say OK." }],
      }),
    usage: (payload) => {
      const usage = (payload.usage ?? {}) as Record<string, unknown>
      return {
        inputTokens: asTokenCount(usage.input_tokens),
        outputTokens: asTokenCount(usage.output_tokens),
      }
    },
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    }),
    body: (model) =>
      JSON.stringify({
        model,
        max_completion_tokens: 16,
        messages: [{ role: "user", content: "Say OK." }],
      }),
    usage: (payload) => {
      const usage = (payload.usage ?? {}) as Record<string, unknown>
      return {
        inputTokens: asTokenCount(usage.prompt_tokens),
        outputTokens: asTokenCount(usage.completion_tokens),
      }
    },
  },
}

/** A provider's token count, or 0 when the response shape surprises us. */
function asTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}

/**
 * Makes one tiny real call with `candidateKey` if given (a pasted key being
 * checked before saving), otherwise with the saved/env key. Throws NO_KEY when
 * there is nothing to test. Runs through `runAiCall`, so every press of the
 * button — good key or bad — lands on the usage meter under "key-test".
 */
export async function testAiKey(
  provider: AiProvider,
  userId: string,
  candidateKey?: string
): Promise<AiKeyTestResult> {
  const key = candidateKey?.trim() || (await getAiKey(provider))
  if (!key) throw new Error("NO_KEY")

  const model = AI_KEY_TEST_MODEL[provider]
  const request = TEST_CALL[provider]
  try {
    return await runAiCall<AiKeyTestResult>(
      {
        userId,
        provider,
        model,
        feature: "key-test",
        metadata: { source: candidateKey?.trim() ? "pasted" : "saved" },
      },
      async () => {
        let response: Response
        try {
          response = await fetch(request.url, {
            method: "POST",
            headers: request.headers(key),
            body: request.body(model),
            signal: AbortSignal.timeout(15_000),
          })
        } catch {
          throw new AiKeyTestFailure({ result: "unreachable" })
        }
        if (response.status === 401 || response.status === 403) {
          throw new AiKeyTestFailure({ result: "rejected" })
        }
        if (!response.ok) {
          throw new AiKeyTestFailure({
            result: "error",
            status: response.status,
          })
        }
        const payload = (await response.json()) as Record<string, unknown>
        return { result: { result: "ok" }, usage: request.usage(payload) }
      }
    )
  } catch (error) {
    // A bad key or an unreachable provider is the test's answer, not a crash
    // — the failed row is already on the meter; hand the verdict back.
    if (error instanceof AiKeyTestFailure) return error.verdict
    throw error
  }
}
