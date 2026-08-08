import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  SAFE_CAPTION_ERRORS,
  type CaptionsResult,
} from "@/lib/video/captions"
import {
  GEMINI_KEY_MISSING_MESSAGE,
  isShowableProviderProblem,
} from "@/lib/video/ai-providers"
import {
  SAFE_JUMP_CUT_ERRORS,
  type JumpCutMode,
  type JumpCutSensitivity,
} from "@/lib/video/jump-cuts"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { getAiKey } from "@/server/ai/keys"
import { userGet, userPost } from "@/server/guards"
import { writeProjectCaptions } from "@/server/video/captions"
import {
  analyseJumpCuts,
  transcribeClip,
  type ClipTranscript,
  type JumpCutAnalysis,
} from "@/server/video/jump-cuts"

/**
 * The AI tools in the studio.
 *
 * Everything here belongs to whoever is signed in: the project is looked up as
 * theirs, the files it names are looked up as theirs, and what it costs goes on
 * their own budget.
 */

export type { CaptionsResult }

/**
 * What went wrong, in words worth reading.
 *
 * Everything this app writes for itself is shown as it is. Anything else — a
 * library's own wording — is shown too when it is short and reads like a
 * sentence, because a bad reason beats no reason: it is the difference between
 * pressing the button again and giving up on it.
 */
export function getAiToolErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (SAFE_CAPTION_ERRORS.has(message)) return message
  if (SAFE_JUMP_CUT_ERRORS.has(message)) return message
  if (message === GEMINI_KEY_MISSING_MESSAGE) return message
  if (message === PROJECT_NOT_FOUND_MESSAGE) return message
  if (isShowableProviderProblem(message)) return message
  const authProblem = describeAuthError(message)
  if (authProblem) return authProblem
  return readableProblem(message)
    ? `That did not work — ${lowerFirst(message)}`
    : "That did not work. Try again in a moment."
}

/** A sentence somebody could act on, rather than a stack trace or a path. */
function readableProblem(message: string) {
  if (message.length < 4 || message.length > 140) return false
  if (message.includes("\n")) return false
  // Paths, urls and error codes tell a person nothing they can use.
  return !/[/\\]|https?:|^[A-Z_]+$|^[A-Z]{3,}\b/.test(message)
}

function lowerFirst(message: string) {
  return message[0].toLowerCase() + message.slice(1)
}

/**
 * Which kinds of AI work this app can actually do right now — whether a key
 * is saved, never anything about the key itself. The panel needs this to say
 * "add a key" instead of offering a button that always fails.
 */
export type AiToolsAvailability = {
  /** Transcribing, writing and rewriting: needs Gemini. */
  words: boolean
}

const aiToolsAvailabilityFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async (): Promise<AiToolsAvailability> => {
    return { words: !!(await getAiKey("gemini")) }
  })

export function loadAiToolsAvailability() {
  return aiToolsAvailabilityFn()
}

const writeCaptionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<CaptionsResult> => {
    return writeProjectCaptions(context.user.id, data.projectId)
  })

export function writeCaptions(projectId: string) {
  return writeCaptionsFn({ data: { projectId } })
}

const jumpCutsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
      mode: z.enum(["dead-air", "filler"]),
      sensitivity: z.enum(["gentle", "balanced", "tight"]),
      // Checked again on the server against the list of terms it knows.
      fillerTerms: z.array(z.string().max(40)).max(40).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<JumpCutAnalysis> => {
    return analyseJumpCuts({
      userId: context.user.id,
      projectId: data.projectId,
      clipId: data.clipId,
      mode: data.mode,
      sensitivity: data.sensitivity,
      fillerTerms: data.fillerTerms,
    })
  })

export function findJumpCuts(options: {
  projectId: string
  clipId: string
  mode: JumpCutMode
  sensitivity: JumpCutSensitivity
  fillerTerms?: string[]
}) {
  return jumpCutsFn({ data: options })
}

const transcriptFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
    })
  )
  .handler(async ({ data, context }): Promise<ClipTranscript> => {
    return transcribeClip({
      userId: context.user.id,
      projectId: data.projectId,
      clipId: data.clipId,
    })
  })

/**
 * Writing down what a clip says. A POST rather than a GET because it is real
 * work that costs money, not a page's worth of reading.
 */
export function loadClipTranscript(projectId: string, clipId: string) {
  return transcriptFn({ data: { projectId, clipId } })
}

export type { ClipTranscript, JumpCutAnalysis }
