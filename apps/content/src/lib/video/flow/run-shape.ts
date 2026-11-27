import { z } from "zod"

import type { ThumbnailLayer } from "@/lib/video/thumbnails"

import { FLOW_BOXES_MAX } from "./node-kinds"

/**
 * What a run and its steps are, shared by the server and the steps page
 * (workspace/docs/flow.md, "How a run moves").
 */

/**
 * - `running`: a step is queued or being made.
 * - `waiting`: nothing can go on until the person does something.
 * - `done`: every step is done.
 * - `failed`: a step failed and waits for Try again.
 * - `stopped`: the person pressed Stop. Nothing more happens.
 */
export type FlowRunStatus = "running" | "waiting" | "done" | "failed" | "stopped"

/**
 * - `waiting`: a node feeding it is not done yet.
 * - `needs_input`: ready, waiting for its button and its boxes.
 * - `queued`: ready, for the worker to make.
 * - `working`: the worker is making it.
 * - `needs_ok`: made, and "Wait for my OK" is on.
 * - `done`, `failed`.
 */
export type FlowStepStatus = "waiting" | "needs_input" | "queued" | "working" | "needs_ok" | "done" | "failed"

export const FLOW_RUN_STATUS_LABELS: Record<FlowRunStatus, string> = {
  running: "Running",
  waiting: "Waiting on you",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
}

export const FLOW_STEP_STATUS_LABELS: Record<FlowStepStatus, string> = {
  waiting: "Waiting",
  needs_input: "Needs you",
  queued: "Up next",
  working: "Working",
  needs_ok: "Needs your OK",
  done: "Done",
  failed: "Failed",
}

/** The voice a step picked or read with. */
export type FlowVoice = { voiceId: string; voiceName: string; speaker: string }

/**
 * What a step made, handed to every node with a line from it.
 *
 * - `text`: words, from Paste text, AI text, or what is said in a linked video.
 * - `mediaIds`: files in Media (an upload, a pick, a download, a picture, a
 *   reading, a track).
 * - `videoId`: the run's video, once AI video laid it.
 * - `thumbnailIds`: thumbnails on the project's board.
 * - `actorId`, `voice`: from Pick an actor or voice.
 * - `summary`: one line for the steps page.
 */
export type FlowStepOutput = {
  text?: string
  mediaIds?: string[]
  videoId?: string
  thumbnailIds?: string[]
  /** An AI thumbnail's board, laid as it answered (thumbnail-answer.ts). */
  thumbnail?: { shape: "wide" | "tall"; layers: ThumbnailLayer[] }
  actorId?: string
  voice?: FlowVoice
  summary?: string
  /** AI clip: the picture it moved, handed on so a thumbnail after it can use the scene. */
  pictureId?: string
  /** AI clip: how long the clip is, and whether it ends on its start. */
  lengthMs?: number
  loops?: boolean
}

const idSchema = z.string().min(1).max(36)

export const FLOW_TEXT_INPUT_MAX = 100_000
const FLOW_LINK_MAX = 2000
const FLOW_MEDIA_PICK_MAX = 20

/** What the person puts in one of a step's boxes. The server checks each id is theirs. */
export const flowStepInputSchema = z
  .object({
    text: z.string().max(FLOW_TEXT_INPUT_MAX).optional(),
    link: z.string().trim().max(FLOW_LINK_MAX).optional(),
    mediaIds: z.array(idSchema).max(FLOW_MEDIA_PICK_MAX).optional(),
    actorId: idSchema.optional(),
    voiceId: z.string().min(1).max(120).optional(),
  })
  .strict()

export type FlowStepInput = z.infer<typeof flowStepInputSchema>

/** Every box of a step, by the box's id: no more than a node can ask for. */
export const flowStepInputsSchema = z
  .record(z.string().min(1).max(64), flowStepInputSchema)
  .refine((inputs) => Object.keys(inputs).length <= FLOW_BOXES_MAX, "A step has at most six boxes.")

/** What a step's boxes held when it was made; a picked voice is kept whole. */
export type FlowStepInputs = Record<string, FlowStepInput & { voice?: FlowVoice }>

/** A run still going: nothing done to it is final yet. */
export function flowRunIsLive(status: FlowRunStatus) {
  return status === "running" || status === "waiting" || status === "failed"
}

/** The run's state from its steps' states. Stopped is never worked out; it is set. */
export function flowRunStatusFrom(steps: readonly { status: FlowStepStatus }[]): Exclude<FlowRunStatus, "stopped"> {
  if (steps.length > 0 && steps.every((step) => step.status === "done")) return "done"
  if (steps.some((step) => step.status === "failed")) return "failed"
  if (steps.some((step) => step.status === "queued" || step.status === "working")) return "running"
  return "waiting"
}

/** One file a step makes over several of the worker's passes, such as a music track. */
export type FlowMadeFile = {
  status: "making" | "made" | "failed"
  mediaId?: string
  /** An AI video job's id, for a loop being made by the AI video worker. */
  shotId?: string
  durationMs?: number
  error?: string
}

/**
 * What a step remembers between the worker's passes (drizzle/0178): a step
 * that makes several paid things makes one a pass and writes each down here
 * as soon as it is paid for, so a pass cut short never pays for it twice.
 *
 * - `planned`: the AI editor has answered with its plan and price; with Wait
 *   for my OK on, the step waits on them before anything is paid for.
 * - `approved`: the person pressed OK on the plan (or there was nothing to
 *   wait for), so the step makes.
 * - `priced`: an AI clip, music or sound step has said what it will cost and
 *   waits for OK before paying (`PRICE_FIRST_KINDS`). `priceOk` is that OK.
 *   Unlike a plan's OK it doesn't count as the step's Wait for my OK, which
 *   still stops it once it is made, so the clip can be watched first.
 */
export type FlowStepState = {
  phase: "planned" | "priced" | "making"
  approved?: boolean
  priceOk?: boolean
  /** The step's own plan, as its executor reads it back. */
  plan?: unknown
  priceCents?: number
  /** Every file it makes, by the plan's name for it. */
  files?: Record<string, FlowMadeFile>
  /**
   * An AI picture or clip asked to change: what it made last and the words
   * typed in the right panel's box. A picture is made from the old picture
   * and the words; a clip from the same picture, its prompt and the words.
   */
  change?: { words: string; mediaId: string }
  /** AI clip: the moving picture being made, looked at again until it is ready. */
  shotId?: string
}
