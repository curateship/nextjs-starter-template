import { and, desc, eq, isNull, ne } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  CONNECT_NOTE_CHARS,
  LINKEDIN_COMMENT_CHARS,
  LINKEDIN_DRAFTS_PER_PRESS,
  LINKEDIN_POST_CHARS,
  LINKEDIN_REWRITE_WORDS,
  NEWSLETTER_BODY_CHARS,
  NEWSLETTER_TITLE_CHARS,
  linkedinHashtag,
  linkedinSlug,
  type LinkedinKeywordKind,
  type LinkedinRewrite,
  type LinkedinTopComment,
} from "@/lib/social/linkedin/options"

import { askModel, pickProvider } from "../drafts"
import { projectDescription } from "../projects"
import { promoAccounts } from "../schema"
import { NO_WORDS, wordsForAccount, type VoiceWords } from "../voices"
import { ownedLinkedinFind, questionFinds } from "./finds"
import { promoLinkedinComments, promoLinkedinDrafts } from "./schema"

/**
 * Asking the AI for LinkedIn's words: comments, replies, answers, rewrites,
 * the rules check, keyword and people ideas, posts of your own, newsletter
 * issues, connection notes and post ideas (parts 16, 22, 24, 25, 28, 34, 35,
 * 36 and 39). Every call goes through `askModel`, so it counts against the
 * month's AI allowance and shows on the AI usage screen under a `linkedin-`
 * line, with the project it was for (part 48). Nothing here sends anything:
 * a person presses Post.
 */

/**
 * LinkedIn's own rules, as far as they touch a comment or a post, read off
 * its Professional Community Policies (linkedin.com/legal/professional-community-policies)
 * and put in short. Handed to the rules check and to every prompt. Re-read
 * the page when LinkedIn changes it.
 */
export const LINKEDIN_RULES = [
  "Be professional: no insults, no harassment, nothing a person would not say at work.",
  "No spam: no posting the same or nearly the same comment again and again, from one account or several.",
  "No using several accounts to make one person or product look more popular, or to talk to each other.",
  "No misleading claims, and nothing that pretends to be someone or something it is not.",
  "No engagement bait: no asking people to like, comment or share just to spread the post.",
  "Paid promotion must be disclosed when the writer was given something for it.",
]

export const LINKEDIN_RULES_READ_ON = "22 Oct 2026"

/**
 * Tyler's rule for when a comment names the product, 22 Oct 2026: "Only when
 * it solves the post". Said to the AI in these words.
 */
const WHEN_TO_NAME =
  "Name the product only when the post is about a problem the product solves. Otherwise just help, and do not mention the product at all."

/** Tyler's answer, 22 Oct 2026: never a link in a comment. */
const NO_LINKS = "Never put a link, a web address or a domain name in a comment."

/** How a LinkedIn comment reads, unlike an X reply. */
const LINKEDIN_TONE =
  "LinkedIn comments read like a colleague talking: plain, specific and a little longer than a tweet, two to five sentences, no hashtags, no emojis unless the post uses them, no greeting, no 'Great post!'."

/** How many of the account's own sent comments are shown to the AI as its voice. */
const EXAMPLES = 3

export type LinkedinCommentPromptInput = {
  post: { text: string; author: string; headline: string }
  /** The top comment being answered instead of the post (part 25). */
  under: LinkedinTopComment | null
  /** The post's top comments, so the draft adds something new (part 22). */
  topComments: LinkedinTopComment[]
  voice: string
  commentRules: string
  /** The project's description, or "" for none. */
  product: string
  /** The account's own best comments, as examples of its voice (part 24). */
  examples: string[]
  /** A help-only comment never names the product. */
  helpOnly: boolean
  /** When answering somebody: what they wrote under one of ours. */
  answering: { mine: string; theirs: string; author: string } | null
  /** Writing as a company page (part 38), its name; "" for the person. */
  asPage: string
  count: number
}

/** "Jane Doe, Founder at Acme": a writer as the prompt names them. */
function who(name: string, headline: string): string {
  return headline ? `${name || "someone"}, ${headline}` : name || "someone"
}

/** The words handed to the model for a comment, a reply under a top comment, or an answer. */
export function buildLinkedinCommentPrompt(input: LinkedinCommentPromptInput): string {
  const lines: string[] = []
  if (input.answering) {
    lines.push(
      `You are answering someone on LinkedIn. ${input.answering.author || "Someone"} replied to you.`,
      input.answering.mine ? `What you wrote:\n"""${input.answering.mine}"""` : "",
      `What they wrote:\n"""${input.answering.theirs}"""`
    )
  } else if (input.under) {
    lines.push(
      "You are replying on LinkedIn to one of the top comments under a post.",
      `The post, by ${who(input.post.author, input.post.headline)}:\n"""${input.post.text}"""`,
      `The comment you answer, by ${who(input.under.name, input.under.headline)}:\n"""${input.under.text}"""`
    )
  } else {
    lines.push("You are commenting on a LinkedIn post.", `The post, by ${who(input.post.author, input.post.headline)}:\n"""${input.post.text}"""`)
  }
  if (!input.answering && input.topComments.length) {
    lines.push(
      "Comments already under it. Add something they do not say; never repeat them:",
      ...input.topComments.map((comment) => `- ${comment.name || "someone"}: ${comment.text.slice(0, 400)}`)
    )
  }
  if (input.asPage) lines.push(`You write as the company page "${input.asPage}", so say "we", never "I".`)
  if (input.voice.trim()) lines.push(`How you write:\n${input.voice.trim()}`)
  if (input.commentRules.trim()) lines.push(`Lines you never cross:\n${input.commentRules.trim()}`)
  if (input.examples.length) {
    lines.push("Comments you really sent before that people liked, for your voice only, never to copy:", ...input.examples.map((text) => `- ${text}`))
  }
  if (input.helpOnly || !input.product.trim()) {
    lines.push("Do not mention any product, tool, company or link. Only help.")
  } else {
    lines.push(`What you make:\n${input.product.trim()}`, WHEN_TO_NAME)
  }
  lines.push(
    "LinkedIn's own rules you must keep:",
    ...LINKEDIN_RULES.map((rule) => `- ${rule}`),
    NO_LINKS,
    LINKEDIN_TONE,
    `Each one is at most ${LINKEDIN_COMMENT_CHARS} characters, plain text, and reads like a person who read the post.`,
    `Write ${input.count} different ${input.answering ? "answers" : "comments"}, separated by a line with only --- on it. Nothing else.`
  )
  return lines.filter(Boolean).join("\n\n")
}

/** The drafts out of the model's answer, each cut to LinkedIn's limit. */
export function splitLinkedinDrafts(answer: string, count: number, limit = LINKEDIN_COMMENT_CHARS): string[] {
  return answer
    .split(/^\s*---\s*$/m)
    .map((part) => part.trim().replace(/^["“]|["”]$/g, "").slice(0, limit))
    .filter((text) => text.length > 0)
    .slice(0, count)
}

/**
 * The account's own sent comments that people liked most, as its voice
 * (part 29). A comment switched off on the Comments tab, a help-only one, an
 * answer and a deleted one never count. Ones it typed or edited come first
 * among equals, as on the other networks (`../examples.ts`).
 */
export async function exampleLinkedinComments(userId: string, accountId: string, db: CustomShellDb): Promise<string[]> {
  const rows = await db
    .select({ text: promoLinkedinComments.text, reactions: promoLinkedinComments.reactions, draftId: promoLinkedinComments.draftId, editedAt: promoLinkedinComments.editedAt })
    .from(promoLinkedinComments)
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        eq(promoLinkedinComments.accountId, accountId),
        eq(promoLinkedinComments.status, "posted"),
        ne(promoLinkedinComments.kind, "answer"),
        isNull(promoLinkedinComments.deletedAt),
        eq(promoLinkedinComments.helpOnly, false),
        eq(promoLinkedinComments.notExample, false)
      )
    )
    .orderBy(desc(promoLinkedinComments.postedAt))
    .limit(60)
  const own = (row: (typeof rows)[number]) => !row.draftId || row.editedAt !== null
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (b.row.reactions ?? 0) - (a.row.reactions ?? 0) || Number(own(b.row)) - Number(own(a.row)) || a.index - b.index)
    .slice(0, EXAMPLES)
    .map(({ row }) => row.text)
}

/** The account's voice and best comments, checked as a LinkedIn account of the person's in this project. */
async function accountWords(
  userId: string,
  accountId: string | null,
  projectId: string,
  db: CustomShellDb
): Promise<{ words: VoiceWords; examples: string[] }> {
  if (!accountId) return { words: NO_WORDS, examples: [] }
  const [account] = await db
    .select({ id: promoAccounts.id, projectId: promoAccounts.projectId, platform: promoAccounts.platform })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "linkedin") throw new Refusal("Pick a LinkedIn account first.")
  if (account.projectId !== projectId) throw new Refusal("That account is not in this project.")
  return { words: await wordsForAccount(userId, account.id, db), examples: await exampleLinkedinComments(userId, account.id, db) }
}

export type LinkedinDraftView = { id: string; text: string; replyToId: string; helpOnly: boolean; rewrite: string; createdAt: Date }

/**
 * Two drafts for a post, in the account's voice: comments, or replies under
 * one of its top comments. Stored, so what was asked for and what went out
 * can be compared. A help-only press tells the AI nothing about the product.
 */
export async function writeLinkedinDrafts(
  userId: string,
  input: { findId: string; accountId: string | null; helpOnly: boolean; underCommentId?: string; asPage?: string; provider?: string; model?: string },
  db: CustomShellDb = defaultDb
): Promise<LinkedinDraftView[]> {
  const find = await ownedLinkedinFind(userId, input.findId, db)
  if (!find) throw new Error("That LinkedIn post is no longer saved.")
  const under = input.underCommentId ? ((find.topComments ?? []).find((comment) => comment.id === input.underCommentId) ?? null) : null
  if (input.underCommentId && !under) throw new Refusal("That comment is not one of the post's top comments as Promo read them.")
  const { words, examples } = await accountWords(userId, input.accountId, find.projectId, db)
  const product = input.helpOnly ? "" : await projectDescription(userId, find.projectId, db)
  const picked = await pickProvider(input)
  const prompt = buildLinkedinCommentPrompt({
    post: { text: find.text, author: find.authorName, headline: find.authorHeadline },
    under,
    topComments: find.topComments ?? [],
    ...words,
    product,
    examples,
    helpOnly: input.helpOnly,
    answering: null,
    asPage: input.asPage ?? "",
    count: LINKEDIN_DRAFTS_PER_PRESS,
  })
  const drafts = await askModel(
    { userId, ...picked, feature: "linkedin-comment", metadata: { projectId: find.projectId, findId: find.id, postId: find.postId }, prompt },
    (answer) => {
      const split = splitLinkedinDrafts(answer, LINKEDIN_DRAFTS_PER_PRESS)
      if (!split.length) throw new Error(`${picked.provider} answered, but nothing in the answer looked like a comment.`)
      return split
    }
  )
  const now = new Date()
  const rows = drafts.map((text) => ({
    id: uuid(),
    userId,
    findId: find.id,
    replyToId: under?.id ?? "",
    text,
    helpOnly: input.helpOnly,
    provider: picked.provider,
    model: picked.model,
    createdAt: now,
  }))
  await db.insert(promoLinkedinDrafts).values(rows)
  return rows.map((row) => ({ id: row.id, text: row.text, replyToId: row.replyToId, helpOnly: row.helpOnly, rewrite: "", createdAt: row.createdAt }))
}

/** A draft answer to somebody who replied to the account. Not stored: it goes in the box. */
export async function writeLinkedinAnswer(
  userId: string,
  input: { projectId: string; accountId: string; mine: string; theirs: string; author: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const { words, examples } = await accountWords(userId, input.accountId, input.projectId, db)
  const product = await projectDescription(userId, input.projectId, db)
  const picked = await pickProvider()
  const prompt = buildLinkedinCommentPrompt({
    post: { text: "", author: "", headline: "" },
    under: null,
    topComments: [],
    ...words,
    product,
    examples,
    helpOnly: false,
    answering: { mine: input.mine, theirs: input.theirs, author: input.author },
    asPage: "",
    count: 1,
  })
  return askModel({ userId, ...picked, feature: "linkedin-answer", metadata: { projectId: input.projectId }, prompt }, (answer) => {
    const [first] = splitLinkedinDrafts(answer, 1)
    if (!first) throw new Error(`${picked.provider} answered, but nothing in the answer looked like an answer.`)
    return first
  })
}

const REWRITE_ASK: Record<LinkedinRewrite, string> = {
  shorter: "Make it about half as long. Keep its one most useful point.",
  warmer: "Make it warmer and more personal, as a colleague who liked the post, without flattering it.",
  less_salesy:
    "Make it less salesy: help first, and take out anything that reads like an advert. If it names a product, name it at most once, plainly, or not at all.",
}

/** A rewrite of the words in the box (part 22), stored as a draft so the record of what the AI wrote stays honest. */
export async function rewriteLinkedinComment(
  userId: string,
  input: { findId: string; text: string; how: LinkedinRewrite },
  db: CustomShellDb = defaultDb
): Promise<LinkedinDraftView> {
  if (!LINKEDIN_REWRITE_WORDS[input.how]) throw new Error("That rewrite is not one Promo knows.")
  const text = input.text.trim()
  if (!text) throw new Refusal("Write the comment first, then rewrite it.")
  const find = await ownedLinkedinFind(userId, input.findId, db)
  if (!find) throw new Error("That LinkedIn post is no longer saved.")
  const picked = await pickProvider()
  const prompt = [
    "Rewrite this LinkedIn comment.",
    REWRITE_ASK[input.how],
    NO_LINKS,
    `Keep it at most ${LINKEDIN_COMMENT_CHARS} characters, plain text. Answer with the new comment and nothing else.`,
    `The comment:\n"""${text}"""`,
  ].join("\n\n")
  const rewritten = await askModel(
    { userId, ...picked, feature: "linkedin-rewrite", metadata: { projectId: find.projectId, findId: find.id, how: input.how }, prompt },
    (answer) => {
      const clean = answer.trim().replace(/^["“]|["”]$/g, "").slice(0, LINKEDIN_COMMENT_CHARS)
      if (!clean) throw new Error(`${picked.provider} answered with nothing.`)
      return clean
    }
  )
  const row = { id: uuid(), userId, findId: find.id, text: rewritten, rewrite: input.how, provider: picked.provider, model: picked.model, createdAt: new Date() }
  await db.insert(promoLinkedinDrafts).values(row)
  return { id: row.id, text: row.text, replyToId: "", helpOnly: false, rewrite: input.how, createdAt: row.createdAt }
}

export type LinkedinRulesVerdict = { ok: boolean; problems: string[] }

export function readLinkedinRulesAnswer(answer: string): LinkedinRulesVerdict {
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

/** Checks a comment or a post against LinkedIn's rules, and a group's when one is named (parts 22 and 37). */
export async function checkLinkedinRules(
  userId: string,
  input: { projectId: string; text: string; groupRules?: string; isComment: boolean }
): Promise<LinkedinRulesVerdict> {
  const text = input.text.trim()
  if (!text) throw new Refusal("Write something first, then check it.")
  const picked = await pickProvider()
  const prompt = [
    "Check this piece of writing for LinkedIn against the rules below. Only flag a rule it really breaks.",
    "LinkedIn's rules:",
    LINKEDIN_RULES.map((rule) => `- ${rule}`).join("\n"),
    input.isComment ? `- ${NO_LINKS}` : "",
    input.groupRules?.trim() ? `The group's own rules:\n${input.groupRules.trim().slice(0, 4_000)}` : "",
    `The writing:\n"""${text.slice(0, 8_000)}"""`,
    "Answer OK on its own line when it breaks none. Otherwise write one line per rule it breaks, each starting with - and saying which rule and what in the writing breaks it.",
  ]
    .filter(Boolean)
    .join("\n\n")
  return askModel({ userId, ...picked, feature: "linkedin-rules-check", metadata: { projectId: input.projectId }, prompt }, readLinkedinRulesAnswer)
}

export type LinkedinKeywordIdea = { kind: LinkedinKeywordKind; value: string }

export function readLinkedinKeywordIdeas(answer: string): LinkedinKeywordIdea[] {
  const out: LinkedinKeywordIdea[] = []
  for (const line of answer.split("\n")) {
    const found = line.trim().match(/^(SEARCH|HASHTAG|PERSON|COMPANY):\s*(.+)$/i)
    if (!found) continue
    const label = (found[1] ?? "").toLowerCase()
    const kind: LinkedinKeywordKind = label === "hashtag" ? "hashtag" : label === "person" ? "person" : label === "company" ? "company" : "search"
    const raw = (found[2] ?? "").trim().replace(/^["“]|["”]$/g, "")
    const value = kind === "hashtag" ? linkedinHashtag(raw) : kind === "person" || kind === "company" ? linkedinSlug(raw, kind) : raw.slice(0, 200)
    if (value && !out.some((idea) => idea.kind === kind && idea.value.toLowerCase() === value.toLowerCase())) out.push({ kind, value })
  }
  return out
}

/**
 * Search words, hashtags, people and company pages worth trying, from the
 * project's description (part 16). People and pages are not shown until a
 * search account has looked each one up on LinkedIn: the AI names pages that
 * no longer exist.
 */
export async function linkedinKeywordIdeas(
  userId: string,
  input: { projectId: string; existing: string[] },
  db: CustomShellDb = defaultDb
): Promise<LinkedinKeywordIdea[]> {
  const product = await projectDescription(userId, input.projectId, db)
  if (!product.trim()) throw new Refusal("Describe the project first, in its left column, so the AI knows what to look for.")
  const picked = await pickProvider()
  const prompt = [
    "Suggest where on LinkedIn the people who would want this product talk.",
    `What it is:\n${product.trim()}`,
    input.existing.length ? `Already used, do not repeat: ${input.existing.join(", ")}` : "",
    "Answer with up to 5 lines starting SEARCH: (words a person would post when they have the problem), up to 4 lines starting HASHTAG: (a hashtag people really use on the topic), up to 4 lines starting PERSON: (the linkedin.com/in/ address of a real, active person who posts about the topic and gets comments), and up to 3 lines starting COMPANY: (the linkedin.com/company/ address of a real company page on the topic). Nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n")
  return askModel({ userId, ...picked, feature: "linkedin-keyword-ideas", metadata: { projectId: input.projectId }, prompt }, (answer) => {
    const ideas = readLinkedinKeywordIdeas(answer)
    if (!ideas.length) throw new Error(`${picked.provider} answered, but with no search words, hashtags, people or pages.`)
    return ideas
  })
}

export type LinkedinPostPromptInput = {
  about: string
  product: string
  voice: string
  commentRules: string
  /** A piece to start from: a Reddit comment that did well, a Medium article, or a question people ask (parts 34 and 35). */
  source: string
  /** Writing the line on top of a repost (part 33): the post being shared. */
  reposting: string
  groupRules: string
  poll: boolean
  asPage: string
}

/** The words handed to the model for a post of your own (part 28). */
export function buildLinkedinPostPrompt(input: LinkedinPostPromptInput): string {
  return [
    input.reposting
      ? "Write the short line you put on top of someone's LinkedIn post when you share it: why it is worth reading, in a sentence or three of your own."
      : "Write one LinkedIn post.",
    input.reposting ? `The post you share:\n"""${input.reposting.slice(0, 3_000)}"""` : "",
    `What it is about:\n${input.about.trim()}`,
    input.source.trim() ? `Grow it from this piece, which readers liked. Rewrite it for LinkedIn; never copy it:\n"""${input.source.trim().slice(0, 8_000)}"""` : "",
    input.product.trim()
      ? `What the writer makes:\n${input.product.trim()}\nMention it at most once, plainly, where it really helps. The post is useful without it.`
      : "Do not mention any product.",
    input.asPage ? `It goes out as the company page "${input.asPage}", so say "we", never "I".` : "",
    input.voice.trim() ? `How the writer writes:\n${input.voice.trim()}` : "",
    input.commentRules.trim() ? `Lines the writer never crosses:\n${input.commentRules.trim()}` : "",
    input.groupRules.trim() ? `It goes into a LinkedIn group with these rules:\n${input.groupRules.trim().slice(0, 3_000)}` : "",
    input.poll
      ? "It is a poll: write the post, then a line QUESTION: and the poll's question of at most 140 characters, then lines CHOICE: and an answer of at most 30 characters, two to four of them."
      : "",
    "LinkedIn's own rules you must keep:",
    LINKEDIN_RULES.map((rule) => `- ${rule}`).join("\n"),
    "No link in the words: a link goes in the first comment instead. Short paragraphs, plain text, at most three hashtags at the very end and usually none.",
    `At most ${input.reposting ? 600 : LINKEDIN_POST_CHARS} characters. Answer with the post and nothing else.`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export type WrittenLinkedinPost = { text: string; question: string; choices: string[] }

export function readWrittenLinkedinPost(answer: string): WrittenLinkedinPost {
  let question = ""
  const choices: string[] = []
  const text = answer
    .split("\n")
    .filter((line) => {
      const asked = line.trim().match(/^QUESTION:\s*(.+)$/i)
      if (asked) {
        question = (asked[1] ?? "").trim().slice(0, 140)
        return false
      }
      const choice = line.trim().match(/^CHOICE:\s*(.+)$/i)
      if (choice) {
        choices.push((choice[1] ?? "").trim().slice(0, 30))
        return false
      }
      return true
    })
    .join("\n")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .slice(0, LINKEDIN_POST_CHARS)
  return { text, question, choices: choices.filter(Boolean).slice(0, 4) }
}

/** A post of your own in the account's voice (parts 28, 31, 33, 34 and 35). Not stored: it fills the box. */
export async function writeLinkedinPost(
  userId: string,
  input: Omit<LinkedinPostPromptInput, "product" | "voice" | "commentRules"> & { projectId: string; accountId: string | null },
  db: CustomShellDb = defaultDb
): Promise<WrittenLinkedinPost> {
  const about = input.about.trim() || input.source.trim().slice(0, 300) || input.reposting.trim().slice(0, 300)
  if (!about) throw new Refusal("Say in a line what the post is about first.")
  const { words } = await accountWords(userId, input.accountId, input.projectId, db)
  const product = await projectDescription(userId, input.projectId, db)
  const picked = await pickProvider()
  return askModel(
    {
      userId,
      ...picked,
      feature: "linkedin-post",
      metadata: { projectId: input.projectId },
      prompt: buildLinkedinPostPrompt({ ...input, about, product, ...words }),
      maxTokens: 2_000,
    },
    (answer) => {
      const written = readWrittenLinkedinPost(answer)
      if (!written.text) throw new Error(`${picked.provider} answered, but nothing in the answer looked like a post.`)
      return written
    }
  )
}

/**
 * An outline, or the issue written from an outline, for the account's
 * newsletter (part 36). Starting from a Medium article, the AI rewrites it
 * so the two never read as copies of each other.
 */
export async function writeLinkedinNewsletter(
  userId: string,
  input: { projectId: string; accountId: string | null; about: string; source: string; outline: string; step: "outline" | "issue" },
  db: CustomShellDb = defaultDb
): Promise<{ title: string; body: string }> {
  const about = input.about.trim() || input.source.trim().slice(0, 300)
  if (!about) throw new Refusal("Say in a line what the issue is about first.")
  if (input.step === "issue" && !input.outline.trim()) throw new Refusal("Write or ask for the outline first.")
  const { words } = await accountWords(userId, input.accountId, input.projectId, db)
  const product = await projectDescription(userId, input.projectId, db)
  const picked = await pickProvider()
  const prompt = [
    input.step === "outline"
      ? "Write the outline of one issue of a LinkedIn newsletter: a title on the first line starting TITLE:, then 4 to 7 section headings, each with one line on what it says."
      : "Write one issue of a LinkedIn newsletter from the outline below: a title on the first line starting TITLE:, then the body in short paragraphs with the outline's headings.",
    `What it is about:\n${about}`,
    input.source.trim()
      ? `Grow it from this Medium article. Rewrite it in new words and a new order; never copy its sentences, because the same words on two sites read as copied:\n"""${input.source.trim().slice(0, 10_000)}"""`
      : "",
    input.step === "issue" ? `The outline:\n"""${input.outline.trim().slice(0, 4_000)}"""` : "",
    product.trim() ? `What the writer makes:\n${product.trim()}\nMention it at most twice, plainly, where it really helps.` : "",
    words.voice.trim() ? `How the writer writes:\n${words.voice.trim()}` : "",
    words.commentRules.trim() ? `Lines the writer never crosses:\n${words.commentRules.trim()}` : "",
    "LinkedIn's own rules you must keep:",
    LINKEDIN_RULES.map((rule) => `- ${rule}`).join("\n"),
    `The title is at most ${NEWSLETTER_TITLE_CHARS} characters. Plain text, no markdown symbols.`,
  ]
    .filter(Boolean)
    .join("\n\n")
  return askModel(
    { userId, ...picked, feature: "linkedin-newsletter", metadata: { projectId: input.projectId, step: input.step }, prompt, maxTokens: input.step === "issue" ? 6_000 : 1_200 },
    (answer) => {
      const lines = answer.trim().split("\n")
      const titleLine = lines.findIndex((line) => /^TITLE:/i.test(line.trim()))
      const title = titleLine >= 0 ? (lines[titleLine] ?? "").replace(/^\s*TITLE:\s*/i, "").trim().slice(0, NEWSLETTER_TITLE_CHARS) : ""
      const body = lines.filter((_, index) => index !== titleLine).join("\n").trim().slice(0, NEWSLETTER_BODY_CHARS)
      if (!body) throw new Error(`${picked.provider} answered, but nothing in the answer looked like ${input.step === "outline" ? "an outline" : "an issue"}.`)
      return { title, body }
    }
  )
}

/**
 * The short note on a connection request (part 39). Tyler, 22 Oct 2026: the
 * AI writes it and he can edit it before Send. It names the post the account
 * commented on, never the product, and carries no link.
 */
export async function writeConnectNote(
  userId: string,
  input: { projectId: string; accountId: string; name: string; headline: string; why: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const { words } = await accountWords(userId, input.accountId, input.projectId, db)
  const picked = await pickProvider()
  const prompt = [
    `Write the short note sent with a LinkedIn connection request to ${who(input.name, input.headline)}.`,
    `Why you are writing: ${input.why}`,
    words.voice.trim() ? `How you write:\n${words.voice.trim()}` : "",
    "Name what you talked about in a few words, say you would like to stay in touch, and nothing else. Never mention a product, never sell, never put a link.",
    `At most ${CONNECT_NOTE_CHARS} characters, plain text, no greeting line of its own. Answer with the note and nothing else.`,
  ]
    .filter(Boolean)
    .join("\n\n")
  return askModel({ userId, ...picked, feature: "linkedin-connect-note", metadata: { projectId: input.projectId }, prompt }, (answer) => {
    const clean = answer.trim().replace(/^["“]|["”]$/g, "").slice(0, CONNECT_NOTE_CHARS)
    if (!clean) throw new Error(`${picked.provider} answered with nothing.`)
    return clean
  })
}

export type LinkedinPostIdea = { question: string; findId: string; about: string }

/**
 * Ideas for posts of your own from the questions people asked in the
 * project's LinkedIn finds and their comments (part 35). Each idea names the
 * find it came from.
 */
export async function linkedinPostIdeas(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<LinkedinPostIdea[]> {
  const finds = await questionFinds(userId, projectId, db)
  if (!finds.length) throw new Refusal("No LinkedIn post found for this project asks a question yet. Add keywords and let them search first.")
  const product = await projectDescription(userId, projectId, db)
  const numbered = finds.map((find, index) => {
    const asked = [find.text, ...(find.topComments ?? []).map((comment) => comment.text)].join("\n").slice(0, 1_200)
    return `[${index + 1}]\n${asked}`
  })
  const picked = await pickProvider()
  const prompt = [
    "These are LinkedIn posts and their comments. Find the questions people really ask in them that would make a good LinkedIn post of its own.",
    product.trim() ? `The writer makes:\n${product.trim()}` : "",
    numbered.join("\n\n"),
    "Answer with up to 6 lines, each IDEA: then the number in brackets of the piece it came from, then the question, then | and a line on what the post would say. For example: IDEA: [3] How do you price a first SaaS? | Three pricing mistakes and what to do instead. Nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n")
  return askModel({ userId, ...picked, feature: "linkedin-post-ideas", metadata: { projectId }, prompt }, (answer) => {
    const ideas: LinkedinPostIdea[] = []
    for (const line of answer.split("\n")) {
      const found = line.trim().match(/^IDEA:\s*\[(\d+)\]\s*(.+?)\s*\|\s*(.+)$/i)
      const find = found ? finds[Number(found[1]) - 1] : undefined
      if (!found || !find) continue
      ideas.push({ question: (found[2] ?? "").slice(0, 300), findId: find.id, about: (found[3] ?? "").slice(0, 300) })
    }
    if (!ideas.length) throw new Error(`${picked.provider} answered, but with no ideas tied to a post.`)
    return ideas
  })
}
