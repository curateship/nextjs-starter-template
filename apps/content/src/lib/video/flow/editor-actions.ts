import { z } from "zod"

import { aiMusicCostCents, aiMusicLengthMs, AI_MUSIC_MOOD_MAX } from "@/lib/video/ai-music"
import { aiSoundCostCents, AI_SOUND_WORDS_MAX } from "@/lib/video/ai-sound-effects"
import { shotCostCents } from "@/lib/video/asset-factories"
import { layAudioRepeats } from "@/lib/video/background-music"
import { findStockSound, STOCK_SOUND_IDS } from "@/lib/video/stock-sounds"
import { TEXT_FONT_IDS, type TextFontId } from "@/lib/video/text-fonts"
import { DEFAULT_TIMER_COLOR, DEFAULT_TIMER_FONT, DEFAULT_TIMER_LINE_WIDTH, TIMER_LABEL_MAX } from "@/lib/video/timer"
import { ASPECT_RATIOS, MAX_TIMELINE_TRACKS, MAX_TRACK_CLIPS, type AspectRatio, type ProjectTimeline } from "@/lib/video/timeline-schema"
import { sizeFor, VIDEO_MODELS } from "@/lib/video/video-models"

import { editPlanSchema } from "./edit-plan"

/**
 * The AI editor's answer (flow.md, "AI editor"): what the AI says to do with
 * the editor's own tools, worked out from its prompt and nothing else (Tyler,
 * 14 Nov 2026: "The parameters, data or instructions should just be a prompt
 * Ai can use on existing video editors tools").
 *
 * The answer keeps AI video's old shape at the top, a title, captions and
 * stretches of footage (`segments`, edit-plan.ts), so a flow written for it
 * still works, and adds `actions`, each one an editor tool:
 *
 * - **Making** (paid, made by the worker one a pass): `animate_picture` (a
 *   picture into a moving shot, a loop when it ends on its start, as Make it
 *   move), `make_music` (AI music), `make_sound` (an AI sound, looping or
 *   not).
 * - **Placing** (free): `place` a picture, video or sound for a stretch,
 *   `text`, `timer`, `starter_sound` (a starter sound effect), `marker`.
 * - **Structure:** `repeat` its actions so many times, so far apart, with
 *   `{n}` in any words standing for the time round (1, 2, …) and `{n%K}`
 *   cycling 1 to K, so rounds and sets are never worked out by hand.
 *
 * Everything here is plain: the server makes the files and writes the
 * timeline (`src/server/video/flow/executors.ts`).
 */

/** The longest video an answer may lay: four hours. */
export const EDITOR_MAX_SECONDS = 4 * 3600
/** The most actions once every repeat is laid out. */
export const EDITOR_MAX_ACTIONS = 2000
/** The most paid things one answer may make. */
export const EDITOR_MAX_MAKING = 40

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_{}%]{0,23}$/, "an id is a letter then letters, digits or _")
const seconds = z.number().finite().min(0).max(EDITOR_MAX_SECONDS)
const share = z.number().min(0).max(1)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const fade = z.number().min(0.2).max(5)

const animateAction = z.object({
  do: z.literal("animate_picture"),
  id,
  file: z.string().min(1).max(24),
  prompt: z.string().trim().min(1).max(1000),
  seconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
  end_on_start: z.boolean().default(true),
  model: z.enum(["seedance", "wan"]).default("seedance"),
  quality: z.enum(["480p", "720p", "1080p"]).default("1080p"),
  sound: z.boolean().default(false),
})
const musicAction = z.object({
  do: z.literal("make_music"),
  id,
  mood: z.string().trim().min(1).max(AI_MUSIC_MOOD_MAX),
  seconds: z.number().min(3).max(300),
})
const soundAction = z.object({
  do: z.literal("make_sound"),
  id,
  words: z.string().trim().min(1).max(AI_SOUND_WORDS_MAX),
  seconds: z.number().min(0.5).max(30),
  loop: z.boolean().default(false),
})
const placeAction = z.object({
  do: z.literal("place"),
  file: z.string().min(1).max(24),
  from: seconds,
  to: seconds,
  role: z.enum(["background", "overlay", "music", "ambience", "effects"]),
  loop: z.boolean().default(false),
  crossfade: fade.optional(),
  volume: z.number().min(0).max(1).optional(),
  fade_in: fade.optional(),
  fade_out: fade.optional(),
  fit: z.enum(["fill", "fit"]).optional(),
})
const textAction = z.object({
  do: z.literal("text"),
  text: z.string().trim().min(1).max(200),
  from: seconds,
  to: seconds,
  font: z.enum(TEXT_FONT_IDS).optional(),
  size: z.number().min(20).max(220).optional(),
  color: color.optional(),
  x: share.optional(),
  y: share.optional(),
})
const timerAction = z.object({
  do: z.literal("timer"),
  from: seconds,
  to: seconds,
  above: z.string().max(TIMER_LABEL_MAX).optional(),
  below: z.string().max(TIMER_LABEL_MAX).optional(),
  ring: z.boolean().default(true),
  ring_width: z.number().min(2).max(40).optional(),
  size: z.number().min(0.1).max(1).default(0.34),
  x: share.default(0.5),
  y: share.default(0.5),
  font: z.enum(TEXT_FONT_IDS).optional(),
  color: color.optional(),
  count_up: z.boolean().default(false),
})
const starterSoundAction = z.object({
  do: z.literal("starter_sound"),
  sound: z.enum(STOCK_SOUND_IDS),
  at: seconds,
  volume: z.number().min(0).max(1).optional(),
})
const markerAction = z.object({ do: z.literal("marker"), at: seconds, label: z.string().max(80) })

const plainAction = z.discriminatedUnion("do", [
  animateAction,
  musicAction,
  soundAction,
  placeAction,
  textAction,
  timerAction,
  starterSoundAction,
  markerAction,
])

const repeatAction = z.object({
  do: z.literal("repeat"),
  times: z.number().int().min(1).max(100),
  every: z.number().min(0.1).max(EDITOR_MAX_SECONDS),
  start: seconds.default(0),
  actions: z.array(plainAction).min(1).max(100),
})

export const editorAnswerSchema = editPlanSchema
  .partial({ captions: true, segments: true })
  .extend({
    frame: z.enum(ASPECT_RATIOS).optional(),
    actions: z.array(z.union([repeatAction, plainAction])).max(500).default([]),
  })

export type EditorAnswer = z.infer<typeof editorAnswerSchema>
export type EditorAction = z.infer<typeof plainAction>
export type MakingAction = z.infer<typeof animateAction> | z.infer<typeof musicAction> | z.infer<typeof soundAction>

export const EDITOR_ANSWER = `Reply with JSON only, in this shape:
{"title": "short name", "frame": "16:9", "captions": false, "segments": [], "actions": [ ... ]}
"segments" are stretches of the footage files (F1, F2…) in seconds, in the order they play, as {"file": "F1", "start": 12.4, "end": 18.9}; leave it empty when there is no footage to cut. "actions" use the video editor's tools, times in seconds of the finished video:
- {"do": "animate_picture", "id": "L1", "file": "P1", "prompt": "what moves", "seconds": 8, "end_on_start": true, "model": "seedance", "quality": "1080p", "sound": false} makes a picture move; with end_on_start it loops with no join.
- {"do": "make_music", "id": "M1", "mood": "the music", "seconds": 300} makes instrumental music, up to 300 seconds.
- {"do": "make_sound", "id": "R1", "words": "the sound", "seconds": 30, "loop": true} makes a sound, up to 30 seconds.
- {"do": "place", "file": "L1", "from": 0, "to": 1800, "role": "background", "loop": true, "crossfade": 3, "volume": 0.6, "fade_in": 2, "fade_out": 2, "fit": "fill"} puts a file (made, or connected: P1 pictures, C1 moving clips, F1 footage, S1 sounds) on the video. A connected moving clip is finished: place it, never animate it again. role is background, overlay, music, ambience or effects. loop repeats a file that is shorter than its stretch; crossfade (sound only) instead blends each repeat into the next.
- {"do": "text", "text": "words", "from": 0, "to": 10, "font": "fredoka", "size": 80, "color": "#ffffff", "x": 0.5, "y": 0.1}
- {"do": "timer", "from": 0, "to": 1500, "above": "FOCUS", "below": "Round 1/6", "ring": true, "ring_width": 6, "size": 0.34, "x": 0.5, "y": 0.5, "font": "fredoka", "color": "#ffffff", "count_up": false} counts down over its own length, with a ring that empties.
- {"do": "starter_sound", "sound": "chime", "at": 1500, "volume": 0.8} plays a built-in sound (chime, ding, whoosh, pop, click…).
- {"do": "repeat", "times": 6, "every": 1800, "start": 0, "actions": [ ... ]} repeats its actions, each time later by "every"; in its words and ids "{n}" is 1, 2, 3… and "{n%3}" cycles 1, 2, 3.
Fonts: ${TEXT_FONT_IDS.join(", ")}. Only use what the prompt asks for.`

/** `{n}` and `{n%K}` in a repeat's words and ids, for the `n`th time round. */
function fillRound(value: string, round: number) {
  return value
    .replace(/\{n%(\d+)\}/g, (_, every: string) => String(((round - 1) % Math.max(1, Number(every))) + 1))
    .replace(/\{n\}/g, String(round))
}

function shifted(action: EditorAction, by: number, round: number): EditorAction {
  const words = (value: string | undefined) => (value === undefined ? undefined : fillRound(value, round))
  const moved = { ...action } as Record<string, unknown>
  for (const key of ["from", "to", "at"] as const) {
    if (typeof moved[key] === "number") moved[key] = (moved[key] as number) + by
  }
  for (const key of ["id", "file", "prompt", "mood", "words", "text", "above", "below", "label"] as const) {
    if (typeof moved[key] === "string") moved[key] = words(moved[key] as string)
  }
  return moved as EditorAction
}

/** Every action with its repeats laid out, in order, each repeat's times moved along. */
export function expandActions(answer: Pick<EditorAnswer, "actions">): EditorAction[] {
  const out: EditorAction[] = []
  for (const action of answer.actions) {
    if (action.do !== "repeat") {
      out.push(action)
      continue
    }
    for (let round = 1; round <= action.times; round += 1) {
      const by = action.start + (round - 1) * action.every
      for (const inner of action.actions) out.push(shifted(inner, by, round))
    }
  }
  return out
}

/** The paid things an answer makes, in order. */
export function makingActions(actions: readonly EditorAction[]): MakingAction[] {
  return actions.filter(
    (action): action is MakingAction =>
      action.do === "animate_picture" || action.do === "make_music" || action.do === "make_sound"
  )
}

export type EditorFiles = {
  pictures: string[]
  footage: string[]
  sounds: string[]
  /** Moving clips from AI clip steps, placed as they are. */
  clips: string[]
}

/**
 * Why the answer can't be laid, each as a sentence, or none. Asked of the
 * AI's answer before anything is paid for; the AI is asked once more with
 * them.
 */
export function editorProblems(answer: EditorAnswer, files: EditorFiles): string[] {
  const problems: string[] = []
  const actions = expandActions(answer)
  if (actions.length > EDITOR_MAX_ACTIONS) problems.push(`There are ${actions.length} actions once repeated; the most is ${EDITOR_MAX_ACTIONS}.`)
  const making = makingActions(actions)
  if (making.length > EDITOR_MAX_MAKING) problems.push(`It makes ${making.length} things; the most is ${EDITOR_MAX_MAKING}.`)
  const made = new Set<string>()
  for (const action of making) {
    if (made.has(action.id)) problems.push(`The id ${action.id} is used twice.`)
    made.add(action.id)
    if (action.do === "animate_picture" && !files.pictures.includes(action.file)) {
      problems.push(`animate_picture ${action.id} names ${action.file}, which isn't a connected picture (${files.pictures.join(", ") || "none"}).`)
    }
  }
  const known = new Set([...made, ...files.pictures, ...files.footage, ...files.sounds, ...files.clips])
  for (const action of actions) {
    if ("from" in action && "to" in action && action.to <= action.from) {
      problems.push(`An action runs from ${action.from} to ${action.to}; "to" must be after "from".`)
    }
    if ("to" in action && action.to > EDITOR_MAX_SECONDS) problems.push(`An action ends at ${action.to} s, past four hours.`)
    if (action.do === "place" && !known.has(action.file)) {
      problems.push(`place names ${action.file}, which is neither made above nor connected.`)
    }
  }
  return [...new Set(problems)]
}

/** About what the answer's paid things cost, in cents, each and together. */
export function editorPrice(actions: readonly EditorAction[]) {
  const each = makingActions(actions).map((action) => {
    if (action.do === "make_music") return { id: action.id, cents: aiMusicCostCents(aiMusicLengthMs(action.seconds * 1000)) }
    if (action.do === "make_sound") return { id: action.id, cents: aiSoundCostCents(action.seconds) }
    const model = VIDEO_MODELS[action.model]
    return { id: action.id, cents: shotCostCents(action.seconds, model.id, sizeFor(action.model, action.quality), action.sound) }
  })
  return { each, cents: each.reduce((sum, item) => sum + item.cents, 0) }
}

function clock(totalSeconds: number) {
  const whole = Math.round(totalSeconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  const two = (value: number) => String(value).padStart(2, "0")
  return hours ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`
}

/** How long the answer's video runs, in seconds. */
export function editorLengthSeconds(actions: readonly EditorAction[]) {
  return actions.reduce((most, action) => Math.max(most, "to" in action ? action.to : "at" in action ? action.at : 0), 0)
}

/**
 * The plan in plain words, for the step's OK: what it makes with each price,
 * and what it lays, counted.
 */
export function describeEditorPlan(answer: EditorAnswer) {
  const actions = expandActions(answer)
  const price = editorPrice(actions)
  const centsOf = new Map(price.each.map((item) => [item.id, item.cents]))
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const lines: string[] = []
  const length = editorLengthSeconds(actions)
  lines.push(`${answer.title ? `${answer.title}: ` : ""}${clock(length)} long, ${answer.frame ?? "the run's"} frame.`)
  const making = makingActions(actions)
  if (making.length) {
    lines.push("", "Makes:")
    for (const action of making) {
      const what =
        action.do === "animate_picture"
          ? `${action.id}: ${action.file} moving, ${action.seconds} s${action.end_on_start ? ", looping" : ""}, ${action.model} ${action.quality}, "${action.prompt}"`
          : action.do === "make_music"
            ? `${action.id}: ${clock(action.seconds)} of music, "${action.mood}"`
            : `${action.id}: ${action.seconds} s sound${action.loop ? ", looping" : ""}, "${action.words}"`
      lines.push(`- ${what} (${money(centsOf.get(action.id) ?? 0)})`)
    }
  }
  const count = (kind: EditorAction["do"]) => actions.filter((action) => action.do === kind).length
  const laid = [
    [count("place"), "file placed", "files placed"],
    [count("timer"), "timer", "timers"],
    [count("text"), "text", "texts"],
    [count("starter_sound"), "starter sound", "starter sounds"],
    [answer.segments?.length ?? 0, "stretch of footage", "stretches of footage"],
  ] as const
  const laidWords = laid.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
  if (laidWords.length) lines.push("", `Lays: ${laidWords.join(", ")}.`)
  lines.push("", `About ${money(price.cents)} in all.`)
  return { text: lines.join("\n"), cents: price.cents, lengthSeconds: length }
}

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]

/** A file the timeline can use: connected, or made by the answer. */
export type EditorFile = {
  mediaId: string
  name: string
  url?: string
  kind: "image" | "video" | "audio"
  /** A video or sound's length; a picture has none. */
  durationMs?: number
}

const ROLE_ORDER = ["words", "overlay", "background", "music", "ambience", "effects"] as const
type Role = (typeof ROLE_ORDER)[number]

/**
 * The answer's actions laid as lanes, top first: words and timers, overlays,
 * the background, music, ambience, effects. Clips of one role share a lane
 * unless they overlap, when they go onto another. No lane ducks, so rain
 * never pulls the music down (render.ts counts a sounding lane without
 * ducking as voice).
 */
export function actionsToTracks(
  actions: readonly EditorAction[],
  files: ReadonlyMap<string, EditorFile>,
  options: { aspect: AspectRatio; newId: () => string }
): { tracks: Track[]; usedMediaIds: string[] } {
  const lanes = new Map<Role, Clip[][]>(ROLE_ORDER.map((role) => [role, []]))
  const used = new Set<string>()
  const put = (role: Role, clip: Clip) => {
    const roleLanes = lanes.get(role)!
    const free = roleLanes.find(
      (lane) => lane.length < MAX_TRACK_CLIPS && lane.every((other) => other.startMs + other.durationMs <= clip.startMs || clip.startMs + clip.durationMs <= other.startMs)
    )
    if (free) free.push(clip)
    else roleLanes.push([clip])
  }
  const [across, down] = options.aspect.split(":").map(Number)
  const ratio = across / down

  for (const action of actions) {
    if (action.do === "place") {
      const file = files.get(action.file)
      if (!file) continue
      used.add(file.mediaId)
      const fromMs = Math.round(action.from * 1000)
      const toMs = Math.round(action.to * 1000)
      const base = {
        name: file.name,
        mediaId: file.mediaId,
        ...(file.url ? { url: file.url } : {}),
        trimStartMs: 0,
      }
      if (file.kind === "image") {
        put(action.role === "overlay" ? "overlay" : "background", {
          ...base,
          id: options.newId(),
          kind: "image",
          startMs: fromMs,
          durationMs: toMs - fromMs,
          ...(action.fit === "fit" ? {} : { fit: "cover" as const }),
        })
        continue
      }
      const lengthMs = file.durationMs && file.durationMs > 0 ? file.durationMs : toMs - fromMs
      const fades = {
        ...(action.fade_in ? { fadeInMs: action.fade_in * 1000 } : {}),
        ...(action.fade_out ? { fadeOutMs: action.fade_out * 1000 } : {}),
      }
      if (file.kind === "audio" && action.crossfade && lengthMs < toMs - fromMs) {
        const [first, second] = layAudioRepeats(
          { mediaId: file.mediaId, name: file.name, url: file.url ?? "", sourceDurationMs: lengthMs },
          { fromMs, toMs, crossfadeMs: action.crossfade * 1000, volume: action.volume ?? 1 }
        )
        const role: Role = action.role === "ambience" ? "ambience" : action.role === "effects" ? "effects" : "music"
        // A blend's two lanes stay its own two lanes, side by side in the role.
        const own = (clip: Clip, index: number): Clip => {
          const { url, ...rest } = clip
          return {
            ...rest,
            ...(url ? { url } : {}),
            id: options.newId(),
            ...(index === 0 && clip.startMs === fromMs && action.fade_in ? { fadeInMs: action.fade_in * 1000 } : {}),
          }
        }
        lanes.get(role)!.push(first.map(own))
        if (second.length) lanes.get(role)!.push(second.map((clip) => own(clip, 1)))
        continue
      }
      const loops = action.loop && lengthMs < toMs - fromMs
      const role: Role =
        file.kind === "video"
          ? action.role === "overlay"
            ? "overlay"
            : "background"
          : action.role === "ambience"
            ? "ambience"
            : action.role === "effects"
              ? "effects"
              : "music"
      put(role, {
        ...base,
        id: options.newId(),
        kind: file.kind,
        startMs: fromMs,
        durationMs: loops ? toMs - fromMs : Math.min(toMs - fromMs, lengthMs),
        sourceDurationMs: lengthMs,
        ...(loops ? { loop: true } : {}),
        ...(file.kind === "video" ? { muted: true, ...(action.fit === "fit" ? {} : { fit: "cover" as const }) } : {}),
        ...(action.volume !== undefined ? { volume: action.volume } : {}),
        ...fades,
      })
      continue
    }
    if (action.do === "text") {
      put("words", {
        id: options.newId(),
        kind: "text",
        name: action.text.slice(0, 60),
        text: action.text,
        fontId: (action.font ?? "inter") as TextFontId,
        fontSize: action.size ?? 78,
        color: action.color ?? "#ffffff",
        x: action.x ?? 0.5,
        y: action.y ?? 0.5,
        startMs: Math.round(action.from * 1000),
        durationMs: Math.round((action.to - action.from) * 1000),
        trimStartMs: 0,
      })
      continue
    }
    if (action.do === "timer") {
      const half = action.size / 2
      const halfAcross = half / ratio
      put("words", {
        id: options.newId(),
        kind: "shape",
        shape: "timer",
        name: action.above ? `Timer, ${action.above}` : "Timer",
        x: Math.max(0, action.x - halfAcross),
        y: Math.max(0, action.y - half),
        toX: Math.min(1, action.x + halfAcross),
        toY: Math.min(1, action.y + half),
        color: action.color ?? DEFAULT_TIMER_COLOR,
        fontId: action.font ?? DEFAULT_TIMER_FONT,
        lineWidth: action.ring_width ?? DEFAULT_TIMER_LINE_WIDTH,
        ...(action.above ? { timerAbove: action.above } : {}),
        ...(action.below ? { timerBelow: action.below } : {}),
        ...(action.ring ? {} : { timerRing: false }),
        ...(action.count_up ? { timerUp: true } : {}),
        startMs: Math.round(action.from * 1000),
        durationMs: Math.round((action.to - action.from) * 1000),
        trimStartMs: 0,
      })
      continue
    }
    if (action.do === "starter_sound") {
      const sound = findStockSound(action.sound)
      if (!sound) continue
      put("effects", {
        id: options.newId(),
        kind: "audio",
        name: sound.label,
        stockSound: sound.id,
        startMs: Math.round(action.at * 1000),
        durationMs: sound.durationMs,
        sourceDurationMs: sound.durationMs,
        trimStartMs: 0,
        ...(action.volume !== undefined ? { volume: action.volume } : {}),
      })
    }
  }

  const tracks: Track[] = []
  for (const role of ROLE_ORDER) {
    for (const clips of lanes.get(role)!) {
      if (!clips.length) continue
      tracks.push({ id: options.newId(), muted: false, clips: clips.sort((a, b) => a.startMs - b.startMs) })
    }
  }
  if (tracks.length > MAX_TIMELINE_TRACKS) throw new Error(`The plan needs ${tracks.length} lanes; a video holds ${MAX_TIMELINE_TRACKS}.`)
  return { tracks, usedMediaIds: [...used] }
}
