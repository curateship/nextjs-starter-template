import { eq, sql } from "drizzle-orm"

import {
  AI_PROVIDER_NAMES,
  AI_TEXT_PROVIDERS,
  type AiTextProvider,
} from "@/lib/ai/ai-models"
import type { PnlTrade } from "@/lib/trade/pnl/patterns"
import type { PnlPeriod } from "@/lib/trade/pnl/periods"
import {
  buildScorePrompt,
  parseScoreAnswer,
  scoreTradesKey,
  type PnlScore,
} from "@/lib/trade/pnl/score"
import { getAiKey } from "@/server/ai/keys"
import { isAiLimitError, runAiCall, type AiCallUsage } from "@/server/ai/usage"
import { db } from "@/server/db"
import { loadPeriodTrades } from "@/server/trade/pnl"
import { tradePrefs } from "@/server/trade/schema"

/**
 * The AI score on the P&L page: one call per period per account, remembered
 * until a trade closes.
 *
 * Every call goes through `runAiCall`, so it lands on the AI usage dashboard
 * under "pnl-score" and stops at the monthly allowance like every other AI
 * feature. The key is whichever text provider Settings → AI holds one for,
 * tried in the order below; no key at all is an answer the card shows, never
 * an error.
 */

/** What one period's remembered answer looks like in `trade_prefs`. */
export type StoredPnlScore = {
  tradesKey: string
  score: number
  reasons: string[]
  provider: string
  model: string
  at: number
  trades: number
}

export type StoredPnlScores = Partial<Record<PnlPeriod, StoredPnlScore>>

/** Fast, cheap models: the job is a few hundred lines in and four lines out. */
const SCORE_MODEL: Record<AiTextProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5-mini",
  gemini: "gemini-2.5-flash",
}

const SCORE_TIMEOUT_MS = 20_000
const SCORE_MAX_OUTPUT_TOKENS = 400

async function pickProvider(): Promise<{
  provider: AiTextProvider
  key: string
} | null> {
  for (const provider of AI_TEXT_PROVIDERS) {
    const key = await getAiKey(provider)
    if (key) return { provider, key }
  }
  return null
}

function asTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}

/**
 * One question to one provider, in that provider's own request shape, with
 * the key in a header and never in the address. Returns the reply's words and
 * the token counts the provider reported.
 */
async function askProvider(
  provider: AiTextProvider,
  model: string,
  key: string,
  prompt: string
): Promise<{ text: string; usage: AiCallUsage }> {
  const signal = AbortSignal.timeout(SCORE_TIMEOUT_MS)
  let response: Response
  if (provider === "anthropic") {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: SCORE_MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    const payload = await readPayload(response)
    const content = payload.content as
      { type?: string; text?: string }[] | undefined
    const usage = (payload.usage ?? {}) as Record<string, unknown>
    return {
      text: (content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join(""),
      usage: {
        inputTokens: asTokenCount(usage.input_tokens),
        outputTokens: asTokenCount(usage.output_tokens),
      },
    }
  }
  if (provider === "openai") {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: SCORE_MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    const payload = await readPayload(response)
    const choices = payload.choices as
      { message?: { content?: string } }[] | undefined
    const usage = (payload.usage ?? {}) as Record<string, unknown>
    return {
      text: choices?.[0]?.message?.content ?? "",
      usage: {
        inputTokens: asTokenCount(usage.prompt_tokens),
        outputTokens: asTokenCount(usage.completion_tokens),
      },
    }
  }
  response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: SCORE_MAX_OUTPUT_TOKENS },
      }),
    }
  )
  const payload = await readPayload(response)
  const candidates = payload.candidates as
    { content?: { parts?: { text?: string }[] } }[] | undefined
  const usage = (payload.usageMetadata ?? {}) as Record<string, unknown>
  return {
    text: (candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join(""),
    usage: {
      inputTokens: asTokenCount(usage.promptTokenCount),
      outputTokens: asTokenCount(usage.candidatesTokenCount),
    },
  }
}

async function readPayload(
  response: Response
): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`AI_STATUS_${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

async function loadStoredScores(userId: string): Promise<StoredPnlScores> {
  const [row] = await db
    .select({ pnlScores: tradePrefs.pnlScores })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row?.pnlScores ?? {}
}

async function storeScore(
  userId: string,
  period: PnlPeriod,
  score: StoredPnlScore
): Promise<void> {
  const patch: StoredPnlScores = { [period]: score }
  await db
    .insert(tradePrefs)
    .values({ userId, pnlScores: patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        updatedAt: new Date(),
        // Merged into what is there, so scoring this month never forgets
        // this week's answer.
        pnlScores: sql`coalesce(${tradePrefs.pnlScores}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      },
    })
}

function shown(stored: StoredPnlScore): PnlScore {
  return {
    state: "scored",
    score: stored.score,
    reasons: stored.reasons,
    provider: stored.provider,
    model: stored.model,
    at: stored.at,
    trades: stored.trades,
  }
}

/**
 * The period's score: the remembered one when the same closed trades are
 * still the period's trades, otherwise a fresh call, remembered for next time.
 */
export async function loadPnlScore(
  userId: string,
  period: PnlPeriod
): Promise<PnlScore> {
  const trades: PnlTrade[] = await loadPeriodTrades(userId, period)
  if (trades.length === 0) return { state: "no-trades" }
  const tradesKey = scoreTradesKey(trades)
  const stored = (await loadStoredScores(userId))[period]
  if (stored && stored.tradesKey === tradesKey) return shown(stored)

  const picked = await pickProvider()
  if (!picked) return { state: "no-key" }
  const model = SCORE_MODEL[picked.provider]
  const prompt = buildScorePrompt(trades, period)

  let text: string
  try {
    text = await runAiCall(
      {
        userId,
        provider: picked.provider,
        model,
        feature: "pnl-score",
        metadata: { period, trades: trades.length },
      },
      async () => {
        const answer = await askProvider(
          picked.provider,
          model,
          picked.key,
          prompt
        )
        return { result: answer.text, usage: answer.usage }
      }
    )
  } catch (error) {
    if (isAiLimitError(error)) {
      return {
        state: "failed",
        message:
          "This month's AI allowance is used up, so no score was asked for.",
      }
    }
    const reason = error instanceof Error ? error.message : String(error)
    return {
      state: "failed",
      message: reason.startsWith("AI_STATUS_")
        ? `${AI_PROVIDER_NAMES[picked.provider]} answered with an error (${reason.slice("AI_STATUS_".length)}).`
        : reason.includes("abort") || reason.includes("timeout")
          ? `${AI_PROVIDER_NAMES[picked.provider]} did not answer in time.`
          : `${AI_PROVIDER_NAMES[picked.provider]} could not be reached.`,
    }
  }

  const parsed = parseScoreAnswer(text)
  if (!parsed) {
    return {
      state: "failed",
      message: `${AI_PROVIDER_NAMES[picked.provider]} answered, but not with a score. Try again.`,
    }
  }
  const fresh: StoredPnlScore = {
    tradesKey,
    score: parsed.score,
    reasons: parsed.reasons,
    provider: AI_PROVIDER_NAMES[picked.provider],
    model,
    at: Date.now(),
    trades: trades.length,
  }
  await storeScore(userId, period, fresh)
  return shown(fresh)
}
