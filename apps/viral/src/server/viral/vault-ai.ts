import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { formatCount } from "@/lib/viral/creators"
import { isTextSocial, SOCIAL_NAMES } from "@/lib/viral/socials"
import { figureName, postAuthor, postHeadline } from "@/lib/viral/text-posts"
import { VAULT_TITLE_MAX, vaultNotesText, type VaultItem, type VaultSourcePost, type VaultStats } from "@/lib/viral/vault"
import { viralSays } from "@/lib/viral/viral"
import { SEGMENT_ROLES, type SegmentRole } from "@/lib/viral/viral-breakdown"
import { roundedCents, writerDollars, type Writer, type WriterPrice } from "@/lib/viral/writers"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  ANSWER_ONLY,
  cleanTopic,
  ideasPrompt,
  ideasSchema,
  scriptSchema,
  titlePrompt,
  titleSchema,
  toPieces,
  whySchema,
} from "@/server/viral/ai-analysis"
import { requireViralProjectBudget, viralProjectSpendMetadata } from "@/server/viral/project-spend"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { viralSocialPosts, viralVaultItems, type ViralProjectRow, type ViralSocialPostRow } from "@/server/viral/schema"
import { requireOwnedItem, serializeVaultRow } from "@/server/viral/vault"
import { askWriter } from "@/server/viral/writer"
import { writerForPrices } from "@/server/viral/writer-choice"

/**
 * The AI writing for vault ideas that have no video (`workspace/docs/vault.md`,
 * more-features task parts 2 and 3).
 *
 * **A saved post** (Tyler, 6 Nov 2026: "All four pieces"). Save to vault on an
 * X, Reddit or LinkedIn post writes why it works, a video script, more ideas
 * and a title with hashtags, from the post's own words for the project's
 * topic. A post has no breakdown, so the AI picks the script's parts from
 * Viral's list (`SEGMENT_ROLES`), and the hook is required. All four calls go
 * on the meter as `viral_post_analysis`, so a post's cost reads apart from a
 * video's.
 *
 * **Your own idea** ("Script on a button"). Write a script writes one script
 * for the project's topic from the idea's title and notes, on the meter as
 * `viral_own_idea_script`.
 *
 * Both carry the project's id, so the project's spend limit counts them, and
 * both refuse a sample and a project with no topic before the AI is asked.
 */

export const POST_ANALYSIS_FEATURE = "viral_post_analysis"
export const OWN_IDEA_SCRIPT_FEATURE = "viral_own_idea_script"

/** A post's four calls each read about 1,500 tokens (the post and the question) and write about 800, at the writer's price. */
export function postAnalysisPrice(writer: Writer): WriterPrice {
  return { cents: roundedCents(4 * writerDollars(writer, 1_500, 800)), writer: writer.label }
}

/** Write a script is one call: about 1,000 tokens in and 600 out. */
export function ownIdeaScriptPrice(writer: Writer): WriterPrice {
  return { cents: roundedCents(writerDollars(writer, 1_000, 600)), writer: writer.label }
}

const NO_TOPIC = "Give the project a topic first, in its ⋮ under Your topic, so the script is written for it."

/** The parts a script with no original to copy may use, and the rule that it opens on the hook. */
function partsRule() {
  return `Pick the parts the video needs, in order, each role one of: ${SEGMENT_ROLES.join(", ")}. The first part must be the hook. Keep the whole video under 60 seconds.`
}

/** A script with no hook is refused, so every script the AI writes for an idea opens on one. */
function requireHook(script: { role: SegmentRole }[], again: string) {
  if (!script.some((part) => part.role === "hook")) {
    throw viralSays(`The script came back without a hook, and every script needs one. ${again}`)
  }
}

// ----------------------------------------------------------------- Posts --

/** The post as the prompts describe it: where, who, its words and its numbers in the network's own words. */
function describePost(post: ViralSocialPostRow): string {
  const network = isTextSocial(post.network) ? post.network : "x"
  const figures = (["views", "likes", "replies", "reposts"] as const).flatMap((figure) => {
    const name = figureName(network, figure)
    const count = post[figure]
    return name && count !== null ? [`${formatCount(count)} ${name.toLowerCase()}`] : []
  })
  const where = post.community ? `${SOCIAL_NAMES[network]}, in r/${post.community}` : SOCIAL_NAMES[network]
  return `Posted on ${where} by ${postAuthor({ ...post, network })}${post.authorFollowers !== null ? `, who has ${formatCount(post.authorFollowers)} followers` : ""}.
${post.title ? `Its title: ${post.title.slice(0, 300)}\n` : ""}Its words: """${post.text.slice(0, 6_000) || "(only a picture or video)"}"""
Its numbers: ${figures.join(", ") || "(hidden)"}`
}

function whyPostPrompt(original: string) {
  return `A social post went viral. Explain to a creator, in plain words, why it works.

${original}

${ANSWER_ONLY}
{ "hook": "what the opening line does to stop the scroll", "parts": [{ "role": "hook", "summary": "what this part does" }], "whySpread": "what made people read it and share it" }
List the post's parts in its own order, each role one of: ${SEGMENT_ROLES.join(", ")}.`
}

function postScriptPrompt(original: string, topic: string) {
  return `Turn this viral social post into a script for a short video on somebody else's subject, keeping what made the post work.

The post:
${original}

The new subject, in their words: """${topic}"""

${ANSWER_ONLY}
{ "script": [{ "role": "hook", "seconds": 3, "words": "what is said and shown" }] }
${partsRule()}`
}

/** Only an http or https link is kept, because the idea draws it as a link. */
function safeLink(value: string): string {
  return /^https?:\/\//i.test(value.trim()) ? value.trim().slice(0, 600) : ""
}

/**
 * Save to vault on an X, Reddit or LinkedIn post. The AI writes the four
 * pieces first, so a failed call keeps nothing. Saving the same post to the
 * same project again writes the pieces again and updates that idea, keeping
 * its status, notes and tags.
 */
export async function savePostToVault(ownerId: string, postRowId: string): Promise<VaultItem> {
  const [post] = await db
    .select()
    .from(viralSocialPosts)
    .where(and(eq(viralSocialPosts.id, postRowId), eq(viralSocialPosts.ownerId, ownerId)))
    .limit(1)
  if (!post) throw viralSays("That post is gone.")
  const project = await requireOwnedViralProject(ownerId, post.projectId)
  // Every sample is refused before the AI is asked (`ai-analysis.ts`).
  if (project.isSample || post.postId.startsWith("sample-")) {
    throw viralSays("A sample's posts are made up, so they can't be kept. Make your own project to try it.")
  }
  // The idea's Open and Copy link use the post's address, so only a web address is kept, checked before any AI spend.
  const sourceUrl = safeLink(post.url)
  if (!sourceUrl) throw viralSays("This post has no web address Viral can keep, so it can't be saved.")
  const topic = cleanTopic(project.topic)
  if (!topic) throw viralSays(NO_TOPIC)
  await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, postAnalysisPrice(await writerForPrices()).cents)

  const original = describePost(post)
  const metadata = { socialPostId: post.id, network: post.network, ...viralProjectSpendMetadata(project.id) }
  const ask = <T>(prompt: string, schema: z.ZodType<T>, label: string) =>
    askWriter({ userId: ownerId, feature: POST_ANALYSIS_FEATURE, metadata, prompt, schema, label })
  const [why, script, ideas, title] = await Promise.all([
    ask(whyPostPrompt(original), whySchema, "Why it works"),
    ask(postScriptPrompt(original, topic), scriptSchema, "The script"),
    ask(ideasPrompt(original, topic, "post"), ideasSchema, "More ideas"),
    ask(titlePrompt(original, topic, "post"), titleSchema, "The title"),
  ])
  requireHook(script.script, "Press Save to vault again.")
  const pieces = toPieces({ why, script, ideas, title })

  const words: VaultSourcePost = {
    title: post.title,
    text: post.text,
    link: safeLink(post.link),
    community: post.community,
    authorHandle: post.authorHandle,
    authorName: post.authorName,
  }
  const stats: VaultStats = {
    views: post.views,
    likes: post.likes,
    comments: post.replies,
    subscribers: post.authorFollowers,
    durationSeconds: null,
    postedAt: post.postedAt?.toISOString() ?? null,
    score: null,
    outlier: null,
    reposts: post.reposts,
  }
  const values = {
    kind: "post" as const,
    sourceUrl,
    title: postHeadline(post).replace(/\s+/g, " ").trim().slice(0, VAULT_TITLE_MAX),
    channelName: postAuthor(post),
    stats,
    analysisTopic: topic,
    analysis: pieces,
    post: words,
  }
  const at = now()
  const [row] = await db
    .insert(viralVaultItems)
    .values({ id: uuid(), ownerId, projectId: project.id, platform: post.network, platformVideoId: post.postId, ...values, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: [viralVaultItems.projectId, viralVaultItems.platform, viralVaultItems.platformVideoId],
      // The script is written again, so an edit of the old one has nothing to sit on.
      set: { ...values, editedScript: null, updatedAt: at },
    })
    .returning()
  return serializeVaultRow(row)
}

// -------------------------------------------------------------- Own ideas --

function ownScriptPrompt(idea: { title: string; notes: string }, topic: string) {
  return `Write a script for a short video on somebody's subject, from an idea they wrote down.

Their subject, in their words: """${topic}"""
Their idea: """${idea.title}"""
Their notes: """${idea.notes.slice(0, 4_000) || "(none)"}"""

${ANSWER_ONLY}
{ "script": [{ "role": "hook", "seconds": 3, "words": "what is said and shown" }] }
${partsRule()}`
}

async function ownIdeaProject(ownerId: string, item: { projectId: string }): Promise<ViralProjectRow> {
  const project = await requireOwnedViralProject(ownerId, item.projectId)
  if (project.isSample) throw viralSays("This is a sample project, so nothing is written for it. Pick one of your own projects.")
  return project
}

/**
 * Write a script on your own idea. One script for the project's topic, every
 * part labelled, kept as the idea's analysis with the other three pieces
 * left empty. Pressing it again writes a new one and drops any edit of the
 * old.
 */
export async function writeOwnIdeaScript(ownerId: string, itemId: string): Promise<VaultItem> {
  const item = await requireOwnedItem(ownerId, itemId)
  if (item.kind !== "own") throw viralSays("Write a script is for ideas you typed yourself. A saved video or post has its script already.")
  const project = await ownIdeaProject(ownerId, item)
  const topic = cleanTopic(project.topic)
  if (!topic) throw viralSays(NO_TOPIC)
  await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, ownIdeaScriptPrice(await writerForPrices()).cents)

  const answer = await askWriter({
    userId: ownerId,
    feature: OWN_IDEA_SCRIPT_FEATURE,
    metadata: { vaultItemId: item.id, ...viralProjectSpendMetadata(project.id) },
    prompt: ownScriptPrompt({ title: item.title, notes: vaultNotesText(item) }, topic),
    schema: scriptSchema,
    label: "The script",
  })
  requireHook(answer.script, "Press Write a script again.")
  const [row] = await db
    .update(viralVaultItems)
    .set({
      analysisTopic: topic,
      analysis: {
        whyItWorks: { hook: "", parts: [], whySpread: "" },
        script: answer.script.map((part) => ({ ...part, seconds: Math.round(part.seconds) })),
        ideas: [],
        title: { title: "", caption: "", hashtags: [] },
      },
      editedScript: null,
      updatedAt: now(),
    })
    .where(and(eq(viralVaultItems.id, item.id), eq(viralVaultItems.ownerId, ownerId)))
    .returning()
  // Deleted while the AI was writing: the script has nothing to sit on.
  if (!row) throw viralSays("That idea is no longer in the vault.")
  return serializeVaultRow(row)
}
