import { and, desc, eq, isNull, ne } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  MAX_THREAD_PIECES,
  X_DRAFTS_PER_PRESS,
  X_REWRITE_WORDS,
  xHandle,
  xHashtag,
  xLength,
  xPostLimit,
  type XKeywordKind,
  type XRewrite,
  type XTopReply,
} from "@/lib/social/x/options"

import { askModel, pickProvider } from "../drafts"
import { projectDescription } from "../projects"
import { promoAccounts } from "../schema"
import { NO_WORDS, wordsForAccount, type VoiceWords } from "../voices"
import { ownedXFind } from "./finds"
import { promoXDrafts, promoXReplies } from "./schema"

/**
 * Asking the AI for X's words: replies, quotes, answers, rewrites, the rules
 * check, keyword and trend ideas, and posts and threads of your own (parts
 * 14, 15, 21, 22, 23, 24, 25, 26, 29, 32 and 34). Every call goes through
 * `askModel`, so it counts against the month's AI allowance and shows on the
 * AI usage screen under an `x-` line, with the project it was for (part 45).
 * Nothing here sends anything: a person presses Post.
 */

/**
 * X's own rules, as far as they touch a reply or a post, read off X's
 * "Platform manipulation and spam policy" and its "Authenticity" rules
 * (help.x.com/en/rules-and-policies/platform-manipulation) and put in short.
 * Handed to the rules check and to every prompt. Re-read the page when X
 * changes it.
 */
export const X_RULES = [
  "No posting the same or nearly the same reply or post again and again, from one account or several.",
  "No replying in bulk with unsolicited mentions or links to drive people somewhere else.",
  "No using several accounts to make one person or product look more popular, or to talk to each other.",
  "No misleading links, and nothing that pretends to be someone or something it is not.",
  "No hashtag stuffing: hashtags that have nothing to do with what is said, or many of them in one post.",
  "Paid promotion must be disclosed when the account was given something for it.",
]

export const X_RULES_READ_ON = "21 Oct 2026"

/**
 * Tyler's rule for when a reply names the product, 21 Oct 2026: "Only when
 * it solves the post". Said to the AI in these words.
 */
const WHEN_TO_NAME =
  "Name the product only when the post is about a problem the product solves. Otherwise just help, and do not mention the product at all."

/** Tyler's answer, 21 Oct 2026: "Never in replies". */
const NO_LINKS = "Never put a link, a web address or a domain name in a reply."

/** How many of the account's own sent replies are shown to the AI as its voice. */
const EXAMPLES = 3

export type XReplyPromptInput = {
  kind: "reply" | "quote"
  post: { text: string; author: string }
  /** The top reply being answered instead of the post (part 26). */
  under: XTopReply | null
  /** The post's top replies, so the draft adds something new (part 22). */
  topReplies: XTopReply[]
  voice: string
  commentRules: string
  /** The project's description, or "" for none. */
  product: string
  /** The account's own sent replies, as examples of its voice (part 25). */
  examples: string[]
  /** A help-only reply never names the product (part 24). */
  helpOnly: boolean
  /** When answering somebody: what they wrote under one of ours, or a post naming us. */
  answering: { mine: string; theirs: string; author: string } | null
  limit: number
  count: number
}

/** The words handed to the model for a reply, a quote or an answer. */
export function buildXReplyPrompt(input: XReplyPromptInput): string {
  const lines: string[] = []
  if (input.answering) {
    lines.push(
      `You are answering someone on X (the site that was Twitter). @${input.answering.author || "someone"} wrote to you.`,
      input.answering.mine ? `What you posted:\n"""${input.answering.mine}"""` : "",
      `What they wrote:\n"""${input.answering.theirs}"""`
    )
  } else if (input.kind === "quote") {
    lines.push(
      "You are writing a quote post on X (the site that was Twitter): your own comment shown on top of someone's post, seen by your followers. It stays on your own page for good, so it must never read like an advert.",
      `Their post, by @${input.post.author || "someone"}:\n"""${input.post.text}"""`
    )
  } else if (input.under) {
    lines.push(
      "You are replying on X (the site that was Twitter) to one of the top replies under a post.",
      `The post, by @${input.post.author || "someone"}:\n"""${input.post.text}"""`,
      `The reply you answer, by @${input.under.handle || "someone"}:\n"""${input.under.text}"""`
    )
  } else {
    lines.push(
      "You are replying to a post on X (the site that was Twitter).",
      `The post, by @${input.post.author || "someone"}:\n"""${input.post.text}"""`
    )
  }
  if (!input.answering && input.topReplies.length) {
    lines.push(
      "Replies already under it. Add something they do not say; never repeat them:",
      ...input.topReplies.map((reply) => `- @${reply.handle || "someone"}: ${reply.text.slice(0, 280)}`)
    )
  }
  if (input.voice.trim()) lines.push(`How you write:\n${input.voice.trim()}`)
  if (input.commentRules.trim()) lines.push(`Lines you never cross:\n${input.commentRules.trim()}`)
  if (input.examples.length) {
    lines.push("Replies you really sent before, for your voice only, never to copy:", ...input.examples.map((text) => `- ${text}`))
  }
  if (input.helpOnly || !input.product.trim()) {
    lines.push("Do not mention any product, tool, company or link. Only help.")
  } else {
    lines.push(`What you make:\n${input.product.trim()}`, WHEN_TO_NAME)
  }
  lines.push(
    "X's own rules you must keep:",
    ...X_RULES.map((rule) => `- ${rule}`),
    NO_LINKS,
    `Each one is at most ${input.limit} characters, plain text, at most one hashtag and usually none, no greeting, and reads like a person who read the post.`,
    `Write ${input.count} different ${input.kind === "quote" ? "quote posts" : "replies"}, separated by a line with only --- on it. Nothing else.`
  )
  return lines.filter(Boolean).join("\n\n")
}

/** The drafts out of the model's answer, each cut to the account's limit. */
export function splitXDrafts(answer: string, count: number, limit: number): string[] {
  return answer
    .split(/^\s*---\s*$/m)
    .map((part) => part.trim().replace(/^["“]|["”]$/g, "").slice(0, limit))
    .filter((text) => text.length > 0)
    .slice(0, count)
}

/** The account's own sent replies, newest first, as its voice. Ones it typed or edited come first (part 25). */
export async function exampleXReplies(userId: string, accountId: string, db: CustomShellDb): Promise<string[]> {
  const rows = await db
    .select({ text: promoXReplies.text, draftId: promoXReplies.draftId, editedAt: promoXReplies.editedAt })
    .from(promoXReplies)
    .where(
      and(
        eq(promoXReplies.userId, userId),
        eq(promoXReplies.accountId, accountId),
        eq(promoXReplies.status, "posted"),
        ne(promoXReplies.kind, "answer"),
        isNull(promoXReplies.deletedAt),
        eq(promoXReplies.helpOnly, false)
      )
    )
    .orderBy(desc(promoXReplies.postedAt))
    .limit(50)
  // A reply sent with no draft behind it, or edited after, was typed or
  // changed by the person, so it says more about their voice than one the
  // model wrote and they sent as it was (the rule `../examples.ts` uses).
  const own = rows.filter((row) => !row.draftId || row.editedAt)
  const rest = rows.filter((row) => row.draftId && !row.editedAt)
  return [...own, ...rest].slice(0, EXAMPLES).map((row) => row.text)
}

/** The account's voice, examples and limit, checked as an X account of the person's in this project. */
async function accountWords(
  userId: string,
  accountId: string | null,
  projectId: string,
  db: CustomShellDb
): Promise<{ words: VoiceWords; examples: string[]; limit: number }> {
  if (!accountId) return { words: NO_WORDS, examples: [], limit: xPostLimit(false) }
  const [account] = await db
    .select({ id: promoAccounts.id, projectId: promoAccounts.projectId, platform: promoAccounts.platform, paid: promoAccounts.xPaid })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "x") throw new Refusal("Pick an X account first.")
  if (account.projectId !== projectId) throw new Refusal("That account is not in this project.")
  return {
    words: await wordsForAccount(userId, account.id, db),
    examples: await exampleXReplies(userId, account.id, db),
    limit: xPostLimit(account.paid),
  }
}

export type XDraftView = { id: string; text: string; kind: "reply" | "quote"; replyToId: string; helpOnly: boolean; rewrite: string; createdAt: Date }

/**
 * Two drafts for a post, in the account's voice: replies, quotes, or replies
 * under one of its top replies. Stored, so what was asked for and what went
 * out can be compared. A help-only press tells the AI nothing about the
 * product (part 24).
 */
export async function writeXDrafts(
  userId: string,
  input: {
    findId: string
    accountId: string | null
    helpOnly: boolean
    kind?: "reply" | "quote"
    underReplyId?: string
    provider?: string
    model?: string
  },
  db: CustomShellDb = defaultDb
): Promise<XDraftView[]> {
  const find = await ownedXFind(userId, input.findId, db)
  if (!find) throw new Error("That X post is no longer saved.")
  const kind = input.kind ?? "reply"
  const under = input.underReplyId ? (find.topReplies ?? []).find((reply) => reply.id === input.underReplyId) ?? null : null
  if (input.underReplyId && !under) throw new Refusal("That reply is not one of the post's top replies as Promo read them.")
  const { words, examples, limit } = await accountWords(userId, input.accountId, find.projectId, db)
  const product = input.helpOnly ? "" : await projectDescription(userId, find.projectId, db)
  const picked = await pickProvider(input)
  const prompt = buildXReplyPrompt({
    kind,
    post: { text: find.text, author: find.authorHandle },
    under,
    topReplies: find.topReplies ?? [],
    ...words,
    product,
    examples,
    helpOnly: input.helpOnly,
    answering: null,
    limit,
    count: X_DRAFTS_PER_PRESS,
  })
  const drafts = await askModel(
    { userId, ...picked, feature: "x-reply", metadata: { projectId: find.projectId, findId: find.id, postId: find.postId, kind }, prompt },
    (answer) => {
      const split = splitXDrafts(answer, X_DRAFTS_PER_PRESS, limit)
      if (!split.length) throw new Error(`${picked.provider} answered, but nothing in the answer looked like a reply.`)
      return split
    }
  )
  const now = new Date()
  const rows = drafts.map((text) => ({
    id: uuid(),
    userId,
    findId: find.id,
    kind,
    replyToId: under?.id ?? "",
    text,
    helpOnly: input.helpOnly,
    provider: picked.provider,
    model: picked.model,
    createdAt: now,
  }))
  await db.insert(promoXDrafts).values(rows)
  return rows.map((row) => ({ id: row.id, text: row.text, kind: row.kind, replyToId: row.replyToId, helpOnly: row.helpOnly, rewrite: "", createdAt: row.createdAt }))
}

/** A draft answer to somebody who replied to or named the account. Not stored: it goes in the box. */
export async function writeXAnswer(
  userId: string,
  input: { projectId: string; accountId: string; mine: string; theirs: string; author: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const { words, examples, limit } = await accountWords(userId, input.accountId, input.projectId, db)
  const product = await projectDescription(userId, input.projectId, db)
  const picked = await pickProvider()
  const prompt = buildXReplyPrompt({
    kind: "reply",
    post: { text: "", author: "" },
    under: null,
    topReplies: [],
    ...words,
    product,
    examples,
    helpOnly: false,
    answering: { mine: input.mine, theirs: input.theirs, author: input.author },
    limit,
    count: 1,
  })
  return askModel({ userId, ...picked, feature: "x-answer", metadata: { projectId: input.projectId }, prompt }, (answer) => {
    const [first] = splitXDrafts(answer, 1, limit)
    if (!first) throw new Error(`${picked.provider} answered, but nothing in the answer looked like an answer.`)
    return first
  })
}

const REWRITE_ASK: Record<XRewrite, string> = {
  shorter: "Make it about half as long. Keep its one most useful point.",
  warmer: "Make it warmer and more personal, as someone who liked the post, without flattering it.",
  less_salesy:
    "Make it less salesy: help first, and take out anything that reads like an advert. If it names a product, name it at most once, plainly, or not at all.",
}

/** The words handed to the model to rewrite a reply. */
function buildXRewritePrompt(text: string, how: XRewrite, limit: number): string {
  return [
    "Rewrite this reply for X.",
    REWRITE_ASK[how],
    NO_LINKS,
    `Keep it at most ${limit} characters, plain text. Answer with the new reply and nothing else.`,
    `The reply:\n"""${text}"""`,
  ].join("\n\n")
}

/** A rewrite of the words in the box (part 21), stored as a draft so the record of what the AI wrote stays honest. */
export async function rewriteXReply(
  userId: string,
  input: { findId: string; accountId: string | null; text: string; how: XRewrite },
  db: CustomShellDb = defaultDb
): Promise<XDraftView> {
  if (!X_REWRITE_WORDS[input.how]) throw new Error("That rewrite is not one Promo knows.")
  const text = input.text.trim()
  if (!text) throw new Refusal("Write the reply first, then rewrite it.")
  const find = await ownedXFind(userId, input.findId, db)
  if (!find) throw new Error("That X post is no longer saved.")
  const { limit } = await accountWords(userId, input.accountId, find.projectId, db)
  const picked = await pickProvider()
  const rewritten = await askModel(
    {
      userId,
      ...picked,
      feature: "x-rewrite",
      metadata: { projectId: find.projectId, findId: find.id, how: input.how },
      prompt: buildXRewritePrompt(text, input.how, limit),
    },
    (answer) => {
      const clean = answer.trim().replace(/^["“]|["”]$/g, "").slice(0, limit)
      if (!clean) throw new Error(`${picked.provider} answered with nothing.`)
      return clean
    }
  )
  const row = { id: uuid(), userId, findId: find.id, text: rewritten, rewrite: input.how, provider: picked.provider, model: picked.model, createdAt: new Date() }
  await db.insert(promoXDrafts).values(row)
  return { id: row.id, text: row.text, kind: "reply", replyToId: "", helpOnly: false, rewrite: input.how, createdAt: row.createdAt }
}

export type XRulesVerdict = { ok: boolean; problems: string[] }

/** The words handed to the model for the rules check. */
function buildXRulesPrompt(text: string, communityRules: string, isReply: boolean): string {
  return [
    "Check this piece of writing for X against the rules below. Only flag a rule it really breaks.",
    "X's rules:",
    X_RULES.map((rule) => `- ${rule}`).join("\n"),
    isReply ? `- ${NO_LINKS}` : "",
    communityRules.trim() ? `The community's own rules:\n${communityRules.trim().slice(0, 4_000)}` : "",
    `The writing:\n"""${text.slice(0, 8_000)}"""`,
    "Answer OK on its own line when it breaks none. Otherwise write one line per rule it breaks, each starting with - and saying which rule and what in the writing breaks it.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function readXRulesAnswer(answer: string): XRulesVerdict {
  const problems = answer
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => line.replace(/^-\s*/, ""))
    .filter(Boolean)
  if (problems.length) return { ok: false, problems }
  if (/^\s*ok\b/i.test(answer)) return { ok: true, problems: [] }
  return { ok: false, problems: [answer.trim().slice(0, 400) || "The check gave no answer."] }
}

/** Checks a reply or a post against X's rules, and a community's when one is named (parts 21 and 35). */
export async function checkXRules(
  userId: string,
  input: { projectId: string; text: string; communityRules?: string; isReply: boolean }
): Promise<XRulesVerdict> {
  const text = input.text.trim()
  if (!text) throw new Refusal("Write something first, then check it.")
  const picked = await pickProvider()
  return askModel(
    {
      userId,
      ...picked,
      feature: "x-rules-check",
      metadata: { projectId: input.projectId },
      prompt: buildXRulesPrompt(text, input.communityRules ?? "", input.isReply),
    },
    readXRulesAnswer
  )
}

export type XKeywordIdea = { kind: XKeywordKind; value: string; trending?: boolean }

/** The words handed to the model for keyword ideas (part 14). */
function buildXKeywordIdeasPrompt(product: string, existing: string[]): string {
  return [
    "Suggest where on X (the site that was Twitter) the people who would want this product talk.",
    `What it is:\n${product.trim()}`,
    existing.length ? `Already used, do not repeat: ${existing.join(", ")}` : "",
    "Answer with up to 5 lines starting SEARCH: (words a person would post when they have the problem), up to 4 lines starting HASHTAG: (a hashtag people really use on the topic), and up to 5 lines starting ACCOUNT: (the @handle of a real, active X account that posts about the topic and gets replies). Nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function readXKeywordIdeas(answer: string): XKeywordIdea[] {
  const out: XKeywordIdea[] = []
  for (const line of answer.split("\n")) {
    const found = line.trim().match(/^(SEARCH|HASHTAG|ACCOUNT):\s*(.+)$/i)
    if (!found) continue
    const label = (found[1] ?? "").toLowerCase()
    const kind: XKeywordKind = label === "hashtag" ? "hashtag" : label === "account" ? "account" : "search"
    const raw = (found[2] ?? "").trim().replace(/^["“]|["”]$/g, "")
    const value = kind === "hashtag" ? xHashtag(raw) : kind === "account" ? xHandle(raw) : raw
    if (value && !out.some((idea) => idea.kind === kind && idea.value.toLowerCase() === value.toLowerCase())) out.push({ kind, value })
  }
  return out
}

/**
 * Search words, hashtags and accounts worth trying, from the project's
 * description (part 14). The accounts are not shown until a search account
 * has looked each one up on X: the AI names accounts that no longer exist.
 */
export async function xKeywordIdeas(
  userId: string,
  input: { projectId: string; existing: string[] },
  db: CustomShellDb = defaultDb
): Promise<XKeywordIdea[]> {
  const product = await projectDescription(userId, input.projectId, db)
  if (!product.trim()) throw new Refusal("Describe the project first, in its left column, so the AI knows what to look for.")
  const picked = await pickProvider()
  return askModel(
    { userId, ...picked, feature: "x-keyword-ideas", metadata: { projectId: input.projectId }, prompt: buildXKeywordIdeasPrompt(product, input.existing) },
    (answer) => {
      const ideas = readXKeywordIdeas(answer)
      if (!ideas.length) throw new Error(`${picked.provider} answered, but with no search words, hashtags or accounts.`)
      return ideas
    }
  )
}

/** The words handed to the model to pick the trends on the project's topic (part 15). */
function buildXTrendsPrompt(product: string, trends: string[]): string {
  return [
    "These are what X says is trending now. Pick only the ones a person who wants this product would really be talking about. Most will be about something else; leave those out.",
    `What it is:\n${product.trim()}`,
    `The trends:\n${trends.map((trend) => `- ${trend}`).join("\n")}`,
    "Answer with one line per trend you pick, each TREND: and the trend exactly as written above. Answer NONE when none fit. Nothing else.",
  ].join("\n\n")
}

export function readXTrendPicks(answer: string, trends: string[]): string[] {
  const known = new Map(trends.map((trend) => [trend.toLowerCase(), trend]))
  return answer
    .split("\n")
    .map((line) => line.trim().match(/^TREND:\s*(.+)$/i)?.[1]?.trim() ?? "")
    .map((value) => known.get(value.toLowerCase()) ?? "")
    .filter(Boolean)
}

/** The trends last read that the AI judges on the project's topic, as keyword ideas marked Trending (part 15). */
export async function xTrendIdeas(
  userId: string,
  input: { projectId: string; trends: string[] },
  db: CustomShellDb = defaultDb
): Promise<XKeywordIdea[]> {
  if (!input.trends.length) return []
  const product = await projectDescription(userId, input.projectId, db)
  if (!product.trim()) throw new Refusal("Describe the project first, in its left column, so the AI knows which trends fit.")
  const picked = await pickProvider()
  const picks = await askModel(
    { userId, ...picked, feature: "x-trends", metadata: { projectId: input.projectId }, prompt: buildXTrendsPrompt(product, input.trends) },
    (answer) => readXTrendPicks(answer, input.trends)
  )
  return picks.map((trend) =>
    trend.startsWith("#") ? { kind: "hashtag" as const, value: xHashtag(trend), trending: true } : { kind: "search" as const, value: trend, trending: true }
  )
}

export type XPostPromptInput = {
  about: string
  product: string
  voice: string
  commentRules: string
  /** A piece to start from: a Reddit comment that did well, or a Medium article (parts 29 and 32). */
  source: string
  /** A link the last piece ends with, such as the Medium article's address, or "". */
  endLink: string
  pieces: number
  limit: number
  communityRules: string
  poll: boolean
}

/** The words handed to the model for a post or thread of your own (part 29). */
function buildXPostPrompt(input: XPostPromptInput): string {
  const thread = input.pieces > 1
  return [
    thread
      ? `Write a thread for X (the site that was Twitter): ${input.pieces} posts that follow on from each other, the first one making people want to read on.`
      : "Write one post for X (the site that was Twitter).",
    `What it is about:\n${input.about.trim()}`,
    input.source.trim() ? `Grow it from this piece, which readers liked:\n"""${input.source.trim().slice(0, 8_000)}"""` : "",
    input.product.trim()
      ? `What the writer makes:\n${input.product.trim()}\nMention it at most once, plainly, where it really helps. The post is useful without it.`
      : "Do not mention any product.",
    input.voice.trim() ? `How the writer writes:\n${input.voice.trim()}` : "",
    input.commentRules.trim() ? `Lines the writer never crosses:\n${input.commentRules.trim()}` : "",
    input.communityRules.trim() ? `It goes into an X community with these rules:\n${input.communityRules.trim().slice(0, 3_000)}` : "",
    input.poll ? "The first post is a poll: end it with a question, and on lines after it write CHOICE: and a choice of at most 25 characters, two to four of them." : "",
    input.endLink ? `End the last post with this address on its own line: ${input.endLink}` : "",
    "X's own rules you must keep:",
    X_RULES.map((rule) => `- ${rule}`).join("\n"),
    `Each post is at most ${input.limit} characters, plain text, at most two hashtags and usually none.`,
    thread ? "Separate the posts with a line with only --- on it. Nothing else." : "Answer with the post and nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export type WrittenXPost = { pieces: string[]; choices: string[] }

export function readXPost(answer: string, pieces: number, limit: number): WrittenXPost {
  const choices: string[] = []
  const parts = answer
    .split(/^\s*---\s*$/m)
    .map((part) =>
      part
        .split("\n")
        .filter((line) => {
          const found = line.trim().match(/^CHOICE:\s*(.+)$/i)
          if (found) {
            choices.push((found[1] ?? "").trim().slice(0, 25))
            return false
          }
          return true
        })
        .join("\n")
        .trim()
        .replace(/^["“]|["”]$/g, "")
        .slice(0, limit)
    )
    .filter(Boolean)
    .slice(0, Math.min(pieces, MAX_THREAD_PIECES))
  return { pieces: parts, choices: choices.filter(Boolean).slice(0, 4) }
}

/** A post or a thread of your own in the account's voice (parts 29, 32 and 33). Not stored: it fills the boxes. */
export async function writeXPost(
  userId: string,
  input: {
    projectId: string
    accountId: string | null
    about: string
    pieces: number
    source: string
    endLink: string
    communityRules: string
    poll: boolean
  },
  db: CustomShellDb = defaultDb
): Promise<WrittenXPost> {
  const about = input.about.trim() || input.source.trim().slice(0, 300)
  if (!about) throw new Refusal("Say in a line what the post is about first.")
  const pieces = Math.max(1, Math.min(MAX_THREAD_PIECES, Math.round(input.pieces)))
  const { words, limit } = await accountWords(userId, input.accountId, input.projectId, db)
  const product = await projectDescription(userId, input.projectId, db)
  const picked = await pickProvider()
  return askModel(
    {
      userId,
      ...picked,
      feature: "x-post",
      metadata: { projectId: input.projectId, pieces },
      prompt: buildXPostPrompt({ about, product, ...words, source: input.source, endLink: input.endLink, pieces, limit, communityRules: input.communityRules, poll: input.poll }),
      maxTokens: 2_000,
    },
    (answer) => {
      const written = readXPost(answer, pieces, limit)
      if (!written.pieces.length) throw new Error(`${picked.provider} answered, but nothing in the answer looked like a post.`)
      return input.endLink ? { ...written, pieces: endWithLink(written.pieces, input.endLink, limit) } : written
    }
  )
}

/**
 * The last post with the link put on its end by the app, not the AI, so the
 * address is never cut: any link the AI wrote is taken out, and words are
 * dropped from the end until the post fits, counted the way X counts.
 */
export function endWithLink(pieces: string[], link: string, limit: number): string[] {
  const last = (pieces[pieces.length - 1] ?? "").replace(/https?:\/\/\S+/g, "").trim()
  const words = last.split(/\s+/).filter(Boolean)
  while (words.length && xLength(`${words.join(" ")}\n${link}`) > limit) words.pop()
  const ended = words.length ? `${words.join(" ")}\n${link}` : link
  return [...pieces.slice(0, -1), ended]
}
