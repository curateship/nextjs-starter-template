import { and, eq, inArray } from "drizzle-orm"
import sharp from "sharp"
import { z } from "zod"

import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { PICTURE_READER_MODEL } from "@/lib/video/ai-estimates"
import type { ImageModelId } from "@/lib/video/asset-factories"
import { isVoiceOrigin } from "@/lib/video/clip-origin"
import { pictureEditCostCents, type PictureEditKind } from "@/lib/video/picture-edits"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import {
  fullPictureLayer,
  layerId,
  newTextLayer,
  readThumbnailLayers,
  THUMBNAIL_NO_PICTURE_MESSAGE,
  THUMBNAIL_SIZES,
  thumbnailWords,
  topZ,
  withTextLook,
  type ThumbnailLayer,
  type ThumbnailPicture,
  type ThumbnailShape,
  type ThumbnailText,
} from "@/lib/video/thumbnails"
import {
  COPY_STYLE_LINK_MESSAGE,
  IDEAS_NEED_WORDS_MESSAGE,
  repeatsThumbnailWords,
  translatedFontSize,
  youtubeVideoId,
  type ThumbnailIdea,
} from "@/lib/video/thumbnail-ai"
import { db } from "@/server/db"
import { runAiCall } from "@/server/ai/usage"
import { customShellMedia } from "@/server/schema"
import { generateImage } from "@/server/video/asset-factories/images"
import {
  requireOwnedActor,
  sheetPicturesToSend,
} from "@/server/video/asset-factories/actors"
import { readStoredPicture } from "@/server/video/asset-factories/person-board"
import { generateJson, requireGeminiKey } from "@/server/video/gemini"
import { editPicture, keyOutGreen, readOwnedPicture } from "@/server/video/picture-edits"
import { requireVideoBudget, videoSpendMetadata } from "@/server/video/project-spend"
import { getOwnedVideo } from "@/server/video/project-videos"
import { renderTimelineStills } from "@/server/video/render"
import { videoMediaTranscripts, videoProjectVideos } from "@/server/video/schema"
import { saveGeneratedAsset } from "@/server/video/asset-factories/media"
import { attachMediaToScope } from "@/server/video/media-list"
import {
  createThumbnail,
  drawThumbnail,
  getOwnedThumbnail,
  insertTemplate,
  keepFrameForBoard,
  saveThumbnailCheck,
  type ThumbnailCheck,
  type ThumbnailRow,
} from "@/server/video/thumbnails"
import { askWriter } from "@/server/video/writer"

/**
 * The AI on the Thumbnail board (thumbnails.md, parts 15 to 22 and 24).
 *
 * Every picture press makes new versions and leaves the one it started from
 * as it was: 1, 2 or 4 of them (Tyler, 3 Nov 2026), each a copy of the open
 * thumbnail with the changed picture in it. Words come from the app's saved
 * writing AI. Anything that has to look at pictures is asked of Gemini Flash,
 * because the writing AI is asked words only.
 */

function jpegPart(bytes: Uint8Array) {
  return { inline_data: { mime_type: "image/jpeg", data: Buffer.from(bytes).toString("base64") } }
}

async function asJpeg(bytes: Uint8Array, maxSide: number) {
  return new Uint8Array(
    await sharp(bytes)
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#000000" })
      .jpeg({ quality: 85 })
      .toBuffer()
  )
}

async function askPictures<T>({
  owner,
  video,
  feature,
  label,
  schema,
  parts,
}: {
  owner: string
  video: { id: string; projectId: string }
  feature: string
  label: string
  schema: z.ZodType<T>
  parts: unknown[]
}) {
  const apiKey = await requireGeminiKey()
  return runAiCall(
    {
      userId: owner,
      provider: "gemini",
      model: PICTURE_READER_MODEL,
      feature,
      metadata: videoSpendMetadata(video),
    },
    async () => {
      const reply = await generateJson({ apiKey, model: PICTURE_READER_MODEL, label, schema, parts })
      return {
        result: reply.value,
        usage: { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens },
      }
    }
  )
}

/** A copy of a thumbnail's layers with one picture layer pointing elsewhere. */
function swapPicture(
  layers: ThumbnailLayer[],
  layer: ThumbnailPicture,
  picture: { media_id: string; url: string; name: string },
  cutOut: boolean
) {
  return layers.map((one) =>
    one.id === layer.id
      ? {
          ...layer,
          mediaId: picture.media_id,
          url: picture.url,
          altText: picture.name.slice(0, 500),
          ...(cutOut ? { fit: "contain" as const } : {}),
        }
      : one
  )
}

/**
 * One AI change to a picture layer, made `tries` times side by side, each
 * landing as a new version (parts 3, 4, 15, 17 and 18).
 */
export async function changeBoardPicture({
  owner,
  thumbnailId,
  layerId: pictureLayerId,
  kind,
  words,
  model,
  tries,
}: {
  owner: string
  thumbnailId: string
  layerId: string
  kind: PictureEditKind
  words?: string
  model: ImageModelId
  tries: number
}): Promise<ThumbnailRow[]> {
  const row = await getOwnedThumbnail(owner, thumbnailId)
  const layers = readThumbnailLayers(row.layers)
  const layer = layers.find(
    (one): one is ThumbnailPicture => one.id === pictureLayerId && one.type === "image"
  )
  if (!layer) throw new Error(THUMBNAIL_NO_PICTURE_MESSAGE)
  const video = await requireVideoBudget(owner, row.videoId, pictureEditCostCents(model, tries))
  const picture = await readOwnedPicture(owner, layer.mediaId)
  const made = await Promise.all(
    Array.from({ length: tries }, () =>
      editPicture({
        owner,
        video,
        source: picture,
        kind,
        words,
        model,
        name: `${picture.name.slice(0, 60)} ${kind}`,
      })
    )
  )
  return Promise.all(
    made.map((edited) =>
      createThumbnail({
        owner,
        videoId: row.videoId,
        shape: row.shape,
        backgroundColor: row.backgroundColor,
        title: row.title,
        layers: swapPicture(layers, layer, edited, kind === "cutout"),
      })
    )
  )
}

// --- Ideas from the video (part 16) ------------------------------------------

/** At most this many frames go with the ask, spread across the video. */
const IDEA_FRAMES_MAX = 60
const IDEA_FRAME_EVERY_MS = 5_000

const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        at_seconds: z.number().nonnegative(),
        words: z.string().min(1).max(60),
        expression: z.string().max(120),
        background: z.string().max(160),
      })
    )
    .min(1)
    .max(6),
})

/** What the video says: its voice lines, its words on screen, its saved transcripts. */
async function videoWords(owner: string, timelineValue: unknown) {
  const timeline = requireCanonicalTimeline(timelineValue)
  const clips = timeline.tracks.flatMap((track) => track.clips)
  const script = [
    ...clips.flatMap((clip) =>
      clip.origin && isVoiceOrigin(clip.origin) ? [clip.origin.prompt] : []
    ),
    ...clips.filter((clip) => clip.kind === "text" && clip.text?.trim()).map((clip) => clip.text!.trim()),
  ]
  const soundIds = [
    ...new Set(
      clips
        .filter((clip) => (clip.kind === "video" || clip.kind === "audio") && clip.mediaId)
        .map((clip) => clip.mediaId!)
    ),
  ]
  const transcripts = soundIds.length
    ? await db
        .select({ words: videoMediaTranscripts.words })
        .from(videoMediaTranscripts)
        .innerJoin(customShellMedia, eq(customShellMedia.id, videoMediaTranscripts.mediaId))
        .where(and(inArray(videoMediaTranscripts.mediaId, soundIds), eq(customShellMedia.userId, owner)))
    : []
  const transcript = transcripts
    .map((row) =>
      Array.isArray(row.words)
        ? (row.words as { text?: unknown }[]).map((word) => (typeof word.text === "string" ? word.text : "")).join(" ")
        : ""
    )
    .join("\n")
  return {
    script: [...new Set(script)].join("\n").slice(0, 6_000),
    transcript: transcript.slice(0, 8_000),
    endMs: Math.max(0, ...clips.map((clip) => clip.startMs + clip.durationMs)),
  }
}

/** One frame every 5 seconds, or 60 spread evenly over a longer video. */
export function ideaFrameStep(endMs: number) {
  return Math.max(IDEA_FRAME_EVERY_MS, Math.ceil(endMs / IDEA_FRAMES_MAX))
}

export async function ideasFromVideo({
  owner,
  videoId,
}: {
  owner: string
  videoId: string
}): Promise<ThumbnailIdea[]> {
  const video = await requireVideoBudget(owner, videoId, 0)
  const words = await videoWords(owner, video.timeline)
  if (!words.script && !words.transcript) throw new Error(IDEAS_NEED_WORDS_MESSAGE)
  const everyMs = ideaFrameStep(words.endMs)
  const frames = await renderTimelineStills({
    userId: owner,
    timeline: video.timeline,
    fromMs: 0,
    toMs: words.endMs,
    everyMs,
    maxSide: 384,
  })
  const answer = await askPictures({
    owner,
    video,
    feature: "thumbnail_ideas",
    label: "Thumbnail ideas",
    schema: ideasSchema,
    parts: [
      {
        text: `You design YouTube thumbnails that get clicked. Here is a video called "${video.name}". Its script:\n${words.script || "(none)"}\n\nWhat is said in it:\n${words.transcript || "(none)"}\n\nThe pictures after this are its frames, one every ${everyMs / 1000} seconds, in order from 0 seconds. Suggest 3 different thumbnail ideas. For each give: at_seconds, the moment whose frame to use (a multiple of ${everyMs / 1000}); words, at most 5 words to put on the picture in capitals, which must not just repeat the title; expression, the face or feeling to show; background, what should be behind. Answer only JSON like {"ideas":[{"at_seconds":10,"words":"I QUIT MY JOB","expression":"shocked, mouth open","background":"bright red"}]}.`,
      },
      ...frames.map(jpegPart),
    ],
  })
  return answer.ideas.slice(0, 3).map((idea) => ({
    atMs: Math.min(words.endMs, Math.round(idea.at_seconds * 1000)),
    words: idea.words.split(/\s+/).slice(0, 5).join(" ").toUpperCase(),
    expression: idea.expression,
    background: idea.background,
  }))
}

/** An idea made into versions: its frame, changed to match, with its words on. */
export async function makeIdea({
  owner,
  videoId,
  shape,
  idea,
  model,
  tries,
}: {
  owner: string
  videoId: string
  shape: ThumbnailShape
  idea: ThumbnailIdea
  model: ImageModelId
  tries: number
}): Promise<ThumbnailRow[]> {
  const video = await requireVideoBudget(owner, videoId, pictureEditCostCents(model, tries))
  const frame = await keepFrameForBoard(owner, video, idea.atMs)
  const source = await readOwnedPicture(owner, frame.mediaId)
  const ask = `Turn this video frame into a YouTube thumbnail photo. Show the main person ${idea.expression || "with a strong, clear expression"}, big and sharp, with ${idea.background || "a simple bright background"} behind them. No words or letters anywhere in the picture.`
  const made = await Promise.all(
    Array.from({ length: tries }, () =>
      editPicture({ owner, video, source, kind: "own", words: ask, model, name: `${video.name.slice(0, 60)} idea` })
    )
  )
  return Promise.all(
    made.map((picture) => {
      const base = fullPictureLayer({ mediaId: picture.media_id, url: picture.url, name: picture.name })
      const text = withTextLook(newTextLayer(shape, [base], idea.words), "accent")
      return createThumbnail({ owner, videoId, shape, layers: [base, text] })
    })
  )
}

// --- Your actor (part 19) ----------------------------------------------------

export async function actorIntoThumbnail({
  owner,
  thumbnailId,
  actorId,
  expression,
  model,
  tries,
}: {
  owner: string
  thumbnailId: string
  actorId: string
  expression: string
  model: ImageModelId
  tries: number
}): Promise<ThumbnailRow[]> {
  const row = await getOwnedThumbnail(owner, thumbnailId)
  const video = await requireVideoBudget(owner, row.videoId, aiUnitCostCents(model, tries))
  const actor = await requireOwnedActor(owner, actorId)
  const pictures = (await sheetPicturesToSend(owner, actor)).slice(0, 3)
  const references = await Promise.all(
    pictures.map(async (media) => ({ bytes: await readStoredPicture(media.storagePath), mimeType: media.mimeType }))
  )
  const layers = readThumbnailLayers(row.layers)
  const made = await Promise.all(
    Array.from({ length: tries }, async () => {
      const image = await generateImage({
        userId: owner,
        model,
        prompt: `Draw this exact person, ${actor.name}, from the waist up, ${expression.trim() || "looking surprised"}, facing the camera, big in the frame, on a plain flat pure green background (#00FF00) with nothing else, no shadow and no floor. Keep their face, hair and build exactly as in the pictures.`,
        aspectRatio: row.shape === "wide" ? "3:4" : "9:16",
        references,
        spend: videoSpendMetadata(video),
      })
      const bytes = await keyOutGreen(image.bytes)
      const media = await saveGeneratedAsset({
        userId: owner,
        bytes,
        mimeType: "image/png",
        fileType: "image",
        name: `${actor.name.slice(0, 60)} cut out`,
      })
      await attachMediaToScope(owner, { type: "project", id: video.projectId }, media.id)
      return media
    })
  )
  return Promise.all(
    made.map((media) =>
      createThumbnail({
        owner,
        videoId: row.videoId,
        shape: row.shape,
        backgroundColor: row.backgroundColor,
        title: row.title,
        layers: [
          ...layers,
          {
            ...fullPictureLayer({ mediaId: media.id, url: media.url, name: media.originalName }, topZ(layers)),
            fit: "contain",
            x: row.shape === "wide" ? 0.55 : 0.05,
            y: row.shape === "wide" ? 0.05 : 0.35,
            width: row.shape === "wide" ? 0.45 : 0.9,
            height: row.shape === "wide" ? 0.95 : 0.65,
            outlineColor: "#ffffff",
            outlineWidth: 10,
          },
        ],
      })
    )
  )
}

// --- Titles (part 20) --------------------------------------------------------

const titlesSchema = z.object({ titles: z.array(z.string().min(1).max(120)).min(1).max(12) })

export async function titlesForThumbnail(owner: string, thumbnailId: string) {
  const row = await getOwnedThumbnail(owner, thumbnailId)
  const video = await requireVideoBudget(owner, row.videoId, 0)
  const onPicture = thumbnailWords(readThumbnailLayers(row.layers))
  const words = await videoWords(owner, video.timeline)
  const answer = await askWriter({
    userId: owner,
    feature: "thumbnail_titles",
    metadata: videoSpendMetadata(video),
    label: "Titles",
    schema: titlesSchema,
    prompt: `Write 8 YouTube titles for a video called "${video.name}". Its thumbnail already says: "${onPicture || "(no words)"}". A good title adds to the thumbnail and never repeats its words. Each title is under 70 characters. What the video says:\n${(words.transcript || words.script).slice(0, 3_000)}\n\nAnswer only JSON like {"titles":["..."]}.`,
  })
  return answer.titles
    .map((title) => title.trim())
    .filter((title) => title && !repeatsThumbnailWords(title, onPicture))
    .slice(0, 5)
}

// --- The check (part 21) -----------------------------------------------------

const checkSchema = z.object({
  marks: z
    .array(
      z.object({
        thing: z.enum(["text", "face", "colour"]),
        mark: z.number().min(0).max(10),
        fix: z.string().min(1).max(200),
      })
    )
    .length(3),
})

export async function checkThumbnail(owner: string, thumbnailId: string): Promise<ThumbnailCheck> {
  const row = await getOwnedThumbnail(owner, thumbnailId)
  const video = await getOwnedVideo(owner, row.videoId)
  const jpeg = await drawThumbnail(owner, row)
  const small = await asJpeg(jpeg, 168)
  const answer = await askPictures({
    owner,
    video,
    feature: "thumbnail_check",
    label: "Thumbnail check",
    schema: checkSchema,
    parts: [
      {
        text: 'You judge YouTube thumbnails. The first picture is a thumbnail at full size; the second is the same thumbnail as small as YouTube\'s "Up next" list shows it. Give a mark out of 10 for each of three things, with one short fix each: thing "text" (do the words still read when small?), thing "face" (is the face big and clear enough, or is there a clear subject when there is no face?), thing "colour" (do the colours stand out against a white page?). Answer only JSON like {"marks":[{"thing":"text","mark":7,"fix":"Make the words bigger"},{"thing":"face","mark":5,"fix":"..."},{"thing":"colour","mark":8,"fix":"..."}]}.',
      },
      jpegPart(await asJpeg(jpeg, 1280)),
      jpegPart(small),
    ],
  })
  const check: ThumbnailCheck = {
    marks: (["text", "face", "colour"] as const).map((thing) => {
      const found = answer.marks.find((mark) => mark.thing === thing)
      return { thing, mark: Math.round(found?.mark ?? 0), fix: found?.fix ?? "" }
    }),
    version: row.version,
  }
  await saveThumbnailCheck(owner, row.id, check)
  return check
}

// --- Copy a style (part 22) --------------------------------------------------

/** Only YouTube's own picture host is ever fetched for a link. */
const YOUTUBE_PICTURE_HOST = "i.ytimg.com"

async function youtubeThumbnail(link: string) {
  const id = youtubeVideoId(link)
  if (!id) throw new Error(COPY_STYLE_LINK_MESSAGE)
  for (const size of ["maxresdefault", "hqdefault"]) {
    const address = new URL(`https://${YOUTUBE_PICTURE_HOST}/vi/${id}/${size}.jpg`)
    // Redirects refused and a 10 second limit, so a slow answer never holds
    // the press open.
    const response = await fetch(address, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
    if (!response) continue
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > 0 && bytes.byteLength < 5 * 1024 * 1024) return bytes
    }
  }
  throw new Error(COPY_STYLE_LINK_MESSAGE)
}

const boxShape = { x: z.number(), y: z.number(), width: z.number(), height: z.number() }
const styleSchema = z.object({
  background_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  pictures: z.array(z.object(boxShape)).max(4),
  texts: z
    .array(
      z.object({
        ...boxShape,
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        outline: z.boolean(),
        box_color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
        accent_color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
        lines: z.number().int().min(1).max(4),
      })
    )
    .max(4),
})

function shareBox(box: { x: number; y: number; width: number; height: number }) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  const x = clamp(box.x)
  const y = clamp(box.y)
  return { x, y, width: Math.max(0.05, clamp(box.width)), height: Math.max(0.05, clamp(box.height)) }
}

export async function copyStyle({
  owner,
  videoId,
  shape,
  link,
  mediaId,
}: {
  owner: string
  videoId: string
  shape: ThumbnailShape
  link?: string
  mediaId?: string
}) {
  const video = await requireVideoBudget(owner, videoId, 0)
  const bytes = link
    ? await youtubeThumbnail(link)
    : (await readOwnedPicture(owner, mediaId ?? "")).bytes
  const answer = await askPictures({
    owner,
    video,
    feature: "thumbnail_copy_style",
    label: "Copy a style",
    schema: styleSchema,
    parts: [
      {
        text: 'Describe the layout of this thumbnail so it can be rebuilt with other pictures and other words. Give every box as x, y, width, height, each a share of the whole picture from 0 to 1. pictures: where the photos or people are. texts: each block of words, with its main colour, whether the letters have a thick outline, the colour of any box behind the words or null, the colour of any word drawn in a different colour or null, and how many lines it runs to. background_color: the main colour behind everything. Answer only JSON like {"background_color":"#101010","pictures":[{"x":0.5,"y":0,"width":0.5,"height":1}],"texts":[{"x":0.04,"y":0.55,"width":0.5,"height":0.35,"color":"#ffffff","outline":true,"box_color":null,"accent_color":"#ffd60a","lines":2}]}.',
      },
      jpegPart(await asJpeg(bytes, 768)),
    ],
  })
  const frame = THUMBNAIL_SIZES[shape]
  const layers: ThumbnailLayer[] = []
  for (const picture of answer.pictures) {
    layers.push({ id: layerId(), type: "spot", ...shareBox(picture), zIndex: layers.length })
  }
  for (const text of answer.texts) {
    const box = shareBox(text)
    const sample = text.lines > 1 ? "YOUR\nWORDS" : "YOUR WORDS"
    let layer: ThumbnailText = {
      ...newTextLayer(shape, layers, sample),
      ...box,
      color: text.color,
      fontSize: Math.max(24, Math.min(220, Math.round((box.height * frame.height) / text.lines / 1.2))),
      outlineColor: text.outline ? "#000000" : undefined,
      outlineWidth: text.outline ? 10 : undefined,
      boxColor: text.box_color ?? undefined,
    }
    if (text.accent_color) layer = { ...withTextLook(layer, "accent"), accentColor: text.accent_color }
    layers.push(layer)
  }
  return insertTemplate(owner, {
    name: link ? "Copied from a YouTube link" : "Copied from a picture",
    shape,
    backgroundColor: answer.background_color,
    layers,
  })
}

// --- Every language (part 24) -------------------------------------------------

const translationSchema = z.object({ lines: z.array(z.string().max(400)) })

/** The video's copies in other languages, for the board's buttons. */
export async function languageCopiesOf(owner: string, videoId: string) {
  await getOwnedVideo(owner, videoId)
  return db
    .select({ id: videoProjectVideos.id, language: videoProjectVideos.language })
    .from(videoProjectVideos)
    .where(and(eq(videoProjectVideos.languageOf, videoId), eq(videoProjectVideos.userId, owner)))
}

export async function translateThumbnail({
  owner,
  thumbnailId,
  copyVideoId,
}: {
  owner: string
  thumbnailId: string
  copyVideoId: string
}): Promise<ThumbnailRow> {
  const row = await getOwnedThumbnail(owner, thumbnailId)
  const copies = await languageCopiesOf(owner, row.videoId)
  const copy = copies.find((one) => one.id === copyVideoId)
  if (!copy?.language) throw new Error("That language copy is no longer here.")
  const video = await requireVideoBudget(owner, copy.id, 0)
  const layers = readThumbnailLayers(row.layers)
  const texts = layers.filter((layer): layer is ThumbnailText => layer.type === "text")
  let lines: string[] = []
  if (texts.length) {
    const answer = await askWriter({
      userId: owner,
      feature: "thumbnail_translate",
      metadata: videoSpendMetadata(video),
      label: "Translating the thumbnail",
      schema: translationSchema,
      prompt: `Translate the words on a YouTube thumbnail into ${copy.language}. Keep them short and punchy, in the same case, one line out for each line in, in the same order. Lines:\n${texts.map((text) => JSON.stringify(text.text)).join("\n")}\n\nAnswer only JSON like {"lines":["..."]}.`,
    })
    lines = answer.lines
  }
  const translated = layers.map((layer) => {
    if (layer.type !== "text") return layer
    const index = texts.indexOf(layer)
    const words = lines[index]?.trim() || layer.text
    return {
      ...layer,
      text: words,
      // A word marked in another colour is the last word again.
      marks: layer.marks?.some((mark) => mark.style === "accent")
        ? withTextLook({ ...layer, text: words, marks: undefined }, "accent").marks
        : undefined,
      fontSize: translatedFontSize(layer.fontSize, layer.text, words),
    }
  })
  return createThumbnail({
    owner,
    videoId: copy.id,
    shape: row.shape,
    backgroundColor: row.backgroundColor,
    layers: translated,
  })
}
