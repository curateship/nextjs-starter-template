import { and, desc, eq, isNull } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  ARTICLE_WORDS,
  MAX_ARTICLE_TAGS,
  MAX_RESPONSE_CHARS,
  MEDIUM_DRAFTS_PER_PRESS,
  mediumTagSlug,
  RESPONSE_REWRITE_WORDS,
  type MediumKeywordKind,
  type MediumOutline,
  type MediumStoryResponse,
  type ResponseRewrite,
} from "@/lib/social/medium/options"

import { askModel, pickProvider } from "../drafts"
import { projectDescription } from "../projects"
import { promoAccounts } from "../schema"
import { NO_WORDS, wordsForAccount, type VoiceWords } from "../voices"
import { ownedMediumFind } from "./finds"
import { promoMediumDrafts, promoMediumResponses } from "./schema"

/**
 * Asking the AI for Medium's words: responses, rewrites, the rules check,
 * keyword ideas, and everything an article needs (parts 8, 17, 18, 22, 24,
 * 27, 29, 30, 31). Every call goes through `askModel`, so it counts against
 * the month's AI allowance and shows on the AI usage screen under a
 * `medium-` line, with the project it was for (part 41). Nothing here sends
 * anything: a person presses Post or Publish.
 */

/**
 * Medium's own rules, as far as they touch a response or an article, read
 * off "Medium Rules" (policy.medium.com/medium-rules-30e5502c4eb4, dated
 * 26 May 2021) on 21 Oct 2026 and put in short. Handed to the rules check
 * (part 18) and to every prompt. Re-read the page when Medium changes it.
 */
export const MEDIUM_RULES = [
  "No posting mainly to drive traffic to, or raise the search ranking of, an outside site, product or service.",
  "No repeatedly using responses, mentions or other interactions as a way to promote or market something.",
  "No duplicate content, from one account or across several, and no templates reused with small changes.",
  "No stories clipped so that the rest is behind a link to another site.",
  "Promoting your own business, website or mailing list is allowed. Advertising or sponsoring someone else's is not.",
  "Affiliate links must be disclosed in the post, for example with one sentence at the end.",
  "A link to your own newsletter or blog must say, right next to it, that it leaves Medium.",
  "If you got something for free or of value connected to the topic, you must say so.",
  "No misleading tags, links or titles.",
]

export const MEDIUM_RULES_READ_ON = "21 Oct 2026"

/**
 * Tyler's rule for when a response names the product, 21 Oct 2026: "Only
 * when the story asks for it". Said to the AI in these words.
 */
const WHEN_TO_NAME =
  "Name the product only when the story is about a problem the product solves. Otherwise just help, and do not mention the product at all."

/** How many of the account's own sent responses are shown to the AI as its voice. */
const EXAMPLES = 3

/** How much of the story the AI is shown. */
const STORY_CHARS = 4_000

export type ResponsePromptInput = {
  title: string
  writer: string
  publication: string
  text: string
  membersOnly: boolean
  /** The story's top responses, so the draft adds something new (part 19). */
  responses: MediumStoryResponse[]
  voice: string
  commentRules: string
  /** The project's description, or "" for none. */
  product: string
  /** The account's own sent responses, as examples of its voice. */
  examples: string[]
  /** A help-only response never names the product (part 22). */
  helpOnly: boolean
  /** When answering somebody: what they wrote under one of ours. */
  answering: { mine: string; theirs: string; writer: string } | null
  count: number
}

/** The words handed to the model for a response or an answer. Exported for the test. */
export function buildMediumResponsePrompt(input: ResponsePromptInput): string {
  const lines: string[] = []
  if (input.answering) {
    lines.push(
      `You are answering a reply on Medium. Someone, ${input.answering.writer || "a reader"}, responded to something you wrote.`,
      `What you wrote:\n"""${input.answering.mine}"""`,
      `What they wrote back:\n"""${input.answering.theirs}"""`,
      `The story it was all under: "${input.title}".`
    )
  } else {
    lines.push(
      `You are writing a response (Medium's word for a comment) to a story on Medium.`,
      `Title: ${input.title}`,
      input.writer ? `Written by: ${input.writer}` : "",
      input.publication ? `In the publication: ${input.publication}` : "",
      `The story${input.membersOnly ? " (members-only, so only its opening was readable)" : ""}:\n"""${input.text.slice(0, STORY_CHARS)}"""`
    )
    if (input.responses.length) {
      lines.push(
        "Responses already under it. Add something they do not say; never repeat them:",
        ...input.responses.map((response) => `- ${response.writer || "someone"}: ${response.text.slice(0, 400)}`)
      )
    }
  }
  if (input.voice.trim()) lines.push(`How you write:\n${input.voice.trim()}`)
  if (input.commentRules.trim()) lines.push(`Lines you never cross:\n${input.commentRules.trim()}`)
  if (input.examples.length) {
    lines.push("Responses you really sent before, for your voice only, never to copy:", ...input.examples.map((text) => `- ${text}`))
  }
  if (input.helpOnly || !input.product.trim()) {
    lines.push("Do not mention any product, tool, company or link. Only help.")
  } else {
    lines.push(`What you make:\n${input.product.trim()}`, WHEN_TO_NAME)
  }
  lines.push(
    "Medium's own rules you must keep:",
    ...MEDIUM_RULES.map((rule) => `- ${rule}`),
    `Each response is under ${MAX_RESPONSE_CHARS} characters, plain text, no hashtags, no greeting like "Great article!", and reads like a person who read the story.`
  )
  if (!input.answering) {
    lines.push(
      "Before each response, on a line of its own, write LINE: and then one sentence copied exactly from the story that the response answers, or LINE: with nothing after it when it answers the story as a whole."
    )
  }
  lines.push(`Write ${input.count} different responses, separated by a line with only --- on it. Nothing else.`)
  return lines.filter(Boolean).join("\n\n")
}

export type SplitDraft = { text: string; line: string }

/**
 * The drafts out of the model's answer, each with the sentence it answers.
 * A line that is not really in the story is dropped, so the browser is never
 * sent to highlight words that are not there.
 */
export function splitMediumDrafts(answer: string, count: number, storyText = ""): SplitDraft[] {
  return answer
    .split(/^\s*---\s*$/m)
    .map((part) => {
      let line = ""
      const text = part
        .split("\n")
        .filter((row) => {
          const found = row.match(/^\s*LINE:\s*(.*)$/)
          if (found) {
            line = found[1].trim().replace(/^["“]|["”]$/g, "")
            return false
          }
          return true
        })
        .join("\n")
        .trim()
        .replace(/^["“]|["”]$/g, "")
      if (line && !storyText.includes(line)) line = ""
      return { text: text.slice(0, MAX_RESPONSE_CHARS), line }
    })
    .filter((draft) => draft.text.length > 0)
    .slice(0, count)
}

/** The account's own sent responses, newest first, as its voice. */
async function exampleResponses(userId: string, accountId: string, db: CustomShellDb): Promise<string[]> {
  const rows = await db
    .select({ text: promoMediumResponses.text })
    .from(promoMediumResponses)
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        eq(promoMediumResponses.accountId, accountId),
        eq(promoMediumResponses.status, "posted"),
        isNull(promoMediumResponses.deletedAt),
        eq(promoMediumResponses.helpOnly, false)
      )
    )
    .orderBy(desc(promoMediumResponses.postedAt))
    .limit(EXAMPLES)
  return rows.map((row) => row.text)
}

/** The account's voice and project, checked as a Medium account of the person's in this project. */
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
  if (!account || account.platform !== "medium") throw new Refusal("Pick a Medium account first.")
  if (account.projectId !== projectId) throw new Refusal("That account is not in this project.")
  return { words: await wordsForAccount(userId, account.id, db), examples: await exampleResponses(userId, account.id, db) }
}

export type MediumDraftView = { id: string; text: string; line: string; helpOnly: boolean; rewrite: string; createdAt: Date }

/**
 * Two response drafts for a story, in the account's voice, stored so what
 * was asked for and what went out can be compared. A help-only press tells
 * the AI nothing about the product (part 22).
 */
export async function writeMediumDrafts(
  userId: string,
  input: { findId: string; accountId: string | null; helpOnly: boolean; provider?: string; model?: string },
  db: CustomShellDb = defaultDb
): Promise<MediumDraftView[]> {
  const find = await ownedMediumFind(userId, input.findId, db)
  if (!find) throw new Error("That Medium story is no longer saved.")
  const { words, examples } = await accountWords(userId, input.accountId, find.projectId, db)
  const product = input.helpOnly ? "" : await projectDescription(userId, find.projectId, db)
  const picked = await pickProvider(input)
  const prompt = buildMediumResponsePrompt({
    title: find.title,
    writer: find.writerName || find.writerHandle,
    publication: find.publicationName,
    text: find.text,
    membersOnly: find.membersOnly,
    responses: find.responses ?? [],
    ...words,
    product,
    examples,
    helpOnly: input.helpOnly,
    answering: null,
    count: MEDIUM_DRAFTS_PER_PRESS,
  })
  const drafts = await askModel(
    {
      userId,
      ...picked,
      feature: "medium-response",
      metadata: { projectId: find.projectId, findId: find.id, storyId: find.storyId },
      prompt,
    },
    (answer) => {
      const split = splitMediumDrafts(answer, MEDIUM_DRAFTS_PER_PRESS, find.text)
      if (!split.length) throw new Error(`${picked.provider} answered, but nothing in the answer looked like a response.`)
      return split
    }
  )
  const now = new Date()
  const rows = drafts.map((draft) => ({
    id: uuid(),
    userId,
    findId: find.id,
    text: draft.text,
    line: draft.line,
    helpOnly: input.helpOnly,
    provider: picked.provider,
    model: picked.model,
    createdAt: now,
  }))
  await db.insert(promoMediumDrafts).values(rows)
  return rows.map((row) => ({ id: row.id, text: row.text, line: row.line, helpOnly: row.helpOnly, rewrite: "", createdAt: row.createdAt }))
}

/** A draft answer to somebody who responded under one of ours or under one of our articles. Not stored: it goes in the box. */
export async function writeMediumAnswer(
  userId: string,
  input: { projectId: string; accountId: string; title: string; mine: string; theirs: string; writer: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const { words, examples } = await accountWords(userId, input.accountId, input.projectId, db)
  const product = await projectDescription(userId, input.projectId, db)
  const picked = await pickProvider()
  const prompt = buildMediumResponsePrompt({
    title: input.title,
    writer: "",
    publication: "",
    text: "",
    membersOnly: false,
    responses: [],
    ...words,
    product,
    examples,
    helpOnly: false,
    answering: { mine: input.mine, theirs: input.theirs, writer: input.writer },
    count: 1,
  })
  return askModel(
    { userId, ...picked, feature: "medium-answer", metadata: { projectId: input.projectId }, prompt },
    (answer) => {
      const [first] = splitMediumDrafts(answer, 1)
      if (!first) throw new Error(`${picked.provider} answered, but nothing in the answer looked like an answer.`)
      return first.text
    }
  )
}

const REWRITE_ASK: Record<ResponseRewrite, string> = {
  shorter: "Make it about half as long. Keep its one most useful point.",
  warmer: "Make it warmer and more personal, as a reader who liked the story, without flattering it.",
  less_salesy: "Make it less salesy: help first, and take out anything that reads like an advert. If it names a product, name it at most once, plainly, or not at all.",
}

/** The words handed to the model to rewrite a response. Exported for the test. */
export function buildMediumRewritePrompt(text: string, how: ResponseRewrite): string {
  return [
    "Rewrite this Medium response.",
    REWRITE_ASK[how],
    `Keep it under ${MAX_RESPONSE_CHARS} characters, plain text. Answer with the new response and nothing else.`,
    `The response:\n"""${text}"""`,
  ].join("\n\n")
}

/** A rewrite of the words in the box (part 24), stored as a draft so the record of what the AI wrote stays honest. */
export async function rewriteMediumResponse(
  userId: string,
  input: { findId: string; text: string; how: ResponseRewrite },
  db: CustomShellDb = defaultDb
): Promise<MediumDraftView> {
  if (!RESPONSE_REWRITE_WORDS[input.how]) throw new Error("That rewrite is not one Promo knows.")
  const text = input.text.trim()
  if (!text) throw new Refusal("Write the response first, then rewrite it.")
  const find = await ownedMediumFind(userId, input.findId, db)
  if (!find) throw new Error("That Medium story is no longer saved.")
  const picked = await pickProvider()
  const rewritten = await askModel(
    {
      userId,
      ...picked,
      feature: "medium-rewrite",
      metadata: { projectId: find.projectId, findId: find.id, how: input.how },
      prompt: buildMediumRewritePrompt(text, input.how),
    },
    (answer) => {
      const clean = answer.trim().replace(/^["“]|["”]$/g, "").slice(0, MAX_RESPONSE_CHARS)
      if (!clean) throw new Error(`${picked.provider} answered with nothing.`)
      return clean
    }
  )
  const row = {
    id: uuid(),
    userId,
    findId: find.id,
    text: rewritten,
    rewrite: input.how,
    provider: picked.provider,
    model: picked.model,
    createdAt: new Date(),
  }
  await db.insert(promoMediumDrafts).values(row)
  return { id: row.id, text: row.text, line: "", helpOnly: false, rewrite: input.how, createdAt: row.createdAt }
}

export type RulesVerdict = { ok: boolean; problems: string[] }

/** The words handed to the model for the rules check. Exported for the test. */
export function buildMediumRulesPrompt(text: string, publicationRules: string): string {
  return [
    "Check this piece of writing for Medium against the rules below. Only flag a rule it really breaks.",
    "Medium's rules:",
    MEDIUM_RULES.map((rule) => `- ${rule}`).join("\n"),
    publicationRules.trim() ? `The publication's own submission rules:\n${publicationRules.trim().slice(0, 4_000)}` : "",
    `The writing:\n"""${text.slice(0, 12_000)}"""`,
    "Answer OK on its own line when it breaks none. Otherwise write one line per rule it breaks, each starting with - and saying which rule and what in the writing breaks it.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function readMediumRulesAnswer(answer: string): RulesVerdict {
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

/** Checks a response or an article against Medium's rules, and a publication's when one is named (parts 18 and 33). */
export async function checkMediumRules(
  userId: string,
  input: { projectId: string; text: string; publicationRules?: string }
): Promise<RulesVerdict> {
  const text = input.text.trim()
  if (!text) throw new Refusal("Write something first, then check it.")
  const picked = await pickProvider()
  return askModel(
    {
      userId,
      ...picked,
      feature: "medium-rules-check",
      metadata: { projectId: input.projectId },
      prompt: buildMediumRulesPrompt(text, input.publicationRules ?? ""),
    },
    readMediumRulesAnswer
  )
}

export type KeywordIdea = { kind: MediumKeywordKind; value: string }

/** The words handed to the model for keyword ideas. Exported for the test. */
export function buildMediumKeywordIdeasPrompt(product: string, existing: string[]): string {
  return [
    "Suggest where on Medium the people who would want this product read and write.",
    `What it is:\n${product.trim()}`,
    existing.length ? `Already used, do not repeat: ${existing.join(", ")}` : "",
    "Answer with up to 6 lines starting TAG: (a Medium tag, a few words), up to 4 lines starting SEARCH: (words a reader would search for), and up to 4 lines starting PUBLICATION: (the name of a real Medium publication on the topic, as it is in its address, for example better-programming). Nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function readMediumKeywordIdeas(answer: string): KeywordIdea[] {
  const out: KeywordIdea[] = []
  for (const line of answer.split("\n")) {
    const found = line.trim().match(/^(TAG|SEARCH|PUBLICATION):\s*(.+)$/i)
    if (!found) continue
    const kind = found[1].toLowerCase() === "tag" ? "tag" : found[1].toLowerCase() === "search" ? "search" : "publication"
    const raw = found[2].trim().replace(/^["“#]|["”]$/g, "")
    const value = kind === "tag" ? mediumTagSlug(raw) : kind === "publication" ? raw.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") : raw
    if (value && !out.some((idea) => idea.kind === kind && idea.value === value)) out.push({ kind, value })
  }
  return out
}

/** Tags, search words and publications worth trying, from the project's description (part 8). */
export async function mediumKeywordIdeas(
  userId: string,
  input: { projectId: string; existing: string[] },
  db: CustomShellDb = defaultDb
): Promise<KeywordIdea[]> {
  const product = await projectDescription(userId, input.projectId, db)
  if (!product.trim()) throw new Refusal("Describe the project first, in its left column, so the AI knows what to look for.")
  const picked = await pickProvider()
  return askModel(
    {
      userId,
      ...picked,
      feature: "medium-keyword-ideas",
      metadata: { projectId: input.projectId },
      prompt: buildMediumKeywordIdeasPrompt(product, input.existing),
    },
    (answer) => {
      const ideas = readMediumKeywordIdeas(answer)
      if (!ideas.length) throw new Error(`${picked.provider} answered, but with no tags, search words or publications.`)
      return ideas
    }
  )
}

export type OutlinePromptInput = {
  about: string
  product: string
  voice: string
  /** A piece to start from, such as a Reddit comment that did well (part 30). */
  source: string
  publicationRules: string
}

/** The words handed to the model for an article's outline (part 27). Exported for the test. */
export function buildOutlinePrompt(input: OutlinePromptInput): string {
  return [
    `Plan a Medium article of ${ARTICLE_WORDS.min} to ${ARTICLE_WORDS.max} words.`,
    `What it is about:\n${input.about.trim()}`,
    input.source.trim() ? `Start from this piece, which readers liked, and grow it into the article:\n"""${input.source.trim()}"""` : "",
    input.product.trim() ? `What the writer makes, which the article may mention once where it really helps:\n${input.product.trim()}` : "",
    input.voice.trim() ? `How the writer writes:\n${input.voice.trim()}` : "",
    input.publicationRules.trim() ? `The publication's submission rules:\n${input.publicationRules.trim().slice(0, 3_000)}` : "",
    "Answer in exactly this shape and nothing else:\nTITLES:\n- three different titles, one per line\nHEADINGS:\n- four to seven section headings, in order, one per line",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function readOutline(answer: string): MediumOutline {
  const titles: string[] = []
  const headings: string[] = []
  let into: string[] | null = null
  for (const raw of answer.split("\n")) {
    const line = raw.trim()
    if (/^TITLES:?$/i.test(line)) into = titles
    else if (/^HEADINGS:?$/i.test(line)) into = headings
    else if (into && /^[-*\d.]+\s*/.test(line)) {
      const text = line.replace(/^[-*\d.)]+\s*/, "").replace(/^["“]|["”]$/g, "").trim()
      if (text) into.push(text)
    }
  }
  return { titles: titles.slice(0, 3), headings: headings.slice(0, 8) }
}

export type ArticlePromptInput = OutlinePromptInput & {
  title: string
  headings: string[]
  /** The account's earlier articles on the topic, to link to (part 29). */
  earlier: Array<{ title: string; url: string }>
}

/** The words handed to the model for the article itself. Exported for the test. */
export function buildArticlePrompt(input: ArticlePromptInput): string {
  return [
    `Write a Medium article of ${ARTICLE_WORDS.min} to ${ARTICLE_WORDS.max} words.`,
    `Title: ${input.title}`,
    input.headings.length ? `Sections, in this order:\n${input.headings.map((heading) => `- ${heading}`).join("\n")}` : "",
    `What it is about:\n${input.about.trim()}`,
    input.source.trim() ? `Grow it from this piece, which readers liked:\n"""${input.source.trim()}"""` : "",
    input.product.trim()
      ? `What the writer makes:\n${input.product.trim()}\nMention it at most once, plainly, where it really helps the reader. The article is useful without it.`
      : "Do not mention any product.",
    input.voice.trim() ? `How the writer writes:\n${input.voice.trim()}` : "",
    input.earlier.length
      ? `The writer's earlier articles on this. Link to the ones that fit, as plain addresses inside a sentence:\n${input.earlier.map((item) => `- ${item.title}: ${item.url}`).join("\n")}`
      : "",
    input.publicationRules.trim() ? `The publication's submission rules:\n${input.publicationRules.trim().slice(0, 3_000)}` : "",
    "Medium's own rules you must keep:",
    MEDIUM_RULES.map((rule) => `- ${rule}`).join("\n"),
    `Answer in exactly this shape and nothing else:\nSUBTITLE: one sentence\nTAGS: up to ${MAX_ARTICLE_TAGS} Medium tags, separated by commas\nBODY:\nthe article as plain text, a blank line between paragraphs, each section heading on its own line starting with ## `,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export type WrittenArticle = { subtitle: string; tags: string[]; body: string }

export function readArticle(answer: string): WrittenArticle {
  const subtitle = answer.match(/^\s*SUBTITLE:\s*(.+)$/im)?.[1]?.trim() ?? ""
  const tags = (answer.match(/^\s*TAGS:\s*(.+)$/im)?.[1] ?? "")
    .split(",")
    .map((tag) => mediumTagSlug(tag))
    .filter(Boolean)
    .slice(0, MAX_ARTICLE_TAGS)
  const at = answer.search(/^\s*BODY:\s*$/im)
  const body = at >= 0 ? answer.slice(at).replace(/^\s*BODY:\s*\n/i, "").trim() : ""
  return { subtitle: subtitle.replace(/^["“]|["”]$/g, ""), tags, body }
}

/** The words handed to the model for article ideas (part 31). Exported for the test. */
export function buildArticleIdeasPrompt(product: string, questions: string[]): string {
  return [
    "These are titles of posts and stories people wrote about the topic, many of them questions. Suggest Medium articles that would answer what they keep asking.",
    product.trim() ? `What the writer makes, for context:\n${product.trim()}` : "",
    `The titles:\n${questions.map((title) => `- ${title}`).join("\n")}`,
    "Answer with up to 6 lines, each IDEA: a title | the question from the list it answers. Nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export type ArticleIdea = { title: string; answers: string }

export function readArticleIdeas(answer: string): ArticleIdea[] {
  return answer
    .split("\n")
    .map((line) => line.trim().match(/^IDEA:\s*(.+?)\s*\|\s*(.+)$/i))
    .flatMap((found) => (found ? [{ title: found[1].replace(/^["“]|["”]$/g, ""), answers: found[2] }] : []))
    .slice(0, 6)
}
