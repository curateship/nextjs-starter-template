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
  type LinkPage,
  type SubredditRule,
} from "@/lib/social/options"

import { exampleComments } from "./examples"
import { answerableReply } from "./replies"
import { projectDescription, projectOfFind } from "./projects"
import { promptRules } from "./reddit/rules"
import { promoAccounts, promoDrafts, promoFinds } from "./schema"
import { NO_WORDS, wordsForAccount } from "./voices"

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

/** A sent comment is shown whole up to this, which every Reddit comment the app sends is. */
const EXAMPLE_CHARS = MAX_COMMENT_CHARS

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
  /**
   * The account clicked on the Projects dashboard, whose voice it drafts in
   * and whose project's description it is told. Null before one is clicked:
   * no voice, and the post's own project's description.
   */
  accountId: string | null
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
  /**
   * The page a link post points to, read because the post has no words of its
   * own. Labelled as the linked page and never as the post, so a draft does
   * not answer the article as though the poster wrote it.
   */
  linkPage?: LinkPage | null
  replies: FindThread["replies"]
  voice: string
  /**
   * What I make: the project's description. Empty when the account is in no
   * project, which drafts with no mention of a product.
   */
  product: string
  commentRules: string
  /**
   * Comments really posted from this account, best example first. Empty
   * leaves the prompt exactly as it was before examples existed.
   */
  examples?: string[]
  /**
   * The rules the subreddit's moderators posted. Empty when they have not
   * been read or there are none, which leaves the prompt as it was.
   */
  subredditRules?: SubredditRule[]
  /**
   * Set when answering somebody who replied to a comment I sent: my comment
   * and their reply. The post's other replies are then left out, because the
   * conversation is between the two of us.
   */
  answering?: Answering | null
  /**
   * A post in one of the account's everyday subreddits, answered to help and
   * nothing else, so the account reads as a person with a life beyond the
   * product. Never told what I make, and told never to mention anything.
   */
  helpOnly?: boolean
  count: number
}): string {
  const answering = input.answering ?? null
  const replies = input.replies.slice(0, REPLY_CONTEXT)
  const repliesBlock = replies.length
    ? replies
        .map(
          (reply, index) =>
            `${index + 1}. ${reply.author || "someone"} (${reply.score} upvotes): ${reply.text.slice(0, 600)}`
        )
        .join("\n")
    : "(nobody has replied yet)"
  const subreddit = input.subreddit || "an unnamed subreddit"

  return [
    answering
      ? `You are writing a reply on Reddit, in r/${subreddit}. I left a comment on a post, somebody answered my comment, and I am answering them.`
      : `You are writing a comment on a Reddit post in r/${subreddit}.`,
    "",
    `POST TITLE: ${input.title}`,
    postBodyBlock(input.body, input.linkPage ?? null),
    "",
    ...(answering
      ? [
          "MY COMMENT ON THE POST:",
          answering.myComment.slice(0, MAX_COMMENT_CHARS),
          "",
          `THEIR REPLY TO MY COMMENT, from ${answering.reply.author || "someone"}. This is what I am answering:`,
          answering.reply.text.slice(0, 2_000),
        ]
      : ["REPLIES ALREADY THERE:", repliesBlock]),
    "",
    input.voice ? `HOW I SOUND:\n${input.voice}` : "",
    examplesBlock(input.examples ?? []),
    input.product ? `WHAT I MAKE, if it is genuinely relevant:\n${input.product}` : "",
    input.commentRules ? `MY RULES:\n${input.commentRules}` : "",
    subredditRulesBlock(input.subreddit, input.subredditRules ?? []),
    "",
    answering
      ? "Write " + input.count + " different replies I could post."
      : "Write " + input.count + " different comments I could post.",
    "",
    "Hard rules:",
    `- Each ${answering ? "reply" : "comment"} is under ${MAX_DRAFT_CHARS} characters.`,
    answering
      ? "- Answer what they said to me. Do not repeat my comment, and do not open by restating their reply."
      : "- Answer the post. Do not open by restating the question.",
    !answering && !input.body && input.linkPage
      ? "- The poster shared that page; they did not write it. Talk to the poster about what they shared, not to the page's author, and do not summarise the page back to them."
      : "",
    answering ? "" : "- Do not repeat a point one of the replies above already made.",
    input.helpOnly
      ? "- This comment is only to help. Do not mention any product, tool, service or business of mine, and do not link to anything."
      : "- Do not mention what I make unless it directly answers what was asked. A comment that reads as an advert gets me banned, which is worse than a comment nobody clicks.",
    input.subredditRules?.length
      ? `- Break none of r/${input.subreddit}'s own rules above. Where they ban self-promotion or links, do not mention what I make and do not link to anything.`
      : "",
    "- No em dashes. No bullet lists. No sign-off. Write the way a person types into a reply box.",
    "- Do not use the words 'delve', 'leverage', 'navigate', 'landscape' or 'game-changer'.",
    "",
    `Separate the ${answering ? "replies" : "comments"} with a line containing only ---`,
  ]
    .filter((line) => line !== "")
    .join("\n")
}

/** My comment and the reply to it that a draft answers. */
export type Answering = {
  myComment: string
  reply: { author: string; text: string }
}

/**
 * The post's own words, or for a link post with none, the page it links to,
 * marked as somebody else's page.
 */
function postBodyBlock(body: string, linkPage: LinkPage | null): string {
  if (body) return `POST BODY:\n${body.slice(0, 4_000)}`
  if (!linkPage) return "POST BODY: (a link or image post, no words)"
  return [
    "POST BODY: (none. The post is a link the poster shared, with no words of their own.)",
    `THE PAGE THIS POST LINKS TO, written by somebody else, not the poster (${linkPage.url}):`,
    linkPage.title ? `Page title: ${linkPage.title}` : "",
    linkPage.text ? `Page opening: ${linkPage.text}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Longest stretch of one rule's description handed to the model. */
const RULE_DESCRIPTION_CHARS = 500

/**
 * The subreddit's own rules, labelled as its moderators' so the model never
 * mixes them up with mine, which are a block of their own above.
 */
function subredditRulesBlock(subreddit: string, rules: SubredditRule[]): string {
  if (!rules.length) return ""
  return [
    `THE RULES OF r/${subreddit}, posted by its moderators. These are the subreddit's own rules, not mine:`,
    ...rules.map((rule, index) => {
      const description = rule.description.replace(/\s+/g, " ").trim().slice(0, RULE_DESCRIPTION_CHARS)
      return `${index + 1}. ${rule.title || "(no title)"}${description ? `: ${description}` : ""}`
    }),
  ].join("\n")
}

/**
 * Real comments, labelled so the model copies how they sound and not what
 * they say. They answered other posts, so their points would be wrong here,
 * and a product mention copied across is the advert the rules forbid.
 */
function examplesBlock(examples: string[]): string {
  if (!examples.length) return ""
  return [
    "COMMENTS I HAVE REALLY POSTED, to show how I write:",
    ...examples.map(
      (text, index) => `Example ${index + 1}:\n${text.slice(0, EXAMPLE_CHARS)}`
    ),
    "Copy how these sound: their length, their tone, how they open and how they talk. Do not repeat their substance. They answered other posts, so do not reuse their points, examples, facts or any mention of what I make.",
  ].join("\n")
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
 * Throws when there is no key, no post, or the account has gone, because each
 * of those is something a person has to go and fix, and a silent empty list
 * would send them looking in the wrong place.
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

  const account = request.accountId
    ? (
        await db
          .select()
          .from(promoAccounts)
          .where(
            and(eq(promoAccounts.id, request.accountId), eq(promoAccounts.userId, request.userId))
          )
          .limit(1)
      )[0]
    : null
  if (request.accountId && !account) throw new Error("That account is not there any more.")

  return writeDrafts(
    {
      userId: request.userId,
      find,
      account,
      provider,
      model,
      answering: null,
      replyToId: "",
    },
    db
  )
}

export type ReplyDraftRequest = {
  userId: string
  /** The app's own sent comment the reply sits under. */
  commentId: string
  /** Reddit's id for the reply being answered, from the comment's last check. */
  replyId: string
  provider?: string
  model?: string
}

/**
 * Drafts answers to somebody who replied to a comment the app sent, in the
 * voice of the account that sent the comment, told the post, the comment and
 * the reply. Stored against the reply, so they never show among the post's
 * own drafts.
 */
export async function draftReplies(
  request: ReplyDraftRequest,
  db: CustomShellDb = defaultDb
): Promise<WrittenDraft[]> {
  const provider = isAiTextProvider(request.provider)
    ? request.provider
    : "anthropic"
  const model = pickModel(provider, request.model)

  const { comment, reply } = await answerableReply(
    request.userId,
    request.commentId,
    request.replyId,
    db
  )
  const [find] = await db
    .select()
    .from(promoFinds)
    .where(and(eq(promoFinds.id, comment.findId), eq(promoFinds.userId, request.userId)))
    .limit(1)
  if (!find) throw new Error("That post is no longer saved.")
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, comment.accountId), eq(promoAccounts.userId, request.userId)))
    .limit(1)
  if (!account) throw new Error("That account is not there any more.")

  return writeDrafts(
    {
      userId: request.userId,
      find,
      account,
      provider,
      model,
      answering: { myComment: comment.text, reply },
      replyToId: reply.id,
    },
    db
  )
}

/**
 * Asks the model and stores what it wrote. The same for a comment on a post
 * and for an answer to a reply, apart from the prompt's `answering` and the
 * reply id the drafts are filed under.
 */
async function writeDrafts(
  input: {
    userId: string
    find: typeof promoFinds.$inferSelect
    account: typeof promoAccounts.$inferSelect | null
    provider: AiTextProvider
    model: string
    answering: Answering | null
    replyToId: string
  },
  db: CustomShellDb
): Promise<WrittenDraft[]> {
  const { userId, find, account, provider, model, answering } = input

  const key = await getAiKey(provider)
  if (!key) {
    throw new Error(
      `There is no ${provider} key saved. Add one in Settings, under AI provider keys.`
    )
  }

  // The account's voice, shared with any other account pointed at it. An
  // account with none, or no account yet, drafts plainly.
  const words = account ? await wordsForAccount(userId, account.id, db) : NO_WORDS
  // What you make is the account's project's description, never the voice's.
  // An account in no project is told nothing about a product. Before an
  // account is clicked, the post's own project counts.
  // A help-only post, from an account's everyday subreddits, is never told.
  const product = find.helpAccountId
    ? ""
    : await projectDescription(
        userId,
        account ? account.projectId : await projectOfFind(userId, find.id, db),
        db
      )
  // The comments this account really sent, as examples of its voice. None
  // before the first one goes out, and the voice box carries it alone.
  const examples = account ? await exampleComments(userId, account.id, db) : []
  // The rules the subreddit posted, read when its first post turned up.
  const subredditRules = await promptRules(userId, find.subreddit, db)
  const prompt = buildDraftPrompt({
    subreddit: find.subreddit,
    title: find.title,
    body: find.thread?.body || find.body,
    linkPage: find.linkPage,
    replies: find.thread?.replies ?? [],
    ...words,
    product,
    examples,
    subredditRules,
    answering,
    helpOnly: Boolean(find.helpAccountId),
    count: DRAFT_COUNT,
  })

  const written = await askModel(
    {
      userId,
      provider,
      model,
      // Answers to replies are their own line on the AI usage screen.
      feature: answering ? "reddit-reply" : "reddit-comment",
      metadata: answering
        ? { findId: find.id, subreddit: find.subreddit, replyId: input.replyToId }
        : { findId: find.id, subreddit: find.subreddit },
      prompt,
      key,
    },
    (answer) => {
      const drafts = splitDrafts(answer, DRAFT_COUNT)
      if (!drafts.length) {
        throw new Error(`${provider} answered, but nothing in the answer looked like a comment.`)
      }
      return drafts
    }
  )

  const rows = written.map((text) => ({
    id: uuid(),
    userId: userId,
    findId: find.id,
    text,
    provider,
    model,
    replyToId: input.replyToId,
  }))
  await db.insert(promoDrafts).values(rows)

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    provider: row.provider,
    model: row.model,
  }))
}

export type ModelCall = {
  userId: string
  provider: AiTextProvider
  model: string
  /** The line it is counted under on the AI usage screen. */
  feature: string
  metadata: Record<string, unknown>
  prompt: string
  /** The provider's key, already looked up, so a missing one is refused before anything is sent. */
  key: string
}

/**
 * One request to the model, through the shell's meter, so it counts against
 * the month's AI allowance, shows on the AI usage screen under its feature,
 * and records a row whether it worked or not. `read` turns the words the
 * model wrote into the answer, and throws when they make no sense.
 *
 * Every feature that asks the AI something goes through here: drafts,
 * answers to replies, the rules check, rewrites, keyword ideas, help-only
 * drafts and posts of your own.
 */
export async function askModel<T>(call: ModelCall, read: (answer: string) => T): Promise<T> {
  const shape = PROVIDERS[call.provider]
  return runAiCall<T>(
    {
      userId: call.userId,
      provider: call.provider,
      model: call.model,
      feature: call.feature,
      metadata: call.metadata,
    },
    async () => {
      const response = await fetch(shape.url(call.model), {
        method: "POST",
        headers: shape.headers(call.key),
        body: shape.body(call.model, call.prompt),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!response.ok) {
        // The provider's own body often says exactly what is wrong, and it is
        // more use than "status 400". Capped, because some are enormous.
        const detail = (await response.text()).slice(0, 400)
        throw new Error(
          `${call.provider} refused the request with status ${response.status}. ${detail}`.trim()
        )
      }

      const payload = (await response.json()) as Record<string, unknown>
      return { result: read(shape.text(payload)), usage: shape.usage(payload) }
    }
  )
}

/**
 * The provider and model to use, and its key, or a refusal naming the screen
 * to add one on. Claude unless another provider is asked for.
 */
export async function pickProvider(
  asked: { provider?: string; model?: string } = {}
): Promise<{ provider: AiTextProvider; model: string; key: string }> {
  const provider = isAiTextProvider(asked.provider) ? asked.provider : "anthropic"
  const key = await getAiKey(provider)
  if (!key) {
    throw new Error(`There is no ${provider} key saved. Add one in Settings, under AI provider keys.`)
  }
  return { provider, model: pickModel(provider, asked.model), key }
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

