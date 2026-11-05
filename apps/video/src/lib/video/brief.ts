import { z } from "zod"

import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { voiceCostCents } from "@/lib/video/ai-estimates"
import type { GeminiImageModelId } from "@/lib/video/asset-factories"
import { DEFAULT_CAPTION_LOOK, type CaptionPlacement } from "@/lib/video/caption-look"
import type { CaptionLine } from "@/lib/video/captions"
import type { ClipMotion } from "@/lib/video/clip-motion"
import type { ScenePictureOrigin, VoiceOrigin } from "@/lib/video/clip-origin"
import type { TranslateLanguage } from "@/lib/video/translate"
import { clipsFit, OPENAI_VOICE_MODEL } from "@/lib/video/remake-clip"
import { voiceoverClips } from "@/lib/video/saved-voiceovers"
import { DEFAULT_SAFE_BOXES } from "@/lib/video/safe-box"
import {
  MAX_TIMELINE_TRACKS,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import {
  VOICE_MODEL_IDS,
  voiceSettingsSchema,
} from "@/lib/video/voice"

/**
 * Brief to video, on both sides of the wire (`workspace/docs/brief-to-video.md`).
 *
 * A brief becomes a script cut into scenes, the scenes become a storyboard
 * with a price, and Make it turns each scene into a voice line, one still
 * picture and its captions, laid end to end on the timeline. What a brief and
 * its scenes look like, what they cost and where they land is here, so the
 * window, the background job and the tests all work from one copy.
 */

type Tracks = ProjectTimeline["tracks"]
type Track = Tracks[number]
type Clip = Track["clips"][number]

export const BRIEF_PLATFORMS = [
  { id: "shorts", label: "YouTube Shorts", short: true },
  { id: "tiktok", label: "TikTok", short: true },
  { id: "reels", label: "Instagram Reels", short: true },
  { id: "youtube", label: "YouTube", short: false },
] as const

export type BriefPlatform = (typeof BRIEF_PLATFORMS)[number]["id"]
export const BRIEF_PLATFORM_IDS = BRIEF_PLATFORMS.map((one) => one.id) as [
  BriefPlatform,
  ...BriefPlatform[],
]

/** A Short, a TikTok or a Reel runs 15 seconds to 3 minutes. */
export const BRIEF_SHORT_SECONDS_MIN = 15
export const BRIEF_SHORT_SECONDS_MAX = 180
/**
 * Anything else may run up to thirty minutes. Exports have no length limit
 * any more (`long-exports.md`); this one is the brief's own, because every
 * scene of a brief is a voice and a picture that are paid for.
 */
export const BRIEF_LONG_SECONDS_MAX = 30 * 60
export const BRIEF_SCENES_MAX = 120
export const SCENE_WORDS_MAX = 600
export const SCENE_PICTURE_MAX = 500
export const SCENE_SECONDS_MAX = 60
/** The pause between one scene's voice and the next. */
export const BRIEF_BREATH_MS = 200
/** Nano Banana 2, about 7 cents, unless the window is changed. */
export const BRIEF_DEFAULT_PICTURE_MODEL: GeminiImageModelId = "gemini-3.1-flash-image"

export const BRIEF_NOT_FOUND_MESSAGE = "That brief is no longer there."
export const BRIEF_BUSY_MESSAGE =
  "This brief is being made. Wait for it to finish before changing it."
export const BRIEF_NO_SCENES_MESSAGE = "Keep at least one scene."
export const BRIEF_NO_ROOM_MESSAGE = `A brief needs three lanes of its own, and this project already has close to ${MAX_TIMELINE_TRACKS}. Delete empty lanes, then press Make it again.`
export const BRIEF_NOTHING_TO_RETRY_MESSAGE = "Only a scene that failed can be tried again."

export const SAFE_BRIEF_ERRORS = new Set([
  BRIEF_NOT_FOUND_MESSAGE,
  BRIEF_BUSY_MESSAGE,
  BRIEF_NO_SCENES_MESSAGE,
  BRIEF_NO_ROOM_MESSAGE,
  BRIEF_NOTHING_TO_RETRY_MESSAGE,
])

export function platformFor(id: BriefPlatform) {
  return BRIEF_PLATFORMS.find((one) => one.id === id) ?? BRIEF_PLATFORMS[0]
}

/** The shortest and longest a brief on this platform may ask for, in seconds. */
export function briefLengthRange(platform: BriefPlatform) {
  return platformFor(platform).short
    ? { min: BRIEF_SHORT_SECONDS_MIN, max: BRIEF_SHORT_SECONDS_MAX }
    : { min: BRIEF_SHORT_SECONDS_MIN, max: BRIEF_LONG_SECONDS_MAX }
}

/** The voice a brief is read with, chosen in its window. */
export const briefVoiceSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(255),
    speaker: z.enum(["elevenlabs", "openai"]),
    modelId: z.enum(VOICE_MODEL_IDS),
    settings: voiceSettingsSchema,
  })
  .strict()

export type BriefVoice = z.infer<typeof briefVoiceSchema>

/** One scene as the writer answers it, and as the storyboard edits it. */
export const sceneDraftSchema = z.object({
  words: z.string().trim().min(1).max(SCENE_WORDS_MAX),
  picture: z.string().trim().min(1).max(SCENE_PICTURE_MAX),
  seconds: z.number().positive().max(SCENE_SECONDS_MAX),
  /**
   * Whether the template's actor is in this scene's picture. Only a brief
   * made from a template with an actor sets it (templates.md).
   */
  person: z.boolean().optional(),
})

export type SceneDraft = z.infer<typeof sceneDraftSchema>

/** The script a brief is written into: its name, its opening line and its scenes. */
export type BriefScript = { title: string; hook: string; scenes: SceneDraft[] }

/**
 * Where a scene is up to. `draft` until Make it; then `queued` until the
 * worker makes it, `made` until it is on the timeline, and `placed` after.
 * `failed` waits for Try again.
 */
export type SceneState = "draft" | "queued" | "made" | "placed" | "failed"

/** A scene as it is kept, with whatever has been made for it so far. */
export type StoredScene = SceneDraft & {
  id: string
  state: SceneState
  error?: string
  /** Kept the moment it is made, so Try again never pays for it twice. */
  still?: { mediaId: string; name: string; origin: ScenePictureOrigin }
  voice?: {
    mediaId: string
    name: string
    durationMs: number
    captions: CaptionLine[]
    origin: VoiceOrigin
  }
}

/**
 * A scene with the addresses its files play from today. The worker has no
 * addresses to hand, and lays its clips without them; the editor fills them
 * in when it opens the project.
 */
export type SceneWithFiles = StoredScene & {
  still?: StoredScene["still"] & { url?: string }
  voice?: StoredScene["voice"] & { url?: string }
}

/** `draft` while the storyboard is edited, `making` while the worker works, then `stopped` or `done`. */
export type BriefStatus = "draft" | "making" | "stopped" | "done"

/**
 * Where the scenes go: the start, and the three lanes once they exist. A
 * brief made from a template with music also carries the track, made or
 * picked when Make it was pressed, which lands under the whole video with
 * the last scene (templates.md).
 */
export type BriefLanding = {
  startMs: number
  lanes: { words?: string; pictures?: string; voice?: string }
  music?: BriefMusic
  /** Why the template's music could not be made or found. The scenes carry on without it. */
  musicError?: string
}

export type BriefMusic = {
  mediaId: string
  name: string
  durationMs: number
  /** Filled in by the editor, which plays it; the worker lays it without. */
  url?: string
  /** Set once it is on the timeline, with the lane it went on. */
  laid?: boolean
  lane?: string
}

/** What was in the script box when the brief was written (templates.md). */
export type BriefSource = { kind: "script"; text: string }

/**
 * What happened once a template's brief was made: the language copies it
 * started (templates.md). The video stays Draft; a template no longer sets
 * its status (Tyler, 5 Nov 2026: "A new generate video is always draft").
 */
export type BriefFinish = {
  state: "running" | "done"
  languages: { language: TranslateLanguage; videoId?: string; error?: string }[]
  at: string
}

/**
 * The slow moves scene pictures take in turn. A push in sits between two
 * drifts that go opposite ways, so two neighbours never move the same way.
 */
const SCENE_MOTIONS: ClipMotion[] = ["push-in", "drift-right", "push-in", "drift-left"]

export function sceneMotion(index: number): ClipMotion {
  return SCENE_MOTIONS[index % SCENE_MOTIONS.length]
}

/**
 * Where a brief's first scene goes: at the playhead when the timeline is
 * empty, otherwise straight after the last clip, so it never lands over
 * anything.
 */
export function briefStartMs(tracks: Tracks, playheadMs: number) {
  const ends = tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs))
  return ends.length ? Math.max(...ends) : Math.max(0, Math.round(playheadMs))
}

/** How many lanes the timeline needs before a brief can start. */
export function briefLaneRefusal(tracks: Tracks): string | null {
  const empty = tracks.filter((track) => !track.clips.length).length
  const needed = Math.max(0, 3 - empty)
  return tracks.length + needed > MAX_TIMELINE_TRACKS ? BRIEF_NO_ROOM_MESSAGE : null
}

/** The model a voice actually reads with: OpenAI's voices have one. */
function voiceModel(voice: Pick<BriefVoice, "speaker" | "modelId">) {
  return voice.speaker === "openai" ? OPENAI_VOICE_MODEL : voice.modelId
}

/** One scene's picture, in cents to a fraction of a cent. */
export function scenePictureCents(model: string) {
  return aiUnitCostCents(model, 1)
}

/** One scene's words read aloud, by the character the way voices charge. */
export function sceneVoiceCents(voice: Pick<BriefVoice, "speaker" | "modelId">, words: string) {
  return voiceCostCents(voiceModel(voice), words.trim().length)
}

/** What making these scenes costs: a picture and a reading each. */
export function storyboardCents(
  scenes: Pick<SceneDraft, "words">[],
  voice: Pick<BriefVoice, "speaker" | "modelId">,
  pictureModel: string
) {
  return scenes.reduce(
    (sum, scene) => sum + scenePictureCents(pictureModel) + sceneVoiceCents(voice, scene.words),
    0
  )
}

/** What making one scene still costs, leaving out what it already has. */
export function sceneLeftCents(
  scene: Pick<StoredScene, "words" | "still" | "voice">,
  voice: Pick<BriefVoice, "speaker" | "modelId">,
  pictureModel: string
) {
  return (
    (scene.still ? 0 : scenePictureCents(pictureModel)) +
    (scene.voice ? 0 : sceneVoiceCents(voice, scene.words))
  )
}

export function totalSeconds(scenes: Pick<SceneDraft, "seconds">[]) {
  return scenes.reduce((sum, scene) => sum + scene.seconds, 0)
}

/** The words of every scene, as one script for the script check. */
export function storyboardScript(scenes: Pick<SceneDraft, "words">[]) {
  return scenes.map((scene) => scene.words.trim()).join(" ")
}

/**
 * Lays every scene that is made and next in line onto the timeline, as one
 * change, and says which scenes it placed and the lanes they are on.
 *
 * - Scene one starts at the brief's start. Each scene after it starts where
 *   the voice before it ended, plus a 200ms breath.
 * - A scene is the still, the voice under it and the captions over it. The
 *   still runs as long as the voice and the breath, so the pictures meet
 *   end to end, and it takes the next slow move in turn.
 * - A scene lands only after every scene before it, so a failed scene holds
 *   the ones after it back rather than leaving a hole.
 * - The three lanes are the brief's own. The first scene takes empty lanes
 *   where the timeline has them and new ones where it does not. A lane that
 *   was deleted, or has something in the way, gives way to a new lane beside
 *   it, so nothing already on the timeline ever moves or is covered.
 *
 * Null when a lane the scene needs would pass the most a project holds.
 */
export function landBriefScenes(
  tracks: Tracks,
  brief: { scenes: SceneWithFiles[]; landing: BriefLanding },
  newId: () => string,
  /**
   * The caption look, on the project's shape: the saved one, or the
   * template's. Null lays no captions, for a template with captions off.
   */
  captions: CaptionPlacement | null
): { tracks: Tracks; placed: string[]; landing: BriefLanding } | null {
  let next = tracks
  const lanes = { ...brief.landing.lanes }
  const placed: string[] = []
  let atMs = brief.landing.startMs

  for (const [index, scene] of brief.scenes.entries()) {
    const voice = scene.voice
    if (scene.state === "placed" && voice) {
      atMs += voice.durationMs + BRIEF_BREATH_MS
      continue
    }
    if (scene.state !== "made" || !voice || !scene.still) break

    const sound = voiceoverClips(
      {
        mediaId: voice.mediaId,
        url: voice.url ?? "",
        name: voice.name,
        durationMs: voice.durationMs,
        captions: captions ? voice.captions : [],
        origin: voice.origin,
      },
      atMs,
      captions ?? NO_CAPTIONS_PLACEMENT
    )
    const still: Clip = {
      id: newId(),
      kind: "image",
      name: scene.still.name,
      mediaId: scene.still.mediaId,
      ...(scene.still.url ? { url: scene.still.url } : {}),
      startMs: atMs,
      durationMs: voice.durationMs + BRIEF_BREATH_MS,
      trimStartMs: 0,
      motion: sceneMotion(index),
      origin: scene.still.origin,
    }
    const audio: Clip = voice.url ? sound.audio : { ...sound.audio, url: undefined }
    const groups: [LaneKind, Clip[]][] = [
      ["words", sound.captions],
      ["pictures", [still]],
      ["voice", [audio]],
    ]

    for (const [kind, clips] of groups) {
      if (!clips.length) continue
      const laid = layOnLane(next, lanes, kind, clips, newId)
      next = laid.tracks
      lanes[kind] = laid.laneId
    }
    placed.push(scene.id)
    atMs += voice.durationMs + BRIEF_BREATH_MS
  }

  // The music goes under the whole video once the last scene is down, in
  // the same change, on a lane of its own at the bottom that ducks under the
  // voice, the way the Music tab's + lays a track.
  let music = brief.landing.music
  const everyScene = brief.scenes.every((scene) => scene.state === "placed" || placed.includes(scene.id))
  if (music && !music.laid && placed.length && everyScene) {
    const runs = Math.min(music.durationMs, atMs - brief.landing.startMs)
    if (runs > 0) {
      const lane: Track = {
        id: newId(),
        muted: false,
        duck: true,
        clips: [
          {
            id: newId(),
            kind: "audio",
            name: music.name,
            mediaId: music.mediaId,
            ...(music.url ? { url: music.url } : {}),
            startMs: brief.landing.startMs,
            durationMs: runs,
            trimStartMs: 0,
            sourceDurationMs: music.durationMs,
          },
        ],
      }
      next = [...next, lane]
      music = { ...music, laid: true, lane: lane.id }
    }
  }

  if (next.length > MAX_TIMELINE_TRACKS) return null
  return {
    tracks: next,
    placed,
    landing: { startMs: brief.landing.startMs, lanes, ...(music ? { music } : {}) },
  }
}

/** Any placement will do when no captions are laid; nothing reads it. */
const NO_CAPTIONS_PLACEMENT = {
  aspect: "9:16",
  look: DEFAULT_CAPTION_LOOK,
  safeBoxes: DEFAULT_SAFE_BOXES,
} satisfies CaptionPlacement

/**
 * A scene read again after its words changed, where it already sits on the
 * timeline (templates.md, part 35): the old reading and its captions come
 * off the brief's lanes, the new one goes on at the same start, the picture
 * grows or shrinks with it, and everything after it on the brief's three
 * lanes moves by the difference. Other lanes, the music included, stay.
 *
 * Null when the scene's clips are no longer where the brief left them.
 */
export function relayBriefScene(
  tracks: Tracks,
  landing: BriefLanding,
  change: {
    oldVoiceMediaId: string
    stillMediaId: string
    voice: NonNullable<SceneWithFiles["voice"]>
  },
  captions: CaptionPlacement | null
): Tracks | null {
  const laneIds = [landing.lanes.words, landing.lanes.pictures, landing.lanes.voice].filter(
    (id): id is string => !!id
  )
  const voiceLane = tracks.find((track) => track.id === landing.lanes.voice)
  const old = voiceLane?.clips.find((clip) => clip.kind === "audio" && clip.mediaId === change.oldVoiceMediaId)
  const pictureLane = tracks.find((track) => track.id === landing.lanes.pictures)
  const still = pictureLane?.clips.find(
    (clip) => clip.mediaId === change.stillMediaId && Math.abs(clip.startMs - (old?.startMs ?? -1)) < 1
  )
  if (!old || !still) return null

  const difference = change.voice.durationMs - old.durationMs
  const endedAt = old.startMs + old.durationMs
  const sound = voiceoverClips(
    {
      mediaId: change.voice.mediaId,
      url: change.voice.url ?? "",
      name: change.voice.name,
      durationMs: change.voice.durationMs,
      captions: captions ? change.voice.captions : [],
      origin: change.voice.origin,
    },
    old.startMs,
    captions ?? NO_CAPTIONS_PLACEMENT
  )
  const audio: Clip = change.voice.url ? sound.audio : { ...sound.audio, url: undefined }
  const shift = (clip: Clip): Clip =>
    clip.startMs >= endedAt - 1 ? { ...clip, startMs: Math.max(0, clip.startMs + difference) } : clip

  const next = tracks.map((track) => {
    if (!laneIds.includes(track.id)) return track
    let clips = track.clips
      .filter((clip) => clip.id !== old.id && !(clip.kind === "text" && clip.spokenBy === old.id))
      .map((clip) =>
        clip.id === still.id ? { ...clip, durationMs: Math.max(1, clip.durationMs + difference) } : shift(clip)
      )
    if (track.id === landing.lanes.voice) clips = [...clips, audio]
    if (track.id === landing.lanes.words) clips = [...clips, ...sound.captions]
    return { ...track, clips: sortedClips(clips) }
  })
  return next
}

type LaneKind = keyof BriefLanding["lanes"]

function sortedClips(clips: Clip[]) {
  return [...clips].sort((a, b) => a.startMs - b.startMs)
}

/**
 * Puts clips on the brief's lane of this kind when they fit there. The
 * first time, an empty lane the brief is not already using comes first.
 * Otherwise a new lane: the words above the brief's lane (or at the top),
 * the pictures under the words, the voice below (or at the bottom).
 *
 * A lane the brief names that is not on the timeline is made with that
 * name. The editor works out the lanes once to tell the server, then lays
 * the scenes from them, and the two come out the same.
 */
function layOnLane(
  tracks: Tracks,
  lanes: BriefLanding["lanes"],
  kind: LaneKind,
  clips: Clip[],
  newId: () => string
): { tracks: Tracks; laneId: string } {
  const current = lanes[kind]
  const index = current ? tracks.findIndex((track) => track.id === current) : -1
  if (index >= 0 && clipsFit(tracks[index], clips)) {
    const next = [...tracks]
    next[index] = { ...tracks[index], clips: sortedClips([...tracks[index].clips, ...clips]) }
    return { tracks: next, laneId: tracks[index].id }
  }
  if (!current) {
    const taken = new Set(Object.values(lanes))
    const emptyIndex = tracks.findIndex((track) => !track.clips.length && !taken.has(track.id))
    if (emptyIndex >= 0) {
      const next = [...tracks]
      next[emptyIndex] = { ...tracks[emptyIndex], clips: sortedClips(clips) }
      return { tracks: next, laneId: tracks[emptyIndex].id }
    }
  }
  const own: Track = {
    id: current && index < 0 ? current : newId(),
    muted: false,
    clips: sortedClips(clips),
  }
  const wordsIndex = lanes.words ? tracks.findIndex((track) => track.id === lanes.words) : -1
  const at =
    index >= 0
      ? kind === "words"
        ? index
        : index + 1
      : kind === "words"
        ? 0
        : kind === "pictures"
          ? wordsIndex + 1
          : tracks.length
  return { tracks: [...tracks.slice(0, at), own, ...tracks.slice(at)], laneId: own.id }
}

/** The scenes a brief can be made from: each with an id and its draft. */
export function newScene(draft: SceneDraft, id: string): StoredScene {
  return {
    id,
    words: draft.words.trim(),
    picture: draft.picture.trim(),
    // Whole seconds: the storyboard edits them as whole numbers.
    seconds: Math.min(SCENE_SECONDS_MAX, Math.max(1, Math.round(draft.seconds))),
    ...(draft.person ? { person: true } : {}),
    state: "draft",
  }
}
