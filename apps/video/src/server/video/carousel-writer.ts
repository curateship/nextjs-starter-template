import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import {
  DRAFT_BODY_MAX,
  DRAFT_HEADLINE_MAX,
  draftCarouselSlides,
} from "@/lib/video/carousel-drafts"
import {
  CAROUSEL_NOT_FOUND_MESSAGE,
  requireCanonicalCarouselSlides,
  requireCarouselFormat,
  type CarouselFormat,
  type CarouselSlide,
} from "@/lib/video/carousel-schema"
import {
  CAROUSEL_NO_WORDS_MESSAGE,
  CAROUSEL_SLIDE_COUNT,
  CAROUSEL_SOURCE_EMPTY_MESSAGE,
  FIRST_SLIDE_NO_TEXT_MESSAGE,
  PROJECT_SCRIPT_EMPTY_MESSAGE,
} from "@/lib/video/carousel-writing"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import type { TranslateLanguage } from "@/lib/video/translate"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import {
  cleanCarouselName,
  getOwnedCarouselDetail,
  serializeCarousel,
  type CarouselItem,
} from "@/server/video/carousels"
import { readLinkText } from "@/server/video/link-reader"
import { getOwnedProject } from "@/server/video/projects"
import { videoCarousels, videoVoiceovers } from "@/server/video/schema"
import { askWriter } from "@/server/video/writer"

/**
 * The carousel's writing tools (workspace/docs/carousel-writing.md): a whole
 * carousel from a topic, notes, a project's script or a web page; three
 * stronger lines for the first slide; the post caption; and copies in other
 * languages. Each one goes through the chosen writer and on the meter under
 * its own name. None of them changes a carousel the person is editing: a
 * draft and a translation are new carousels, and lines and captions come back
 * for the editor to place as an ordinary edit.
 */

/** Room for a long article or a long script, and no more. */
const SOURCE_MAX = 20_000

export type CarouselSource =
  | { kind: "topic"; text: string }
  | { kind: "notes"; text: string }
  | { kind: "project"; projectId: string }
  | { kind: "link"; url: string }

/**
 * The words a project says: the scripts of the voiceovers on its timeline in
 * the order they play, or failing those the words written on it.
 */
export async function projectScript(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  const project = await getOwnedProject(userId, projectId, database)
  const clips = requireCanonicalTimeline(project.timeline)
    .tracks.flatMap((track) => track.clips)
    .sort((a, b) => a.startMs - b.startMs)
  const soundIds = [
    ...new Set(
      clips.flatMap((clip) =>
        clip.kind === "audio" && clip.mediaId ? [clip.mediaId] : []
      )
    ),
  ]
  const scripts = soundIds.length
    ? await database
        .select({ mediaId: videoVoiceovers.mediaId, script: videoVoiceovers.script })
        .from(videoVoiceovers)
        // Only the person's own files: a timeline can name any file id.
        .innerJoin(customShellMedia, eq(customShellMedia.id, videoVoiceovers.mediaId))
        .where(
          and(
            inArray(videoVoiceovers.mediaId, soundIds),
            eq(customShellMedia.userId, userId)
          )
        )
    : []
  const said = soundIds
    .map((id) => scripts.find((row) => row.mediaId === id)?.script.trim())
    .filter(Boolean)
  const words = said.length
    ? said.join("\n\n")
    : clips
        .flatMap((clip) => (clip.kind === "text" && clip.text?.trim() ? [clip.text.trim()] : []))
        .join("\n")
  if (!words.trim()) throw new Error(PROJECT_SCRIPT_EMPTY_MESSAGE)
  return { name: project.name, words: words.slice(0, SOURCE_MAX) }
}

async function sourceWords(
  userId: string,
  source: CarouselSource,
  database: CustomShellDb
) {
  if (source.kind === "project") return projectScript(userId, source.projectId, database)
  const words =
    source.kind === "link" ? await readLinkText(source.url) : source.text.trim()
  if (!words) throw new Error(CAROUSEL_SOURCE_EMPTY_MESSAGE)
  return { name: null, words: words.slice(0, SOURCE_MAX) }
}

function draftSchema(count: number) {
  return z.object({
    name: z.string().max(200),
    slides: z
      .array(
        z.object({
          headline: z.string().max(DRAFT_HEADLINE_MAX * 2),
          body: z.string().max(DRAFT_BODY_MAX * 2),
        })
      )
      .length(count),
  })
}

function draftPrompt(source: CarouselSource, words: string, count: number) {
  const what =
    source.kind === "topic"
      ? `the topic "${words}"`
      : source.kind === "notes"
        ? "these notes"
        : source.kind === "project"
          ? "the script of this video"
          : "this web page"
  return `Write an Instagram carousel of exactly ${count} slides about ${what}.
${source.kind === "topic" ? "" : `\n${JSON.stringify(words)}\n`}
Answer with JSON only, in exactly this shape, and nothing else:
{ "name": "...", "slides": [{ "headline": "...", "body": "..." }] }

Rules:
- Exactly ${count} slides, in order.
- Slide 1 is the hook: a headline that makes someone stop scrolling, and a body of at most one short line.
- The slides between make one point each: a headline of the point and a body of one or two short sentences that explain it.
- The last slide tells the reader what to do next, such as save the post or follow.
- Every headline is at most ${DRAFT_HEADLINE_MAX} characters and every body at most ${DRAFT_BODY_MAX}.
- "name" is a short name for the carousel, at most 60 characters.
- Write in the language of the source. Keep names, brands and numbers as they are.
- No hashtags, no emoji, no quotation marks around the words.`
}

/**
 * A new carousel written from `source`, `slideCount` slides, in `format`.
 * Answers it, ready to open in the editor.
 */
export async function writeCarouselDraft({
  userId,
  source,
  slideCount,
  format,
  database = db,
}: {
  userId: string
  source: CarouselSource
  slideCount: number
  format: CarouselFormat
  database?: CustomShellDb
}) {
  const count = Math.min(
    CAROUSEL_SLIDE_COUNT.max,
    Math.max(CAROUSEL_SLIDE_COUNT.min, Math.round(slideCount))
  )
  const { name, words } = await sourceWords(userId, source, database)
  const answer = await askWriter({
    userId,
    feature: "carousel_draft",
    metadata: { source: source.kind, slides: count },
    prompt: draftPrompt(source, words, count),
    schema: draftSchema(count),
    label: "Carousel writer",
    timeoutMs: 120_000,
  })
  const slides = requireCanonicalCarouselSlides(
    draftCarouselSlides(answer.slides, requireCarouselFormat(format))
  )
  const timestamp = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(
        answer.name.trim() || name || (source.kind === "topic" ? words : "New carousel")
      ),
      format,
      slides,
      // Written from a project's script, it is that project's carousel.
      projectId: source.kind === "project" ? source.projectId : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return serializeCarousel(row)
}

/** Every text layer's words, slide by slide, for the writer to read. */
function carouselWords(slides: CarouselSlide[]) {
  return slides.map((slide, index) => ({
    slide: index + 1,
    words: slide.items.flatMap((item) =>
      item.type === "text" && item.text.trim() ? [item.text.trim()] : []
    ),
  }))
}

const linesSchema = z.object({ lines: z.array(z.string().max(400)).max(6) })

/**
 * Three other ways to word the first slide's main text, the layer picked.
 * Nothing is changed here; picking one is the editor's job.
 */
export async function suggestFirstSlideLines({
  userId,
  carouselId,
  itemId,
  database = db,
}: {
  userId: string
  carouselId: string
  itemId: string
  database?: CustomShellDb
}) {
  const carousel = await getOwnedCarouselDetail(userId, carouselId, database)
  const item = carousel.slides[0]?.items.find((candidate) => candidate.id === itemId)
  if (item?.type !== "text" || !item.text.trim()) {
    throw new Error(FIRST_SLIDE_NO_TEXT_MESSAGE)
  }
  const rest = carouselWords(carousel.slides.slice(1)).flatMap((slide) => slide.words)
  const answer = await askWriter({
    userId,
    feature: "carousel_first_slide",
    metadata: { carouselId },
    prompt: `Rewrite the first slide of an Instagram carousel so more people swipe to the next one.

The first slide says: ${JSON.stringify(item.text.trim())}
The slides after it say: ${JSON.stringify(rest.slice(0, 40))}

Answer with JSON only, in exactly this shape, and nothing else:
{ "lines": ["...", "...", "..."] }

Rules:
- Exactly three lines, each one complete on its own.
- Keep them about as long as the original, never longer than ${Math.max(60, item.text.trim().length + 20)} characters.
- Keep the language, the meaning and any names or numbers.
- Make each different: one plainer, one more curious, one bolder.
- Promise what the slides after it deliver, and nothing they do not.
- No hashtags, no emoji, no quotation marks around the line.`,
    schema: linesSchema,
    label: "First slide",
  })
  return answer.lines
    .map((line) => line.trim().replace(/^["“]|["”]$/g, ""))
    .filter((line) => line && line !== item.text.trim())
    .slice(0, 3)
}

/** The post caption, written from the slides' words, with no hashtags. */
export async function writeCarouselCaption({
  userId,
  carouselId,
  database = db,
}: {
  userId: string
  carouselId: string
  database?: CustomShellDb
}) {
  const carousel = await getOwnedCarouselDetail(userId, carouselId, database)
  const words = carouselWords(carousel.slides)
  if (!words.some((slide) => slide.words.length)) {
    throw new Error(CAROUSEL_NO_WORDS_MESSAGE)
  }
  const answer = await askWriter({
    userId,
    feature: "carousel_caption",
    metadata: { carouselId },
    prompt: `Write the caption for an Instagram carousel post.

The slides, in order: ${JSON.stringify(words)}

Answer with JSON only, in exactly this shape, and nothing else:
{ "caption": "..." }

Rules:
- Open with one line that makes someone want to swipe through.
- Then two to four short lines that add to the slides rather than repeat them.
- End with one line asking the reader to save, share or comment.
- At most 1,500 characters. Put a blank line between the parts.
- No hashtags at all. No emoji. Write in the language of the slides.`,
    schema: z.object({ caption: z.string().min(1).max(2_200) }),
    label: "Carousel caption",
  })
  // A hashtag starts with a letter, so "our #1 tip" keeps its number.
  return answer.caption
    .replace(/\s*#\p{L}[\p{L}\p{N}_]*/gu, "")
    .trim()
    .slice(0, 2_200)
}

/**
 * One copy of the carousel per language, every text layer translated and
 * the rest left as it is. The original is never changed. A language that
 * fails is named in `failed`, and the others are still made.
 */
export async function translateCarousel({
  userId,
  carouselId,
  languages,
  database = db,
}: {
  userId: string
  carouselId: string
  languages: TranslateLanguage[]
  database?: CustomShellDb
}) {
  const carousel = await getOwnedCarouselDetail(userId, carouselId, database)
  const texts = carousel.slides.flatMap((slide) =>
    slide.items.flatMap((item) =>
      item.type === "text" && item.text.trim() ? [item.text] : []
    )
  )
  if (!texts.length) throw new Error(CAROUSEL_NO_WORDS_MESSAGE)
  const made: CarouselItem[] = []
  const failed: { language: TranslateLanguage; message: string }[] = []
  for (const language of [...new Set(languages)]) {
    try {
      made.push(
        await translatedCopy(userId, carousel, texts, language, database)
      )
    } catch (error) {
      console.error("Carousel translation failed", carouselId, language, error)
      failed.push({
        language,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { made, failed }
}

async function translatedCopy(
  userId: string,
  carousel: Awaited<ReturnType<typeof getOwnedCarouselDetail>>,
  texts: string[],
  language: TranslateLanguage,
  database: CustomShellDb
) {
  const carouselId = carousel.id
  const answer = await askWriter({
    userId,
    feature: "carousel_translation",
    metadata: { carouselId, language, layers: texts.length },
    prompt: `Translate the words on the slides of an Instagram carousel into ${language}.

The words, one text box each, as a JSON list:
${JSON.stringify(texts)}

Answer with JSON only, in exactly this shape, and nothing else:
{ "texts": ["...", "..."] }

Rules:
- Exactly ${texts.length} texts, one for each, in the same order. Never merge or split them.
- Keep each about as short as the original, since it has to fit the same box.
- Keep line breaks where the original has them.
- Keep names, brands and numbers as they are.
- Write it the way a native speaker would, not word for word.
- A text already in ${language} stays as it is.`,
    schema: z.object({
      texts: z.array(z.string().max(2_000)).length(texts.length),
    }),
    label: "Carousel translation",
    timeoutMs: 120_000,
  })
  let next = 0
  const slides = carousel.slides.map((slide) => ({
    ...slide,
    id: uuid(),
    items: slide.items.map((item) => {
      const copy = { ...item, id: uuid() }
      if (copy.type !== "text" || !copy.text.trim()) return copy
      const { marks: _marks, ...rest } = copy
      // Bold and highlighted letters point at the old words, so they go.
      return { ...rest, text: answer.texts[next++].trim() }
    }),
  }))
  const timestamp = now()
  const [row] = await database
    .insert(videoCarousels)
    .values({
      id: uuid(),
      userId,
      name: cleanCarouselName(`${carousel.name} (${language})`),
      format: carousel.format,
      slides: requireCanonicalCarouselSlides(slides),
      caption: carousel.caption,
      projectId: carousel.project_id,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  if (!row) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  return serializeCarousel(row)
}
