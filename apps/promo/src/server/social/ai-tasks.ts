import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  DRAFTS_PER_PRESS,
  MAX_COMMENT_CHARS,
  MAX_POST_BODY_CHARS,
  MAX_POST_TITLE_CHARS,
  type DraftRewrite,
  type SubredditRule,
} from "@/lib/social/options"

import { askModel, buildDraftPrompt, pickProvider, splitDrafts } from "./drafts"
import { cleanSubreddit } from "./keywords"
import { projectDescription, projectOfFind } from "./projects"
import { blockedNames } from "./reddit/blocked"
import { promptRules } from "./reddit/rules"
import { promoAccounts, promoDrafts, promoFinds, promoKeywords, promoVoices } from "./schema"
import { NO_WORDS, wordsForAccount, type VoiceWords } from "./voices"

/**
 * The smaller things Promo asks the AI, each picked by Tyler on 12 Oct 2026:
 * checking a comment against the rules before Post, rewriting the words in the
 * box, ideas for keywords, a post of your own, and trying a voice.
 *
 * Every one goes through `askModel`, so it counts against the month's AI
 * allowance and shows on the AI usage screen under its own name. None of them
 * posts anything: each hands words back, and a person decides.
 */

type FindRow = typeof promoFinds.$inferSelect

async function ownFind(userId: string, findId: string, db: CustomShellDb): Promise<FindRow> {
  const [find] = await db
    .select()
    .from(promoFinds)
    .where(and(eq(promoFinds.id, findId), eq(promoFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That post is no longer saved.")
  return find
}

/** The clicked account's voice and its project's description, or the post's own project's with none clicked. */
async function voiceAndProduct(
  userId: string,
  find: FindRow,
  accountId: string | null,
  db: CustomShellDb
): Promise<{ words: VoiceWords; product: string }> {
  const account = accountId
    ? (
        await db
          .select()
          .from(promoAccounts)
          .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
          .limit(1)
      )[0]
    : null
  if (accountId && !account) throw new Error("That account is not there any more.")
  const words = account ? await wordsForAccount(userId, account.id, db) : NO_WORDS
  // A post found for an account's everyday subreddits is answered with help
  // alone, so it is never told what you make.
  if (find.helpAccountId) return { words, product: "" }
  const product = await projectDescription(
    userId,
    account ? account.projectId : await projectOfFind(userId, find.id, db),
    db
  )
  return { words, product }
}

function rulesList(rules: SubredditRule[]): string {
  return rules
    .map((rule, index) => {
      const description = rule.description.replace(/\s+/g, " ").trim().slice(0, 400)
      return `${index + 1}. ${rule.title || "(no title)"}${description ? `: ${description}` : ""}`
    })
    .join("\n")
}

// Part 5. Checking the words in the box against the rules.

export type RulesCheck = {
  /** Each rule the comment breaks, with one short reason. Empty when it breaks none. */
  broken: Array<{ rule: string; why: string }>
  /** False when the subreddit's own rules have not been read, so only the voice's were checked. */
  subredditRulesRead: boolean
}

/** The model's answer, one broken rule a line as "RULE | WHY", or NONE. */
export function readRulesAnswer(answer: string): RulesCheck["broken"] {
  const lines = answer
    .split("\n")
    .map((line) => line.trim().replace(/^[-*\d.\s]+/, ""))
    .filter(Boolean)
  if (!lines.length || /^none\b/i.test(lines[0])) return []
  return lines
    .filter((line) => line.includes("|"))
    .slice(0, 5)
    .map((line) => {
      const [rule, ...why] = line.split("|")
      return { rule: rule.trim().slice(0, 200), why: why.join("|").trim().slice(0, 300) }
    })
    .filter((item) => item.rule && item.why)
}

/**
 * Reads the comment in the box against the subreddit's posted rules and the
 * voice's own rules. Only when a person presses Check: Tyler, 12 Oct 2026,
 * "let me click the check button". It warns and never turns Post off.
 */
export async function checkCommentRules(
  userId: string,
  input: { findId: string; accountId: string | null; text: string },
  db: CustomShellDb = defaultDb
): Promise<RulesCheck> {
  const text = input.text.trim()
  if (!text) throw new Error("Write the comment first, then check it.")
  const find = await ownFind(userId, input.findId, db)
  const { words, product } = await voiceAndProduct(userId, find, input.accountId, db)
  const subredditRules = await promptRules(userId, find.subreddit, db)
  const { provider, model, key } = await pickProvider()

  const prompt = [
    `Here is a comment I am about to post on Reddit, in r/${find.subreddit}, under a post titled "${find.title}".`,
    "",
    "MY COMMENT:",
    text.slice(0, MAX_COMMENT_CHARS * 2),
    "",
    subredditRules.length
      ? `THE RULES OF r/${find.subreddit}, posted by its moderators:\n${rulesList(subredditRules)}`
      : `r/${find.subreddit}'s own rules have not been read, so there are none to check against.`,
    words.commentRules ? `MY OWN RULES:\n${words.commentRules}` : "",
    product ? `WHAT I MAKE, so you can tell when the comment promotes it:\n${product}` : "",
    "",
    "Which of these rules does my comment break? Only rules it clearly breaks, not ones it merely could.",
    "Answer one broken rule a line, as: the rule in a few words | why my comment breaks it, in one short sentence.",
    "If it breaks none, answer only: NONE",
  ]
    .filter((line) => line !== "")
    .join("\n")

  const broken = await askModel(
    {
      userId,
      provider,
      model,
      feature: "reddit-rules-check",
      metadata: { findId: find.id, subreddit: find.subreddit },
      prompt,
      key,
    },
    readRulesAnswer
  )
  return { broken, subredditRulesRead: subredditRules.length > 0 }
}

// Part 6. Rewriting the words in the box.

const REWRITE_ASKS: Record<DraftRewrite, string> = {
  shorter: "Make it shorter: keep what matters and cut the rest, to about half the length or less.",
  plainer: "Make it plainer: shorter sentences, everyday words, nothing that sounds like marketing.",
  no_product:
    "Take out every mention of what I make, any product, tool or service of mine, and any link. Keep the help.",
}

/**
 * Rewrites the words in the comment box one of three ways and stores the
 * result as a draft, so the record of what the AI wrote stays honest: a
 * rewrite that goes out unchanged counts as the AI's, the same as a picked
 * draft. A rewrite is never offered as a draft tile.
 */
export async function rewriteComment(
  userId: string,
  input: { findId: string; accountId: string | null; text: string; how: DraftRewrite },
  db: CustomShellDb = defaultDb
): Promise<{ id: string; text: string }> {
  const text = input.text.trim()
  if (!text) throw new Error("Write the comment first, then rewrite it.")
  const find = await ownFind(userId, input.findId, db)
  const { words } = await voiceAndProduct(userId, find, input.accountId, db)
  const { provider, model, key } = await pickProvider()

  const prompt = [
    `Rewrite this Reddit comment for r/${find.subreddit}, under a post titled "${find.title}".`,
    "",
    "THE COMMENT:",
    text.slice(0, MAX_COMMENT_CHARS * 2),
    "",
    words.voice ? `HOW I SOUND:\n${words.voice}` : "",
    words.commentRules ? `MY RULES:\n${words.commentRules}` : "",
    "",
    REWRITE_ASKS[input.how],
    `- Under ${MAX_COMMENT_CHARS} characters.`,
    "- No em dashes. No bullet lists. No sign-off. Write the way a person types into a reply box.",
    "- Answer with the rewritten comment only, nothing before or after it.",
  ]
    .filter((line) => line !== "")
    .join("\n")

  const rewritten = await askModel(
    {
      userId,
      provider,
      model,
      feature: "reddit-rewrite",
      metadata: { findId: find.id, subreddit: find.subreddit, how: input.how },
      prompt,
      key,
    },
    (answer) => {
      const cleaned = answer.trim().replace(/^["']|["']$/g, "").trim().slice(0, MAX_COMMENT_CHARS)
      if (cleaned.length < 2) throw new Error(`${provider} answered, but with no comment in it.`)
      return cleaned
    }
  )

  const id = uuid()
  await db.insert(promoDrafts).values({
    id,
    userId,
    findId: find.id,
    text: rewritten,
    provider,
    model,
    rewrite: input.how,
  })
  return { id, text: rewritten }
}

// Part 2. Keyword and subreddit ideas from the project's description.

export type KeywordIdeas = { keywords: string[]; subreddits: string[] }

/** The model's answer: lines starting "KEYWORD:" and "SUBREDDIT:". */
export function readIdeasAnswer(answer: string): KeywordIdeas {
  const keywords: string[] = []
  const subreddits: string[] = []
  for (const raw of answer.split("\n")) {
    const line = raw.trim().replace(/^[-*\d.\s]+/, "")
    const keyword = /^keyword:\s*(.+)$/i.exec(line)
    const subreddit = /^subreddit:\s*(.+)$/i.exec(line)
    if (keyword) keywords.push(keyword[1].replace(/^["']|["']$/g, "").trim().slice(0, 200))
    if (subreddit) {
      const name = cleanSubreddit(subreddit[1])
      if (name) subreddits.push(name)
    }
  }
  return { keywords: [...new Set(keywords.filter(Boolean))], subreddits: [...new Set(subreddits)] }
}

/**
 * Up to ten keywords to save and five subreddits to watch, from the project's
 * description and the subreddits its posts already came from. Nothing is
 * saved: each idea has its own Add. Ideas already saved in the project, and
 * blocked subreddits, are left out.
 */
export async function keywordIdeas(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<KeywordIdeas> {
  const description = await projectDescription(userId, projectId, db)
  if (!description) {
    throw new Error("Write what the project makes in its description first. The ideas come from it.")
  }
  const saved = await db
    .select({ term: promoKeywords.term, subreddits: promoKeywords.subreddits })
    .from(promoKeywords)
    .where(and(eq(promoKeywords.userId, userId), eq(promoKeywords.projectId, projectId)))
  const savedTerms = new Set(saved.filter((row) => row.term).map((row) => row.term.toLowerCase()))
  const watched = new Set(saved.filter((row) => !row.term).map((row) => (row.subreddits[0] ?? "").toLowerCase()))
  const found = await db
    .selectDistinct({ subreddit: promoFinds.subreddit })
    .from(promoFinds)
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(and(eq(promoFinds.userId, userId), eq(promoKeywords.projectId, projectId)))
    .limit(40)
  const blocked = await blockedNames(userId, db)
  const { provider, model, key } = await pickProvider()

  const prompt = [
    "I promote this on Reddit by answering people who ask about the problem it solves.",
    "",
    `WHAT I MAKE:\n${description}`,
    "",
    saved.length
      ? `KEYWORDS I ALREADY SEARCH FOR:\n${saved.map((row) => row.term || `r/${row.subreddits[0]}`).join("\n")}`
      : "",
    found.length ? `SUBREDDITS MY SEARCHES HAVE FOUND POSTS IN:\n${found.map((row) => `r/${row.subreddit}`).join(", ")}` : "",
    "",
    "Suggest up to 10 new search phrases that people with this problem would type into a Reddit post, in their words rather than mine, two to five words each.",
    "Suggest up to 5 subreddits where people ask about this problem, real ones you are sure exist.",
    "Answer one a line, as KEYWORD: the phrase, or SUBREDDIT: the name without r/. Nothing else.",
  ]
    .filter((line) => line !== "")
    .join("\n")

  const ideas = await askModel(
    {
      userId,
      provider,
      model,
      feature: "reddit-keyword-ideas",
      metadata: { projectId },
      prompt,
      key,
    },
    readIdeasAnswer
  )
  return {
    keywords: ideas.keywords.filter((term) => !savedTerms.has(term.toLowerCase())).slice(0, 10),
    subreddits: ideas.subreddits
      .filter((name) => !blocked.has(name.toLowerCase()) && !watched.has(name.toLowerCase()))
      .slice(0, 5),
  }
}

// Part 10. A post of your own.

/** The model's answer: a TITLE: line, then the post's words after BODY:. */
export function readPostAnswer(answer: string): { title: string; body: string } {
  const title = /^\s*title:\s*(.+)$/im.exec(answer)?.[1]?.trim() ?? ""
  const bodyAt = answer.search(/^\s*body:\s*/im)
  const body = bodyAt === -1 ? "" : answer.slice(bodyAt).replace(/^\s*body:\s*/i, "").trim()
  if (!title) throw new Error("The AI answered, but there was no title in it.")
  return {
    title: title.replace(/^["']|["']$/g, "").slice(0, MAX_POST_TITLE_CHARS),
    body: body.slice(0, MAX_POST_BODY_CHARS),
  }
}

/**
 * A title and words for a post of your own in one subreddit, in the account's
 * voice, told what you make and the subreddit's own rules. Only words: the
 * person reads them, changes them, and presses Post.
 */
export async function draftOwnPost(
  userId: string,
  input: { projectId: string; accountId: string | null; subreddit: string; idea: string },
  db: CustomShellDb = defaultDb
): Promise<{ title: string; body: string }> {
  const subreddit = cleanSubreddit(input.subreddit)
  if (!subreddit) throw new Error("Name the subreddit it goes to first.")
  const product = await projectDescription(userId, input.projectId, db)
  const words = input.accountId ? await wordsForAccount(userId, input.accountId, db) : NO_WORDS
  const subredditRules = await promptRules(userId, subreddit, db)
  const { provider, model, key } = await pickProvider()

  const prompt = [
    `Write a Reddit post for r/${subreddit}.`,
    "",
    product ? `WHAT I MAKE:\n${product}` : "",
    input.idea.trim() ? `WHAT THE POST IS ABOUT:\n${input.idea.trim().slice(0, 2_000)}` : "",
    words.voice ? `HOW I SOUND:\n${words.voice}` : "",
    words.commentRules ? `MY RULES:\n${words.commentRules}` : "",
    subredditRules.length
      ? `THE RULES OF r/${subreddit}, posted by its moderators. Break none of them:\n${rulesList(subredditRules)}`
      : "",
    "",
    "Hard rules:",
    "- Lead with something useful to the people who read this subreddit: a lesson, a question, or what I learned. Not an advert.",
    "- Mention what I make once at most, plainly, and only if the subreddit's rules allow it.",
    `- The title is under ${Math.min(MAX_POST_TITLE_CHARS, 120)} characters. The post is under 2000.`,
    "- No em dashes. No sign-off. No hashtags. Write the way a person types a post.",
    "",
    "Answer as two parts: a line starting TITLE: with the title, then a line starting BODY: followed by the post.",
  ]
    .filter((line) => line !== "")
    .join("\n")

  return askModel(
    {
      userId,
      provider,
      model,
      feature: "reddit-post",
      metadata: { projectId: input.projectId, subreddit },
      prompt,
      key,
    },
    readPostAnswer
  )
}

// Part 18. Trying a voice.

/**
 * Two drafts in one voice for a post already found, so a voice can be tuned
 * from its window. Told the post's own project's description, as Write with
 * AI is before an account is clicked. Not stored: these are a look at how the
 * voice sounds, and never show on the post's own draft tiles.
 */
export async function tryVoice(
  userId: string,
  input: { voiceId: string; findId: string; voice?: string; commentRules?: string },
  db: CustomShellDb = defaultDb
): Promise<string[]> {
  const [voice] = await db
    .select()
    .from(promoVoices)
    .where(and(eq(promoVoices.id, input.voiceId), eq(promoVoices.userId, userId)))
    .limit(1)
  if (!voice) throw new Error("That voice does not exist.")
  const find = await ownFind(userId, input.findId, db)
  const product = find.helpAccountId ? "" : await projectDescription(userId, await projectOfFind(userId, find.id, db), db)
  const subredditRules = await promptRules(userId, find.subreddit, db)
  const { provider, model, key } = await pickProvider()

  // The words in the window, even before they are saved, so a change can be
  // tried before it is kept.
  const prompt = buildDraftPrompt({
    subreddit: find.subreddit,
    title: find.title,
    body: find.thread?.body || find.body,
    linkPage: find.linkPage,
    replies: find.thread?.replies ?? [],
    voice: input.voice ?? voice.voice,
    commentRules: input.commentRules ?? voice.commentRules,
    product,
    subredditRules,
    helpOnly: Boolean(find.helpAccountId),
    count: DRAFTS_PER_PRESS,
  })
  return askModel(
    {
      userId,
      provider,
      model,
      feature: "reddit-comment",
      metadata: { findId: find.id, subreddit: find.subreddit, voiceId: voice.id, tryingVoice: true },
      prompt,
      key,
    },
    (answer) => {
      const drafts = splitDrafts(answer, DRAFTS_PER_PRESS)
      if (!drafts.length) throw new Error(`${provider} answered, but nothing in the answer looked like a comment.`)
      return drafts
    }
  )
}
