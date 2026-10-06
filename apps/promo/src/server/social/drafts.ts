import { and, eq } from "drizzle-orm"

import {
  AI_MODEL_OPTIONS,
  DEFAULT_AI_MODEL,
  isAiTextProvider,
  type AiTextProvider,
} from "@/lib/ai/ai-models"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import {
  DRAFTS_PER_PRESS,
  MAX_COMMENT_CHARS,
  type FindThread,
} from "@/lib/social/options"

import { promoAccounts, promoDrafts, promoFinds } from "./schema"
import { wordsForAccount } from "./voices"

/**
 * Asking an AI to write a Reddit comment.
 *
 * Every call goes through the shell's `runAiCall`, so a draft counts against
 * the month's AI allowance, shows up on the usage dashboard under
 * "reddit-comment", and records a row whether it worked or not. Nothing here
 * decides to post: it writes words, and a person presses the button.
 *
 * The provider request shapes are the shell's own, already written for the
 * "Test this key" button in `@/server/ai/keys`. They are restated here rather
 * than imported because that file keeps them private and exports only the test
 * — and the shell is not ours to change.
 */

/**
 * Both of these live in `@/lib/social/options` because the composer panel
 * needs them too, and a runtime value imported out of a `@/server/*` module
 * drags the database driver into the browser's bundle.
 */
const DRAFT_COUNT = DRAFTS_PER_PRESS
const MAX_DRAFT_CHARS = MAX_COMMENT_CHARS

/** Long enough for a slow model, short enough that a person does not give up. */
const TIMEOUT_MS = 90_000

/** How many existing replies to show the model. */
const REPLY_CONTEXT = 5

type ProviderRequest = {
  url: (model: string) => string
  headers: (key: string) => Record<string, string>
  body: (model: string, prompt: string) => string
  /** The words the model wrote, or "" when the shape surprises us. */
  text: (payload: Record<string, unknown>) => string
  usage: (payload: Record<string, unknown>) => {
    inputTokens: number
    outputTokens: number
  }
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}

const PROVIDERS: Record<AiTextProvider, ProviderRequest> = {
  anthropic: {
    url: () => "https://api.anthropic.com/v1/messages",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    }),
    body: (model, prompt) =>
      JSON.stringify({
        model,
        max_tokens: 2_000,
        messages: [{ role: "user", content: prompt }],
      }),
    text: (payload) => {
      const content = payload.content
      if (!Array.isArray(content)) return ""
      return content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text: unknown }).text)
            : ""
        )
        .join("")
    },
    usage: (payload) => {
      const usage = (payload.usage ?? {}) as Record<string, unknown>
      return {
        inputTokens: tokenCount(usage.input_tokens),
        outputTokens: tokenCount(usage.output_tokens),
      }
    },
  },
  openai: {
    url: () => "https://api.openai.com/v1/chat/completions",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    }),
    body: (model, prompt) =>
      JSON.stringify({
        model,
        max_completion_tokens: 2_000,
        messages: [{ role: "user", content: prompt }],
      }),
    text: (payload) => {
      const choices = payload.choices
      if (!Array.isArray(choices) || !choices.length) return ""
      const message = (choices[0] as Record<string, unknown>).message
      if (!message || typeof message !== "object") return ""
      const content = (message as Record<string, unknown>).content
      return typeof content === "string" ? content : ""
    },
    usage: (payload) => {
      const usage = (payload.usage ?? {}) as Record<string, unknown>
      return {
        inputTokens: tokenCount(usage.prompt_tokens),
        outputTokens: tokenCount(usage.completion_tokens),
      }
    },
  },
  gemini: {
    url: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: (key) => ({
      "x-goog-api-key": key,
      "content-type": "application/json",
    }),
    body: (_model, prompt) =>
      JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2_000 },
      }),
    text: (payload) => {
      const candidates = payload.candidates
      if (!Array.isArray(candidates) || !candidates.length) return ""
      const content = (candidates[0] as Record<string, unknown>).content
      if (!content || typeof content !== "object") return ""
      const parts = (content as Record<string, unknown>).parts
      if (!Array.isArray(parts)) return ""
      return parts
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text: unknown }).text)
            : ""
        )
        .join("")
    },
    usage: (payload) => {
      const usage = (payload.usageMetadata ?? {}) as Record<string, unknown>
      return {
        inputTokens: tokenCount(usage.promptTokenCount),
        outputTokens: tokenCount(usage.candidatesTokenCount),
      }
    },
  },
}

export type DraftRequest = {
  userId: string
  findId: string
  accountId: string
  provider?: string
  model?: string
}

export type WrittenDraft = {
  id: string
  text: string
  provider: string
  model: string
}

/**
 * The words handed to the model.
 *
 * Exported so a test can read it without a provider, which is the only way to
 * check the replies really are in there. The replies are the point: without
 * them a draft confidently repeats the top comment.
 */
export function buildDraftPrompt(input: {
  subreddit: string
  title: string
  body: string
  replies: FindThread["replies"]
  voice: string
  product: string
  commentRules: string
  count: number
}): string {
  const replies = input.replies.slice(0, REPLY_CONTEXT)
  const repliesBlock = replies.length
    ? replies
        .map(
          (reply, index) =>
            `${index + 1}. ${reply.author || "someone"} (${reply.score} upvotes): ${reply.text.slice(0, 600)}`
        )
        .join("\n")
    : "(nobody has replied yet)"

  return [
    `You are writing a comment on a Reddit post in r/${input.subreddit || "an unnamed subreddit"}.`,
    "",
    `POST TITLE: ${input.title}`,
    input.body ? `POST BODY:\n${input.body.slice(0, 4_000)}` : "POST BODY: (a link or image post, no words)",
    "",
    "REPLIES ALREADY THERE:",
    repliesBlock,
    "",
    input.voice ? `HOW I SOUND:\n${input.voice}` : "",
    input.product ? `WHAT I MAKE, if it is genuinely relevant:\n${input.product}` : "",
    input.commentRules ? `MY RULES:\n${input.commentRules}` : "",
    "",
    "Write " + input.count + " different comments I could post.",
    "",
    "Hard rules:",
    `- Each comment is under ${MAX_DRAFT_CHARS} characters.`,
    "- Answer the post. Do not open by restating the question.",
    "- Do not repeat a point one of the replies above already made.",
    "- Do not mention what I make unless it directly answers what was asked. A comment that reads as an advert gets me banned, which is worse than a comment nobody clicks.",
    "- No em dashes. No bullet lists. No sign-off. Write the way a person types into a reply box.",
    "- Do not use the words 'delve', 'leverage', 'navigate', 'landscape' or 'game-changer'.",
    "",
    "Separate the comments with a line containing only ---",
  ]
    .filter((line) => line !== "")
    .join("\n")
}

/**
 * Splits the model's answer into separate comments.
 *
 * A model that ignores the separator hands back one comment, and one good
 * comment is a better answer than two halves of one.
 */
export function splitDrafts(answer: string, count: number): string[] {
  const parts = answer
    .split(/^\s*-{3,}\s*$/m)
    .map((part) => part.trim())
    // A numbered preamble like "1." on its own line is not a comment.
    .filter((part) => part.replace(/[\s\d.]/g, "").length > 20)
    .map((part) => part.slice(0, MAX_DRAFT_CHARS))

  return parts.length ? parts.slice(0, count) : []
}

/**
 * Writes the drafts and stores them.
 *
 * Throws when there is no key, no account or no post, because each of those is
 * something a person has to go and fix, and a silent empty list would send
 * them looking in the wrong place.
 */
export async function draftComments(
  request: DraftRequest,
  db: CustomShellDb = defaultDb
): Promise<WrittenDraft[]> {
  const provider = isAiTextProvider(request.provider)
    ? request.provider
    : "anthropic"
  const model = pickModel(provider, request.model)

  const [find] = await db
    .select()
    .from(promoFinds)
    .where(and(eq(promoFinds.id, request.findId), eq(promoFinds.userId, request.userId)))
    .limit(1)
  if (!find) throw new Error("That post is no longer saved.")

  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(
      and(eq(promoAccounts.id, request.accountId), eq(promoAccounts.userId, request.userId))
    )
    .limit(1)
  if (!account) throw new Error("Set up a Reddit account first, in Settings.")

  const key = await getAiKey(provider)
  if (!key) {
    throw new Error(
      `There is no ${provider} key saved. Add one in Settings, under AI provider keys.`
    )
  }

  // The account's voice, shared with any other account pointed at it. An
  // account with none drafts plainly.
  const words = await wordsForAccount(request.userId, account.id, db)
  const prompt = buildDraftPrompt({
    subreddit: find.subreddit,
    title: find.title,
    body: find.thread?.body || find.body,
    replies: find.thread?.replies ?? [],
    ...words,
    count: DRAFT_COUNT,
  })

  const shape = PROVIDERS[provider]

  const written = await runAiCall<string[]>(
    {
      userId: request.userId,
      provider,
      model,
      feature: "reddit-comment",
      metadata: { findId: find.id, subreddit: find.subreddit },
    },
    async () => {
      const response = await fetch(shape.url(model), {
        method: "POST",
        headers: shape.headers(key),
        body: shape.body(model, prompt),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!response.ok) {
        // The provider's own body often says exactly what is wrong, and it is
        // more use than "status 400". Capped, because some are enormous.
        const detail = (await response.text()).slice(0, 400)
        throw new Error(
          `${provider} refused the request with status ${response.status}. ${detail}`.trim()
        )
      }

      const payload = (await response.json()) as Record<string, unknown>
      const answer = shape.text(payload)
      const drafts = splitDrafts(answer, DRAFT_COUNT)
      if (!drafts.length) {
        throw new Error(
          `${provider} answered, but nothing in the answer looked like a comment.`
        )
      }
      return { result: drafts, usage: shape.usage(payload) }
    }
  )

  const rows = written.map((text) => ({
    id: uuid(),
    userId: request.userId,
    findId: find.id,
    text,
    provider,
    model,
  }))
  await db.insert(promoDrafts).values(rows)

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    provider: row.provider,
    model: row.model,
  }))
}

/**
 * The model to use. A saved flow can name one the dropdown no longer offers,
 * so an unknown name falls back to the provider's default rather than being
 * sent and refused.
 */
function pickModel(provider: AiTextProvider, asked: string | undefined): string {
  const wanted = asked?.trim()
  if (!wanted) return DEFAULT_AI_MODEL[provider]
  const offered = AI_MODEL_OPTIONS[provider].some((option) => option.id === wanted)
  return offered ? wanted : DEFAULT_AI_MODEL[provider]
}

