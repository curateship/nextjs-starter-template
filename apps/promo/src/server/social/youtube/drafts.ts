import { and, eq } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { archiveFileAt } from "@/server/archive/files"
import { promoArchiveItems } from "@/server/archive/schema"
import {
  ABOUT_MAX,
  DESCRIPTION_MAX,
  TAGS_MAX,
  TAG_MAX,
  TITLE_MAX,
  TITLES_PER_PRESS,
  isShort,
  splitTags,
  tagsLength,
  type TemplateSection,
} from "@/lib/social/youtube/options"

import { askModel, pickProvider } from "../drafts"
import { projectDescription } from "../projects"
import { promoAccounts } from "../schema"
import { wordsForAccount } from "../voices"
import { promoYoutubeTemplates } from "./schema"

/**
 * Write in YouTube's New post (YouTube task, parts 5 and 6): three titles to
 * pick from, one description and the tags, in the channel's voice, from what
 * the person says the video is about and, for an Archive video, its caption
 * and subtitles. Nothing is stored and nothing is posted: the words land in
 * the boxes to be edited, and only what is in them when Post is pressed goes
 * out.
 *
 * With a description template picked, the description is the template's
 * sections in order, a blank line between each. A fixed section is copied
 * word for word by Promo, never by the AI; the AI writes the others only.
 */

/** How much of the subtitles the AI is given: enough to know the video, not a transcript to rewrite. */
const SUBTITLE_CHARS = 6_000

export type YoutubeWords = { titles: string[]; description: string; tags: string[] }

/** The words of an .srt file without its numbers and timings, one line of speech each. */
export function subtitleWords(srt: string): string {
  return srt
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+$/.test(line) && !/-->/.test(line))
    .join(" ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SUBTITLE_CHARS)
}

export type YoutubePromptInput = {
  voice: string
  rules: string
  product: string
  about: string
  caption: string
  subtitles: string
  short: boolean
  /** The template's sections the AI writes, in order, with their notes. Empty when no template is picked. */
  aiSections: Array<{ name: string; note: string }>
}

/** The words handed to the model. */
export function buildYoutubePrompt(input: YoutubePromptInput): string {
  const describe = input.aiSections.length
    ? [
        "The description follows a template. Write only the parts named below, each under its own marker line, in this order. Other parts of the description are added by hand, so do not write links, sign-offs or anything not asked for.",
        ...input.aiSections.map((section, index) => `[[PART ${index + 1}]] ${section.name}${section.note ? `: ${section.note}` : ""}`),
      ].join("\n")
    : `Then a line [[DESCRIPTION]] and the description under it: what the video gives the viewer, in short paragraphs. No links. At most ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`
  return [
    `You are writing the words for a ${input.short ? "YouTube Short" : "YouTube video"} uploaded by this channel.`,
    input.voice ? `How you write:\n${input.voice}` : "",
    input.rules ? `Rules you always follow:\n${input.rules}` : "",
    input.product ? `What you make, for context. Name it only where it helps the viewer:\n${input.product}` : "",
    input.about ? `What the video is about:\n${input.about}` : "",
    input.caption ? `The caption the video came with:\n${input.caption}` : "",
    input.subtitles ? `What is said in the video:\n${input.subtitles}` : "",
    [
      `Answer with ${TITLES_PER_PRESS} different titles, each on its own line starting TITLE:, each under ${TITLE_MAX} characters, plain, true to the video, no clickbait in capitals and no quotation marks.`,
      `Then one line starting TAGS: with up to 15 search phrases people really type, separated by commas, under ${TAGS_MAX} characters in all.`,
      describe,
      "Nothing else: no preamble and no notes.",
    ].join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
}

function unquote(text: string): string {
  return text.trim().replace(/^["“']|["”']$/g, "").trim()
}

/**
 * Reads the model's answer: the titles, the tags, and either the
 * description or the template parts by their markers. Pure, so it is tested.
 */
export function readYoutubeAnswer(answer: string, partCount: number): { titles: string[]; tags: string[]; description: string; parts: string[] } {
  const titles: string[] = []
  let tags: string[] = []
  const parts: string[] = Array.from({ length: partCount }, () => "")
  let description = ""
  let into: { kind: "description" } | { kind: "part"; index: number } | null = null
  for (const raw of answer.replace(/\r/g, "").split("\n")) {
    const line = raw.trim()
    const title = line.match(/^TITLE\s*\d*\s*:\s*(.+)$/i)
    if (title) {
      const text = unquote(title[1] ?? "").slice(0, TITLE_MAX)
      if (text && !titles.some((seen) => seen.toLowerCase() === text.toLowerCase())) titles.push(text)
      into = null
      continue
    }
    const tagLine = line.match(/^TAGS\s*:\s*(.*)$/i)
    if (tagLine) {
      tags = splitTags(tagLine[1] ?? "").filter((tag) => tag.length <= TAG_MAX)
      into = null
      continue
    }
    if (/^\[\[DESCRIPTION\]\]/i.test(line)) {
      into = { kind: "description" }
      const rest = line.replace(/^\[\[DESCRIPTION\]\]\s*/i, "")
      if (rest) description += `${rest}\n`
      continue
    }
    const part = line.match(/^\[\[PART\s*(\d+)\]\]\s*(.*)$/i)
    if (part) {
      const index = Number(part[1]) - 1
      into = index >= 0 && index < partCount ? { kind: "part", index } : null
      continue
    }
    if (!into) continue
    if (into.kind === "description") description += `${raw}\n`
    else parts[into.index] += `${raw}\n`
  }
  // Tags past YouTube's 500 characters are dropped from the end.
  while (tags.length && tagsLength(tags) > TAGS_MAX) tags.pop()
  return {
    titles: titles.slice(0, TITLES_PER_PRESS),
    tags,
    description: description.trim(),
    parts: parts.map((text) => text.trim()),
  }
}

/** The template's sections joined in order: fixed words as typed, AI parts as written. */
export function joinTemplate(sections: TemplateSection[], parts: string[]): string {
  const out: string[] = []
  let next = 0
  for (const section of sections) {
    const text = section.kind === "fixed" ? section.text.trim() : (parts[next++] ?? "").trim()
    if (text) out.push(text)
  }
  return out.join("\n\n")
}

/** An Archive item's caption, the words of its subtitles, and whether it goes up as a Short. */
async function archiveItemWords(userId: string, itemId: string, db: CustomShellDb): Promise<{ caption: string; subtitles: string; short: boolean }> {
  const [item] = await db
    .select({
      caption: promoArchiveItems.caption,
      subtitles: promoArchiveItems.subtitles,
      width: promoArchiveItems.width,
      height: promoArchiveItems.height,
      durationMs: promoArchiveItems.durationMs,
    })
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.id, itemId), eq(promoArchiveItems.userId, userId)))
    .limit(1)
  if (!item) return { caption: "", subtitles: "", short: false }
  return { caption: item.caption.trim().slice(0, 2_000), subtitles: subtitleWords(item.subtitles), short: isShort(item) }
}

/** The Archive item behind a video's address, read as `archiveItemWords`; nothing for a media library file. */
async function archiveWords(userId: string, mediaUrl: string, db: CustomShellDb): Promise<{ caption: string; subtitles: string; short: boolean }> {
  const storagePath = mediaUrl ? await storagePathForUrl(mediaUrl) : null
  const file = storagePath ? await archiveFileAt(userId, storagePath, db) : null
  return file ? archiveItemWords(userId, file.itemId, db) : { caption: "", subtitles: "", short: false }
}

/** Three titles, a description and tags for the channel's next upload. */
export async function writeYoutubeWords(
  userId: string,
  input: { accountId: string; about: string; mediaUrl: string; templateId: string | null; itemId?: string },
  db: CustomShellDb = defaultDb
): Promise<YoutubeWords> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, input.accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Refusal("That channel is not there any more.")
  if (account.platform !== "youtube") throw new Refusal("Only a YouTube channel gets YouTube words.")
  const about = input.about.trim().slice(0, ABOUT_MAX)
  const fromArchive = input.itemId ? await archiveItemWords(userId, input.itemId, db) : await archiveWords(userId, input.mediaUrl.trim(), db)
  if (!about && !fromArchive.caption && !fromArchive.subtitles) {
    throw new Refusal("Say what the video is about first, in a line or two, or pick a video from the archive.")
  }
  let sections: TemplateSection[] = []
  if (input.templateId) {
    const [template] = await db
      .select({ sections: promoYoutubeTemplates.sections })
      .from(promoYoutubeTemplates)
      .where(and(eq(promoYoutubeTemplates.id, input.templateId), eq(promoYoutubeTemplates.userId, userId)))
      .limit(1)
    if (!template) throw new Refusal("That description template is not there any more. Pick another, or none.")
    sections = template.sections
  }
  const aiSections = sections.filter((section) => section.kind === "ai").map((section) => ({ name: section.name, note: section.text }))
  const words = await wordsForAccount(userId, account.id, db)
  const { provider, model, key } = await pickProvider()
  const prompt = buildYoutubePrompt({
    voice: words.voice,
    rules: words.commentRules,
    product: await projectDescription(userId, account.projectId, db),
    about,
    caption: fromArchive.caption,
    subtitles: fromArchive.subtitles,
    short: fromArchive.short,
    aiSections,
  })
  return askModel(
    {
      userId,
      provider,
      model,
      feature: "youtube-words",
      projectId: account.projectId,
      metadata: { accountId: account.id, templateId: input.templateId ?? "" },
      prompt,
      key,
    },
    (answer) => {
      const read = readYoutubeAnswer(answer, aiSections.length)
      if (!read.titles.length) throw new Error(`${provider} answered, but nothing in the answer looked like a title.`)
      const description = (sections.length ? joinTemplate(sections, read.parts) : read.description).slice(0, DESCRIPTION_MAX)
      return { titles: read.titles, description, tags: read.tags }
    }
  )
}

/**
 * The description for Write captions' YouTube box in the Archive (part 5),
 * written for the project's first YouTube channel from the item's words.
 */
export async function writeArchiveYoutubeDescription(
  userId: string,
  input: { accountId: string; about: string; itemId: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const words = await writeYoutubeWords(userId, { ...input, mediaUrl: "", templateId: null }, db)
  return words.description
}
