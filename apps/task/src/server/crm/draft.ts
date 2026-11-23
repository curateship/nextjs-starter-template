import {
  AI_TEXT_PROVIDERS,
  DEFAULT_AI_MODEL,
  type AiTextProvider,
} from "@/lib/ai/ai-models"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall, type AiCallUsage } from "@/server/ai/usage"
import { db, type CustomShellDb } from "@/server/db"
import { messageSnippet } from "@/lib/crm/message-text"
import { getThread, listThreadMessages } from "@/server/crm/inbox"
import { getLead } from "@/server/crm/leads"

/** Said when no text AI provider has a key saved, so there is nothing to ask. */
export const CRM_NO_AI_KEY = "CRM_NO_AI_KEY"

/** Said when the conversation is not this workspace's. */
export const CRM_THREAD_NOT_FOUND = "CRM_THREAD_NOT_FOUND"

/** Said when the provider answered with something that is not a draft. */
export const CRM_DRAFT_FAILED = "CRM_DRAFT_FAILED"

/** How long a draft may be. Enough for a real answer, short of an essay. */
const MAX_DRAFT_TOKENS = 700

/** How much of the conversation is sent. The newest mail matters most. */
const HISTORY_MESSAGES = 8

/** How much of one message is sent, in characters. */
const MESSAGE_LENGTH = 2000

/**
 * The first text provider with a key saved, in the order they are listed.
 *
 * Whichever one is set up gets the work. There is no CRM setting for it on
 * purpose: a second place to choose a model is a second place for it to be
 * wrong, and the keys screen is already the one place that knows.
 */
async function firstProviderWithAKey(): Promise<AiTextProvider | null> {
  for (const provider of AI_TEXT_PROVIDERS) {
    if (await getAiKey(provider)) return provider
  }
  return null
}

type Generated = { text: string; usage: AiCallUsage }

function tokens(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}

/**
 * One prompt, one answer, from whichever provider has a key.
 *
 * Three shapes rather than one SDK each, the same reasoning as the key test
 * beside it in `server/ai/keys.ts`: these are three HTTP calls and a
 * dependency per provider buys nothing.
 */
async function generate(
  provider: AiTextProvider,
  model: string,
  key: string,
  system: string,
  prompt: string
): Promise<Generated> {
  const signal = AbortSignal.timeout(60_000)

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_DRAFT_TOKENS,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal,
    })
    const payload = (await response.json().catch(() => null)) as {
      content?: { type?: string; text?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    } | null
    if (!response.ok || !payload) throw new Error(CRM_DRAFT_FAILED)

    const text = (payload.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
      .trim()
    return {
      text,
      usage: {
        inputTokens: tokens(payload.usage?.input_tokens),
        outputTokens: tokens(payload.usage?.output_tokens),
      },
    }
  }

  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: MAX_DRAFT_TOKENS,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal,
    })
    const payload = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    } | null
    if (!response.ok || !payload) throw new Error(CRM_DRAFT_FAILED)

    return {
      text: (payload.choices?.[0]?.message?.content ?? "").trim(),
      usage: {
        inputTokens: tokens(payload.usage?.prompt_tokens),
        outputTokens: tokens(payload.usage?.completion_tokens),
      },
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: MAX_DRAFT_TOKENS },
      }),
      signal,
    }
  )
  const payload = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  } | null
  if (!response.ok || !payload) throw new Error(CRM_DRAFT_FAILED)

  return {
    text: (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim(),
    usage: {
      inputTokens: tokens(payload.usageMetadata?.promptTokenCount),
      outputTokens: tokens(payload.usageMetadata?.candidatesTokenCount),
    },
  }
}

const SYSTEM_PROMPT = [
  "You are drafting a reply to a business email on behalf of the person who received it.",
  "Write only the body of the reply. No subject line, no greeting placeholder like [Name], no signature block.",
  "Match the sender's tone and length. Answer what they actually asked.",
  "Never invent a price, a date, a delivery time or a fact that is not in the conversation.",
  "Where something is unknown, say plainly that you will confirm it, rather than guessing.",
  "Plain sentences. No marketing language.",
].join(" ")

/**
 * A first draft of a reply to one conversation.
 *
 * It is a draft: it lands in the box for somebody to read and change, and
 * nothing is ever sent by this. The whole call rides `runAiCall`, so the
 * allowance is checked before it and the spend is metered after it, exactly
 * like every other AI feature.
 */
export async function draftCrmReply(
  workspaceId: string,
  threadId: string,
  userId: string,
  database: CustomShellDb = db
): Promise<string> {
  const thread = await getThread(workspaceId, threadId, database)
  if (!thread) throw new Error(CRM_THREAD_NOT_FOUND)

  const provider = await firstProviderWithAKey()
  if (!provider) throw new Error(CRM_NO_AI_KEY)
  const key = await getAiKey(provider)
  if (!key) throw new Error(CRM_NO_AI_KEY)

  const [lead, messages] = await Promise.all([
    getLead(workspaceId, thread.leadId, database),
    listThreadMessages(workspaceId, threadId, database),
  ])

  const recent = messages.slice(-HISTORY_MESSAGES)
  const transcript = recent
    .map((message) => {
      const who = message.direction === "in" ? "Them" : "Us"
      const body =
        message.textBody?.trim() ||
        messageSnippet(message.textBody, message.htmlBody) ||
        "(no readable body)"
      return `${who} (${message.occurredAt.toISOString().slice(0, 10)}):\n${body.slice(0, MESSAGE_LENGTH)}`
    })
    .join("\n\n")

  const about = [
    `Subject: ${thread.subject || "(none)"}`,
    lead?.name ? `Their name: ${lead.name}` : null,
    lead?.company ? `Their company: ${lead.company}` : null,
    lead ? `Where they are up to: ${lead.stage}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const model = DEFAULT_AI_MODEL[provider]
  const draft = await runAiCall<string>(
    { userId, provider, model, feature: "crm-reply-draft" },
    async () => {
      const generated = await generate(
        provider,
        model,
        key,
        SYSTEM_PROMPT,
        `${about}\n\nThe conversation so far, oldest first:\n\n${transcript}\n\nWrite the reply.`
      )
      return { result: generated.text, usage: generated.usage }
    }
  )

  if (!draft.trim()) throw new Error(CRM_DRAFT_FAILED)
  return draft.trim()
}
