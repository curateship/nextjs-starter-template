import { z } from "zod"

import type { WriterId } from "@/lib/video/ai-choices"
import { briefScriptCostCents } from "@/lib/video/ai-estimates"
import { aiMusicCostCents } from "@/lib/video/ai-music"
import { TRANSLATE_LANGUAGES } from "@/lib/video/translate"
import { IMAGE_MODEL_IDS } from "@/lib/video/asset-factories"
import {
  BRIEF_BREATH_MS,
  BRIEF_DEFAULT_PICTURE_MODEL,
  BRIEF_LONG_SECONDS_MAX,
  BRIEF_PLATFORM_IDS,
  BRIEF_SHORT_SECONDS_MAX,
  BRIEF_SHORT_SECONDS_MIN,
  SCENE_PICTURE_MAX,
  SCENE_WORDS_MAX,
  briefVoiceSchema,
  platformFor,
  scenePictureCents,
  sceneVoiceCents,
  storyboardCents,
  type BriefPlatform,
  type BriefVoice,
  type StoredScene,
} from "@/lib/video/brief"
import {
  captionLookSchema,
  type CaptionPlacement,
  type CaptionSettings,
} from "@/lib/video/caption-look"
import type { AspectRatio } from "@/lib/video/timeline-schema"
import { countWords, wordsPerMinuteAt } from "@/lib/video/script-check"

/**
 * Templates (`workspace/docs/templates.md`): a person's saved instructions for
 * the AI, picked on a video in the editor's Templates panel. A template says
 * what the video is, how long it runs, how it looks and sounds, and what
 * happens once it is made. The video's script is pasted beside it, and Brief
 * to video makes the video from the two.
 *
 * Everything here is shared by the panel, the server and the tests: what a
 * template holds, the three starters, how a pasted script is cut into scenes,
 * and what a video made with a template usually costs.
 */

export const TEMPLATE_NAME_MAX = 120
export const TEMPLATE_INSTRUCTIONS_MAX = 4_000
export const TEMPLATE_AUDIENCE_MAX = 300
export const TEMPLATE_REFERENCES_MAX = 6
export const TEMPLATE_TAGS_MAX = 8
export const TEMPLATE_TAG_MAX = 30
export const TEMPLATE_LANGUAGES_MAX = 5
export const TEMPLATE_MUSIC_MOOD_MAX = 300
/** About thirty minutes read aloud, the longest a brief may run. */
export const TEMPLATE_SCRIPT_MAX = 40_000
/** A one-line idea, the old brief window's "What it is about". */
export const TEMPLATE_IDEA_MAX = 1_000
/** The most templates one person keeps. */
export const TEMPLATES_MAX = 200
/** One sentence describing a template for the AI to write. */
export const TEMPLATE_DESCRIBE_MAX = 500
/** A rewritten writer's prompt in What the AI reads. */
export const TEMPLATE_PROMPT_MAX = 12_000
/** Where a pasted script's scenes go in the Instructions. */
export const SCENES_TOKEN = "{{scenes}}"

export const TEMPLATE_NOT_FOUND_MESSAGE = "That template is no longer there."
export const TEMPLATE_NO_NAME_MESSAGE = "Give the template a name."
export const TEMPLATE_TOO_MANY_MESSAGE = `You have ${TEMPLATES_MAX} templates, the most one person keeps. Delete one first.`
export const TEMPLATE_NO_SCRIPT_MESSAGE =
  "Paste a script, or type a one-line idea for the AI to write one from."
export const TEMPLATE_NO_TEMPLATE_MESSAGE = "Pick a template for this video first."
export const TEMPLATE_NO_VOICE_MESSAGE =
  "This template has no voice, and no usual voice is saved. Pick one in the template's Voice row."
export const TEMPLATE_NO_DESCRIPTION_MESSAGE = "Say in a sentence what the template is for."
export const TEMPLATE_REFERENCE_KIND_MESSAGE = "That file can't be a reference of this kind."

/** The cap a template sets on one video, said with the price that would pass it (part 13). */
export function templateCapMessage(capCents: number, totalCents: number, formatCents: (cents: number) => string) {
  return `This template's cap is ${formatCents(capCents)} a video, and this one would cost about ${formatCents(totalCents)}, ${formatCents(totalCents - capCents)} over. Raise the cap in the template or cut some scenes.`
}

export function tooManyScenesMessage(count: number, max: number) {
  return `This script makes ${count} scenes, and one video holds up to ${max}. Split it into two videos.`
}

/** Refusals worded with their own numbers, which the error toast shows as they are. */
export function isTemplateRefusal(message: string) {
  return (
    SAFE_TEMPLATE_ERRORS.has(message) ||
    message.startsWith("This template's cap is ") ||
    message.startsWith("This script makes ") ||
    message.startsWith("A template holds up to ") ||
    message.startsWith("That reference hasn't been broken down") ||
    message === "Pick the video to write the template from." ||
    message === "Nothing changed: edit a scene's words first." ||
    message === "Only a video whose scenes are all on the timeline can have scenes made again."
  )
}

export const SAFE_TEMPLATE_ERRORS = new Set([
  TEMPLATE_NOT_FOUND_MESSAGE,
  TEMPLATE_NO_NAME_MESSAGE,
  TEMPLATE_TOO_MANY_MESSAGE,
  TEMPLATE_NO_SCRIPT_MESSAGE,
  TEMPLATE_NO_TEMPLATE_MESSAGE,
  TEMPLATE_NO_VOICE_MESSAGE,
  TEMPLATE_NO_DESCRIPTION_MESSAGE,
  TEMPLATE_REFERENCE_KIND_MESSAGE,
])

// ------------------------------------------------------------- Pace ------

/**
 * How long each scene runs. Normal is what Brief to video always did: 3 to 8
 * seconds on a short platform, 5 to 15 on YouTube.
 */
export const TEMPLATE_PACES = [
  { id: "fast", label: "Fast", short: { min: 2, max: 4 }, long: { min: 2, max: 4 } },
  { id: "normal", label: "Normal", short: { min: 3, max: 8 }, long: { min: 5, max: 15 } },
  { id: "slow", label: "Slow", short: { min: 8, max: 15 }, long: { min: 8, max: 15 } },
] as const

export type TemplatePace = (typeof TEMPLATE_PACES)[number]["id"]
export const TEMPLATE_PACE_IDS = TEMPLATE_PACES.map((pace) => pace.id) as [
  TemplatePace,
  ...TemplatePace[],
]

/** The shortest and longest a scene runs at this pace on this platform, in seconds. */
export function paceRange(pace: TemplatePace, platform: BriefPlatform) {
  const found = TEMPLATE_PACES.find((one) => one.id === pace) ?? TEMPLATE_PACES[1]
  return platformFor(platform).short ? found.short : found.long
}

export function paceLabel(pace: TemplatePace) {
  return TEMPLATE_PACES.find((one) => one.id === pace)?.label ?? "Normal"
}

// ------------------------------------------------------------ Fields ------

/**
 * Something the AI studies before writing the scenes. A picture goes with
 * every picture request; a video, a Viral original or a link is broken down
 * shot by shot once (the saved-video job, `video_viral_videos`), and the
 * breakdown's words go into the instructions. `savedVideoId` names that row.
 */
export const TEMPLATE_REFERENCE_KINDS = ["picture", "video", "viral", "link"] as const
export type TemplateReferenceKind = (typeof TEMPLATE_REFERENCE_KINDS)[number]

export const templateReferenceSchema = z
  .object({
    id: z.string().min(1).max(36),
    kind: z.enum(TEMPLATE_REFERENCE_KINDS),
    name: z.string().max(200),
    mediaId: z.string().min(1).max(36).optional(),
    url: z.string().max(2_048).optional(),
    savedVideoId: z.string().min(1).max(36).optional(),
  })
  .strict()

export type TemplateReference = z.infer<typeof templateReferenceSchema>

export const templateMusicSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({ kind: z.literal("track"), mediaId: z.string().min(1).max(36), name: z.string().max(255) })
    .strict(),
  z.object({ kind: z.literal("ai"), mood: z.string().trim().min(1).max(TEMPLATE_MUSIC_MOOD_MAX) }).strict(),
])

export type TemplateMusic = z.infer<typeof templateMusicSchema>

const lengthSchema = z.number().int().min(BRIEF_SHORT_SECONDS_MIN).max(BRIEF_LONG_SECONDS_MAX)

/** Everything a template tells the AI and the app, field by field. */
export const templateFieldsSchema = z
  .object({
    /** What the video is, in the person's own words. */
    instructions: z.string().max(TEMPLATE_INSTRUCTIONS_MAX),
    platform: z.enum(BRIEF_PLATFORM_IDS),
    /** The length asked for. A pasted script runs its own length instead. */
    lengthSeconds: lengthSchema,
    audience: z.string().max(TEMPLATE_AUDIENCE_MAX),
    pace: z.enum(TEMPLATE_PACE_IDS),
    /** Null reads with the usual voice saved in the Voice window. */
    voice: briefVoiceSchema.nullable(),
    pictureModel: z.enum(IMAGE_MODEL_IDS),
    /** The one person in every scene that shows a person. */
    actorId: z.string().min(1).max(36).nullable(),
    references: z.array(templateReferenceSchema).max(TEMPLATE_REFERENCES_MAX),
    /** Captions on or off, and their look; a null look is the saved one. */
    captions: z.object({ on: z.boolean(), look: captionLookSchema.nullable() }).strict(),
    music: templateMusicSchema,
    /** The template's own intro and outro; null leaves the project's. */
    introMediaId: z.string().min(1).max(36).nullable(),
    outroMediaId: z.string().min(1).max(36).nullable(),
    /** A copy in each of these once the video is made. */
    languages: z.array(z.enum(TRANSLATE_LANGUAGES)).max(TEMPLATE_LANGUAGES_MAX),
    /** The most one video may cost, in cents. Null is no cap. */
    spendCapCents: z.number().int().min(1).max(10_000_000).nullable(),
    /**
     * The Instructions card: everything the writer is told, as the person
     * wrote it, with the scenes put where {{scenes}} stands. Null uses the
     * app's own, built from the description, audience, rules and reference
     * videos. The app adds the answer's format after it (Tyler, 5 Nov 2026:
     * "I should be able to edit these", then one card instead of four).
     */
    scriptPrompt: z.string().max(TEMPLATE_PROMPT_MAX).nullable(),
  })
  .strict()

export type TemplateFields = z.infer<typeof templateFieldsSchema>
export type TemplateFieldKey = keyof TemplateFields

export const DEFAULT_TEMPLATE_FIELDS: TemplateFields = {
  instructions: "",
  platform: "shorts",
  lengthSeconds: 45,
  audience: "",
  pace: "normal",
  voice: null,
  pictureModel: BRIEF_DEFAULT_PICTURE_MODEL,
  actorId: null,
  references: [],
  captions: { on: true, look: null },
  music: { kind: "none" },
  introMediaId: null,
  outroMediaId: null,
  languages: [],
  spendCapCents: null,
  scriptPrompt: null,
}

/**
 * A stored template's fields, field by field: one that no longer reads (a
 * picture model taken away, a list grown past its limit) falls back to the
 * default on its own, and the rest keep what was saved.
 */
export function readTemplateFields(value: unknown): TemplateFields {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const shape = templateFieldsSchema.shape
  const read = { ...DEFAULT_TEMPLATE_FIELDS } as Record<string, unknown>
  for (const key of Object.keys(shape) as TemplateFieldKey[]) {
    if (!(key in saved)) continue
    const parsed = shape[key].safeParse(saved[key])
    if (parsed.success) read[key] = parsed.data
  }
  const fields = read as TemplateFields
  // A length past the platform's own limit comes down to it.
  return { ...fields, lengthSeconds: fitLength(fields.lengthSeconds, fields.platform) }
}

/** A length that fits the platform: 15 to 180 seconds on a short one, to 30 minutes on YouTube. */
export function fitLength(seconds: number, platform: BriefPlatform) {
  const max = platformFor(platform).short ? BRIEF_SHORT_SECONDS_MAX : BRIEF_LONG_SECONDS_MAX
  return Math.min(max, Math.max(BRIEF_SHORT_SECONDS_MIN, Math.round(seconds)))
}

/** A change to some of a template's fields, as the edit dropdown saves them. */
export const templateFieldsPatchSchema = templateFieldsSchema.partial()
export type TemplateFieldsPatch = z.infer<typeof templateFieldsPatchSchema>

/**
 * A video's own copy of the template's settings (part 34). Tyler, 5 Nov
 * 2026: "changing anything in the dropdown is ONLY for the the currant
 * video. The only way to change the template is by clicking here [its cog in
 * the Templates panel]. selecting a template is just applying the parameters
 * to the currant video". So picking a template copies every field onto the
 * video, the header's settings window changes the copy, and editing the
 * template later never reaches a video that already picked it.
 *
 * Kept in `video_project_videos.template_changes`, the column the one-off
 * changes were first kept in, read field by field like a template's own.
 */
export const templateChangesSchema = templateFieldsPatchSchema

export type TemplateChanges = TemplateFieldsPatch

export function readTemplateChanges(value: unknown): TemplateChanges {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const shape = templateFieldsSchema.shape
  const read: Record<string, unknown> = {}
  for (const key of Object.keys(shape) as TemplateFieldKey[]) {
    if (!(key in saved)) continue
    const parsed = shape[key].safeParse(saved[key])
    if (parsed.success) read[key] = parsed.data
  }
  return read as TemplateChanges
}

/** The settings a video makes with: its own copy, over the template's for anything the copy lacks. */
export function withChanges(fields: TemplateFields, changes: TemplateChanges): TemplateFields {
  const merged = { ...fields, ...changes }
  return { ...merged, lengthSeconds: fitLength(merged.lengthSeconds, merged.platform) }
}

/** What a brief keeps of the template it was made from. */
export const templateSnapshotSchema = z.object({
  name: z.string().max(TEMPLATE_NAME_MAX),
  fields: z.unknown(),
})

export type TemplateSnapshot = { name: string; fields: TemplateFields }

export function readTemplateSnapshot(value: unknown): TemplateSnapshot | null {
  const parsed = templateSnapshotSchema.safeParse(value)
  if (!parsed.success) return null
  return { name: parsed.data.name, fields: readTemplateFields(parsed.data.fields) }
}

// ------------------------------------------------------------- Tags ------

/** Tags as typed: trimmed, at most 30 characters, no repeats whatever the capitals. */
export function cleanTags(tags: string[]) {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const tag of tags) {
    const clean = tag.trim().replace(/\s+/g, " ").slice(0, TEMPLATE_TAG_MAX)
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    kept.push(clean)
    if (kept.length >= TEMPLATE_TAGS_MAX) break
  }
  return kept
}

export const templateTagsSchema = z.array(z.string().max(TEMPLATE_TAG_MAX * 2)).max(TEMPLATE_TAGS_MAX * 2)

// ---------------------------------------------------------- Starters ------

export const TEMPLATE_STARTERS = [
  {
    key: "work-with-me",
    name: "Work with me",
    fields: {
      ...DEFAULT_TEMPLATE_FIELDS,
      instructions:
        "A calm work-with-me video. I sit down to one real task and the viewer works alongside me. Open on what I'm getting done today and why it matters, then walk through the session in plain, friendly words: the set-up, the focus, a small problem and how I got past it, and what's finished at the end. End by inviting the viewer to do one session of their own. Pictures: warm natural light, a tidy desk, soft focus behind, real photos rather than illustrations.",
      lengthSeconds: 45,
      pace: "slow",
      audience: "people who want company and focus while they work",
    },
  },
  {
    key: "day-in-my-life",
    name: "Day in my life",
    fields: {
      ...DEFAULT_TEMPLATE_FIELDS,
      instructions:
        "A day-in-my-life video told in order from morning to night. Each scene is one moment of the day: where I am, what I'm doing and one honest thought about it. Keep it personal and specific, with small details people recognise. Open on the most surprising moment of the day as the hook, then go back to the morning. Pictures: bright, everyday phone-camera photos, candid framing, real places.",
      lengthSeconds: 60,
      pace: "normal",
      audience: "followers curious about how I spend my days",
    },
  },
  {
    key: "tips-list",
    name: "Tips list",
    fields: {
      ...DEFAULT_TEMPLATE_FIELDS,
      instructions:
        "A numbered tips video. Open by naming the problem the tips solve. Then give each tip as its own scene: the tip in one short line, then one sentence on why it works. Say the number of each tip out loud. Keep the strongest tip for last and end by asking which one the viewer will try first. Pictures: clean, simple shots with one clear subject each and plenty of space around it.",
      lengthSeconds: 40,
      pace: "fast",
      audience: "beginners who want quick, practical advice",
    },
  },
] as const satisfies readonly { key: string; name: string; fields: TemplateFields }[]

// ------------------------------------------------------ The script box ------

/**
 * A scene as the person wrote it: the words to say, and the picture they
 * asked for with a `[show: ...]` note, if they did.
 */
export type ScriptBlock = { words: string; picture: string | null }

const SHOW_NOTE = /\[\s*show\s*:\s*([^\]]*)\]/gi
const BREAK_LINE = /^\s*-{3,}\s*$/

function tidyWords(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Cuts a pasted script where the person cut it: a blank line or a line of
 * `---` starts a new scene. A `[show: ...]` note becomes that scene's picture
 * and is never read aloud. A part with a note and no words lends its note to
 * the next part that has words.
 */
export function readScriptBlocks(script: string): ScriptBlock[] {
  const parts: string[] = []
  let current: string[] = []
  for (const line of script.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim() || BREAK_LINE.test(line)) {
      if (current.length) parts.push(current.join("\n"))
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) parts.push(current.join("\n"))

  const blocks: ScriptBlock[] = []
  let waitingNote: string | null = null
  for (const part of parts) {
    const notes = [...part.matchAll(SHOW_NOTE)].map((match) => tidyWords(match[1])).filter(Boolean)
    const words = tidyWords(part.replace(SHOW_NOTE, " "))
    const note = notes.length ? notes.join(". ").slice(0, SCENE_PICTURE_MAX) : null
    if (!words) {
      waitingNote = note ?? waitingNote
      continue
    }
    blocks.push({ words, picture: note ?? waitingNote })
    waitingNote = null
  }
  return blocks
}

/** Only the words that are read aloud: the script with its picture notes and breaks taken out. */
export function spokenScript(script: string) {
  return readScriptBlocks(script)
    .map((block) => block.words)
    .join(" ")
}

/** How long these words take to say, in seconds, at the voice's speed. */
export function readingSeconds(words: string, speed = 1) {
  const count = countWords(words)
  return count ? (count / wordsPerMinuteAt(speed)) * 60 : 0
}

/** The sentences of a part, each ending at its full stop, question or exclamation mark. */
export function sentencesOf(text: string) {
  const found = text.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g) ?? []
  return found.map((sentence) => sentence.trim()).filter(Boolean)
}

/**
 * Cuts one part of a script into scenes at the ends of sentences, aiming at
 * the pace's middle length. A sentence is never split: a sentence longer than
 * the pace's longest is a scene on its own. Every word stays, in order.
 */
export function cutIntoScenes(text: string, range: { min: number; max: number }, speed = 1) {
  const target = (range.min + range.max) / 2
  const scenes: string[] = []
  let current = ""
  for (const sentence of sentencesOf(text)) {
    const joined = current ? `${current} ${sentence}` : sentence
    const fits = readingSeconds(joined, speed) <= range.max
    const short = readingSeconds(current, speed) < target
    if (!current || (fits && short)) {
      current = joined
      continue
    }
    scenes.push(current)
    current = sentence
  }
  if (current) scenes.push(current)
  // A last scene shorter than the pace's shortest joins the one before it
  // when the two still fit.
  if (scenes.length > 1) {
    const last = scenes[scenes.length - 1]
    const joined = `${scenes[scenes.length - 2]} ${last}`
    if (readingSeconds(last, speed) < range.min && readingSeconds(joined, speed) <= range.max) {
      scenes.splice(scenes.length - 2, 2, joined)
    }
  }
  return scenes.flatMap((scene) => splitLongWords(scene))
}

/** A scene's words must fit the storyboard's box. A very long sentence is cut at a comma, then a space. */
function splitLongWords(words: string): string[] {
  if (words.length <= SCENE_WORDS_MAX) return [words]
  const cut = words.lastIndexOf(", ", SCENE_WORDS_MAX)
  const at = cut > SCENE_WORDS_MAX / 2 ? cut + 1 : words.lastIndexOf(" ", SCENE_WORDS_MAX)
  const end = at > 0 ? at : SCENE_WORDS_MAX
  return [words.slice(0, end).trim(), ...splitLongWords(words.slice(end).trim())]
}

/**
 * The scenes a pasted script becomes: the person's own parts when they cut
 * it, each part cut further at sentence ends only when it runs past the
 * pace's longest, and the whole thing cut at sentence ends when they didn't.
 * Each scene keeps the picture note of the part it came from, on its first
 * scene only.
 */
export function scriptScenes(
  script: string,
  range: { min: number; max: number },
  speed = 1
): ScriptBlock[] {
  const blocks = readScriptBlocks(script)
  if (blocks.length <= 1) {
    const only = blocks[0]
    if (!only) return []
    return cutIntoScenes(only.words, range, speed).map((words, index) => ({
      words,
      picture: index === 0 ? only.picture : null,
    }))
  }
  return blocks.flatMap((block) => {
    const pieces =
      readingSeconds(block.words, speed) > range.max * 1.5
        ? cutIntoScenes(block.words, range, speed)
        : splitLongWords(block.words)
    return pieces.map((words, index) => ({ words, picture: index === 0 ? block.picture : null }))
  })
}

// ------------------------------------------------------------- Price ------

/** About six characters a word, spaces included, for pricing a voice by the character. */
const CHARACTERS_PER_WORD = 6

/** The voice a price is worked out for when the template reads with the usual voice. */
const PRICED_VOICE: Pick<BriefVoice, "speaker" | "modelId"> = {
  speaker: "elevenlabs",
  modelId: "eleven_multilingual_v2",
}

/**
 * What a video made with this template usually costs, in cents (part 24):
 * one picture a scene at the pace's middle length, the voice by the
 * character at 170 words a minute, the music when the template makes it, and
 * every language copy's voice. The script and its check are a cent or two on
 * top, shown on their own button.
 */
export function typicalTemplateCents(fields: TemplateFields, lengthSeconds = fields.lengthSeconds) {
  const range = paceRange(fields.pace, fields.platform)
  const scenes = Math.max(1, Math.ceil(lengthSeconds / ((range.min + range.max) / 2)))
  const characters = Math.round((lengthSeconds / 60) * 170 * CHARACTERS_PER_WORD)
  const voice = fields.voice ?? PRICED_VOICE
  const reading = sceneVoiceCents(voice, "x".repeat(characters))
  const pictures = scenes * scenePictureCents(fields.pictureModel)
  const music = fields.music.kind === "ai" ? aiMusicCostCents(lengthSeconds * 1000) : 0
  return pictures + reading + music + fields.languages.length * reading
}


// ---------------------------------------------------------- Captions ------

/**
 * The captions a template's brief lays (part 11): none when the template
 * switched them off, its own look when it has one, and the saved look
 * otherwise. A brief from the old window, with no template, keeps the saved
 * look as it always did.
 */
export function templateCaptions(
  fields: TemplateFields | null | undefined,
  saved: CaptionSettings,
  aspect: AspectRatio
): CaptionPlacement | null {
  if (fields && !fields.captions.on) return null
  return { ...saved, look: fields?.captions.look ?? saved.look, aspect }
}

// ------------------------------------------------------- Make it ------

/**
 * What Make it costs: the scenes, the template's AI music, and the voice of
 * every language copy it asks for, whose pictures are the same ones. The
 * video's own spend limit counts the first two; the cap counts them all.
 */
export function makingCents(
  scenes: Pick<StoredScene, "words">[],
  voice: Pick<BriefVoice, "speaker" | "modelId">,
  pictureModel: string,
  fields: TemplateFields | null | undefined
) {
  const sceneCents = storyboardCents(scenes, voice, pictureModel)
  const runMs = scenes.reduce((sum, scene) => sum + readingSeconds(scene.words) * 1000 + BRIEF_BREATH_MS, 0)
  const music = fields?.music.kind === "ai" ? aiMusicCostCents(runMs) : 0
  const voiceOnly = scenes.reduce((sum, scene) => sum + sceneVoiceCents(voice, scene.words), 0)
  const languages = (fields?.languages.length ?? 0) * voiceOnly
  return { thisVideo: sceneCents + music, total: sceneCents + music + languages }
}


/**
 * What writing a template's scenes and checking them costs, before the
 * press: the script and its check as Brief to video always priced them, the
 * pasted script's reading length standing in for the template's.
 */
export function templateScriptCostCents(writer: WriterId | null, fields: TemplateFields, text: string) {
  if (!writer) return 0
  const lengthSeconds = Math.max(1, readingSeconds(spokenScript(text)))
  const script = briefScriptCostCents({
    writer,
    lengthSeconds,
    briefCharacters: (fields.scriptPrompt ?? fields.instructions).length + fields.audience.length,
  })
  return script
}
