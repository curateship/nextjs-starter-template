import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { pickTranscriber, pickWriter } from "@/lib/video/ai-choices"
import { brollPhrasesCostCents } from "@/lib/video/ai-estimates"
import {
  BROLL_DOWNLOAD_FAILED_MESSAGE,
  BROLL_MAX_SENTENCES,
  BROLL_NO_KEY_MESSAGE,
  BROLL_NO_SPEECH_MESSAGE,
  BROLL_NO_VOICE_MESSAGE,
  BROLL_PHRASES_FAILED_MESSAGE,
  BROLL_TOO_MANY_MESSAGE,
  brollCredit,
  cleanPhrase,
  pexelsOrientation,
  splitSentences,
  wordsFromCaptionLines,
  type BrollCandidate,
  type BrollPlacement,
  type BrollSentence,
  type TimedWord,
} from "@/lib/video/b-roll"
import {
  CAPTIONS_FAILED_MESSAGE,
  CAPTIONS_TOO_LONG_MESSAGE,
  findCaptionSource,
} from "@/lib/video/captions"
import { clipMsAt, sourceEndMs } from "@/lib/video/clip-playback"
import { readSavedCaptions } from "@/lib/video/saved-voiceovers"
import {
  requireCanonicalTimeline,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { wordsInStretch, type FileWord } from "@/lib/video/transcripts"
import { db } from "@/server/db"
import { cleanAltText } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import {
  discardGeneratedAsset,
  saveGeneratedAsset,
} from "@/server/video/asset-factories/media"
import { requireGeminiKey } from "@/server/video/gemini"
import { downloadPexelsFile, searchPexelsRows, type PexelsBatch } from "@/server/video/pexels"
import { projectSpendMetadata, requireProjectBudget } from "@/server/video/project-spend"
import { getOwnedProject } from "@/server/video/projects"
import { videoVoiceovers } from "@/server/video/schema"
import { getAiDefaults, getPexelsApiKey } from "@/server/video/settings"
import { fileWords, readSavedTranscript } from "@/server/video/transcripts"
import { askWriter } from "@/server/video/writer"

/**
 * B-roll from Pexels (see `workspace/docs/b-roll.md`).
 *
 * The voice line is the lane the captions would be written from: the one
 * holding the project's main talking clip. Every clip on that lane is read,
 * so a voice line cut into pieces, or a brief's scene-by-scene voice, comes
 * out as one run of sentences. Nothing is downloaded until Place.
 */

const BROLL_PHRASES_FEATURE = "broll_phrases"
const BROLL_TRANSCRIPT_FEATURE = "broll_transcript"
const BROLL_PHRASES_LABEL = "B-roll phrases"

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]

/** The clips with sound on the voice line, in the order they play. */
function voiceLineClips(timeline: ProjectTimeline): Clip[] {
  const chosen = findCaptionSource(timeline.tracks)
  if (!chosen) return []
  const track = timeline.tracks.find((one) => one.id === chosen.trackId)
  return (track?.clips ?? [])
    .filter(
      (clip) =>
        (clip.kind === "audio" || clip.kind === "video") &&
        clip.mediaId &&
        clip.durationMs > 0
    )
    .sort((a, b) => a.startMs - b.startMs)
}

/** The voiceovers' kept words, by file, for files of this person's own. */
async function shelfWords(userId: string, mediaIds: string[]) {
  if (!mediaIds.length) return new Map<string, FileWord[]>()
  const rows = await db
    .select({ mediaId: videoVoiceovers.mediaId, captions: videoVoiceovers.captions })
    .from(videoVoiceovers)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoVoiceovers.mediaId))
    .where(
      and(inArray(videoVoiceovers.mediaId, mediaIds), eq(customShellMedia.userId, userId))
    )
  return new Map(
    rows.map((row) => [row.mediaId, wordsFromCaptionLines(readSavedCaptions(row.captions))])
  )
}

/** Every voice-line file with its words, read from the file's own start. */
async function voiceLineFileWords(
  userId: string,
  projectId: string,
  clips: Clip[]
): Promise<Map<string, FileWord[]>> {
  const mediaIds = [...new Set(clips.map((clip) => clip.mediaId!))]
  const words = await shelfWords(userId, mediaIds)
  const unwritten = mediaIds.filter((id) => !words.has(id))
  if (!unwritten.length) return words

  // A file with no voiceover words is written down the way Captions does it,
  // and kept, so Captions and Tighten read the same words for nothing later.
  const transcriber = pickTranscriber(await getAiDefaults(), await getAiKeysSaved())
  if (!transcriber) await requireGeminiKey()
  if (!transcriber) throw new Error(CAPTIONS_FAILED_MESSAGE)
  const media = await db
    .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
    .from(customShellMedia)
    .where(and(inArray(customShellMedia.id, unwritten), eq(customShellMedia.userId, userId)))
  for (const file of media) {
    words.set(
      file.id,
      await fileWords({
        userId,
        media: file,
        transcriber,
        feature: BROLL_TRANSCRIPT_FEATURE,
        label: "B-roll",
        projectId,
        tooLongMessage: CAPTIONS_TOO_LONG_MESSAGE,
        failedMessage: CAPTIONS_FAILED_MESSAGE,
      })
    )
  }
  return words
}

/**
 * The words each voice-line clip plays, moved onto the timeline. A clip
 * trimmed or sped up takes only the stretch it plays, at its own pace.
 */
export function voiceLineWords(clips: Clip[], byFile: Map<string, FileWord[]>): TimedWord[] {
  return clips.flatMap((clip) =>
    wordsInStretch(byFile.get(clip.mediaId!) ?? [], clip.trimStartMs, sourceEndMs(clip)).map(
      (word) => ({
        text: word.text,
        startMs: Math.round(clip.startMs + clipMsAt(clip, word.startMs)),
        endMs: Math.round(clip.startMs + clipMsAt(clip, word.endMs)),
      })
    )
  )
}

export type BrollStatus = {
  hasKey: boolean
  /** Null when the project has nothing with sound in it. */
  voice: {
    /** How long the voice line plays on the timeline. */
    talkMs: number
    /** Sound with no words kept yet, which Find B-roll writes down first. */
    toWriteDownMs: number
  } | null
}

/** What the B-roll window needs before the press: the key, and the price. */
export async function brollStatus(userId: string, projectId: string): Promise<BrollStatus> {
  const project = await getOwnedProject(userId, projectId)
  const clips = voiceLineClips(requireCanonicalTimeline(project.timeline))
  const hasKey = (await getPexelsApiKey().catch(() => null)) !== null
  if (!clips.length) return { hasKey, voice: null }

  const files = new Map(clips.map((clip) => [clip.mediaId!, clip]))
  const shelf = await shelfWords(userId, [...files.keys()])
  const transcriber = pickTranscriber(await getAiDefaults(), await getAiKeysSaved())
  let toWriteDownMs = 0
  for (const [mediaId, clip] of files) {
    if (shelf.has(mediaId)) continue
    const saved = transcriber
      ? await readSavedTranscript(userId, mediaId, transcriber.id)
      : null
    if (!saved) toWriteDownMs += clip.sourceDurationMs ?? clip.durationMs
  }
  return {
    hasKey,
    voice: {
      talkMs: clips.reduce((sum, clip) => sum + clip.durationMs, 0),
      toWriteDownMs,
    },
  }
}

const phrasesSchema = z.object({
  subject: z.string(),
  phrases: z.array(z.string()),
})

/** The writer's instructions. The rules are the feature, so they are spelled out. */
export function brollPhrasesPrompt(
  projectName: string,
  sentences: { text: string }[],
  again?: { got: number }
) {
  const list = sentences.map((sentence, index) => `${index + 1}. ${sentence.text}`).join("\n")
  const retry = again
    ? `\n\nYour last answer had ${again.got} phrases for ${sentences.length} sentences. Give exactly ${sentences.length}.`
    : ""
  return `You pick free stock video from Pexels to show while a narrator speaks. For each numbered sentence below, write one Pexels video search phrase.

The video is called: ${JSON.stringify(projectName)}

The sentences:
${list}

Rules for every phrase:
- Name the thing the sentence is about, not a word that happens to be in it. "Our open rates doubled" is about email, so "email inbox laptop", never "opening letter".
- Describe a concrete scene a camera could film: "city traffic night", not "progress" or "success".
- When the sentence is about a feeling, show a place, an object or hands, never a person's face.
- One to three words. No quotes, no punctuation.
- When a phrase on its own could mean something else, add the video's main subject: "apple orchard" in a video about farming, not "apple".

Answer with JSON: {"subject": "the video's main subject in one to three words", "phrases": ["one phrase per sentence, in the same order"]}. There must be exactly ${sentences.length} phrases.${retry}`
}

/**
 * One phrase per sentence, from one writer call for all of them. A count
 * that does not match is asked again once, naming the miss. Each phrase is
 * cleaned to at most three words, and an empty one becomes the subject.
 */
export async function askBrollPhrases(
  userId: string,
  projectId: string,
  projectName: string,
  sentences: BrollSentence[],
  ask: typeof askWriter = askWriter
): Promise<{ subject: string; phrases: string[] }> {
  const run = (prompt: string) =>
    ask({
      userId,
      feature: BROLL_PHRASES_FEATURE,
      metadata: { ...projectSpendMetadata(projectId), sentences: sentences.length },
      prompt,
      schema: phrasesSchema,
      label: BROLL_PHRASES_LABEL,
      timeoutMs: 120_000,
    })
  let answer = await run(brollPhrasesPrompt(projectName, sentences))
  if (answer.phrases.length !== sentences.length) {
    answer = await run(
      brollPhrasesPrompt(projectName, sentences, { got: answer.phrases.length })
    )
  }
  if (answer.phrases.length !== sentences.length) {
    throw new Error(BROLL_PHRASES_FAILED_MESSAGE)
  }
  const subject = cleanPhrase(answer.subject) || cleanPhrase(projectName) || "nature"
  return {
    subject,
    phrases: answer.phrases.map((phrase) => cleanPhrase(phrase) || subject),
  }
}

export type BrollRow = BrollSentence & {
  phrase: string
  /** Absent until the row has been searched. Empty when nothing was found. */
  candidates?: BrollCandidate[]
}

export type BrollSuggestion = {
  aspect: AspectRatio
  rows: BrollRow[]
  stopped: PexelsBatch["stopped"]
}

async function requirePexelsKey() {
  const key = await getPexelsApiKey()
  if (!key) throw new Error(BROLL_NO_KEY_MESSAGE)
  return key
}

/**
 * Find B-roll: the voice line's sentences, a phrase for each, and up to four
 * Pexels clips for each phrase. A search that stops part-way keeps what it
 * found and hands back the phrases, because the phrases were paid for.
 */
export async function suggestBroll(
  userId: string,
  projectId: string,
  search: typeof searchPexelsRows = searchPexelsRows,
  ask: typeof askWriter = askWriter
): Promise<BrollSuggestion> {
  const apiKey = await requirePexelsKey()
  const project = await getOwnedProject(userId, projectId)
  const timeline = requireCanonicalTimeline(project.timeline)
  const clips = voiceLineClips(timeline)
  if (!clips.length) throw new Error(BROLL_NO_VOICE_MESSAGE)

  const writer = pickWriter(await getAiDefaults(), await getAiKeysSaved())
  await requireProjectBudget(
    userId,
    projectId,
    writer
      ? brollPhrasesCostCents({
          writer: writer.id,
          talkMs: clips.reduce((sum, clip) => sum + clip.durationMs, 0),
        })
      : 0
  )

  const words = voiceLineWords(clips, await voiceLineFileWords(userId, projectId, clips))
  const sentences = splitSentences(words)
  if (!sentences.length) throw new Error(BROLL_NO_SPEECH_MESSAGE)
  if (sentences.length > BROLL_MAX_SENTENCES) throw new Error(BROLL_TOO_MANY_MESSAGE)

  const { phrases } = await askBrollPhrases(userId, projectId, project.name, sentences, ask)
  const rows: BrollRow[] = sentences.map((sentence, index) => ({
    ...sentence,
    phrase: phrases[index],
  }))
  const batch = await search({
    apiKey,
    rows: rows.map((row) => ({ id: row.id, phrase: row.phrase })),
    orientation: pexelsOrientation(timeline.aspect),
  })
  return {
    aspect: timeline.aspect,
    rows: rows.map((row) =>
      batch.found[row.id] ? { ...row, candidates: batch.found[row.id] } : row
    ),
    stopped: batch.stopped,
  }
}

/** Searches rows again: one edited phrase, or the rows a stop left waiting. */
export async function searchBroll(
  userId: string,
  input: { projectId: string; rows: { id: string; phrase: string }[] },
  search: typeof searchPexelsRows = searchPexelsRows
): Promise<PexelsBatch> {
  const apiKey = await requirePexelsKey()
  const project = await getOwnedProject(userId, input.projectId)
  const timeline = requireCanonicalTimeline(project.timeline)
  return search({
    apiKey,
    rows: input.rows
      .map((row) => ({ id: row.id, phrase: cleanPhrase(row.phrase) }))
      .filter((row) => row.phrase),
    orientation: pexelsOrientation(timeline.aspect),
  })
}

export type BrollPick = {
  startMs: number
  endMs: number
  phrase: string
  candidate: Pick<
    BrollCandidate,
    "pexelsId" | "pageUrl" | "photographer" | "photographerUrl" | "fileUrl" | "durationMs"
  >
}

/** How many Pexels files download at once on Place. */
const DOWNLOADS_AT_ONCE = 3

/**
 * Place, the server's half: downloads every ticked file and saves it to the
 * library with the Pexels credit as its alt text. All or nothing: if one file
 * fails, the ones already saved are removed again and nothing is placed, so
 * the grid can be pressed again as it is. Laying them on the timeline is the
 * editor's job, so the whole placing is one change and one Undo.
 */
export async function saveBrollPicks(
  userId: string,
  input: { projectId: string; picks: BrollPick[] },
  download: typeof downloadPexelsFile = downloadPexelsFile
): Promise<BrollPlacement[]> {
  await getOwnedProject(userId, input.projectId)
  const saved: { id: string; storagePath: string }[] = []
  const placements: BrollPlacement[] = new Array(input.picks.length)
  let next = 0
  let failed = false
  async function worker() {
    while (!failed && next < input.picks.length) {
      const index = next
      next += 1
      const pick = input.picks[index]
      try {
        const bytes = await download(pick.candidate.fileUrl)
        const name = `Pexels ${pick.phrase} ${pick.candidate.pexelsId}`
        const asset = await saveGeneratedAsset({
          userId,
          bytes,
          mimeType: "video/mp4",
          fileType: "video",
          name,
          altText: cleanAltText(brollCredit(pick.candidate)) ?? undefined,
        })
        saved.push(asset)
        placements[index] = {
          startMs: pick.startMs,
          endMs: pick.endMs,
          mediaId: asset.id,
          url: asset.url,
          name: `Pexels: ${pick.phrase}`,
          sourceDurationMs: pick.candidate.durationMs,
        }
      } catch (error) {
        console.error("B-roll download", pick.candidate.pexelsId, error)
        failed = true
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOADS_AT_ONCE, input.picks.length) }, worker)
  )
  if (failed) {
    await Promise.all(saved.map((asset) => discardGeneratedAsset(asset)))
    throw new Error(BROLL_DOWNLOAD_FAILED_MESSAGE)
  }
  return placements
}
