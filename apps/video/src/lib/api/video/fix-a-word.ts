import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  FIX_WORD_FAILED_MESSAGE,
  FIX_WORD_NO_TEXT_MESSAGE,
  FIX_WORD_NOT_SOUND_MESSAGE,
  FIX_WORD_SAMPLE_TOO_SHORT_MESSAGE,
  FIX_WORD_TEXT_MAX,
} from "@/lib/video/fix-a-word"
import { editorPost } from "@/server/video/editor-guards"
import { sayWordsAgain } from "@/server/video/fix-a-word"
import { signedInActor } from "@/server/video/project-guests"

/**
 * Fix a word you said wrong (fix-a-word.md). It uses AI, so a guest sent from
 * Project is refused, as with every AI tool outside the Thumbnail section.
 */

const KNOWN_MESSAGES = new Set([
  FIX_WORD_FAILED_MESSAGE,
  FIX_WORD_NO_TEXT_MESSAGE,
  FIX_WORD_NOT_SOUND_MESSAGE,
  FIX_WORD_SAMPLE_TOO_SHORT_MESSAGE,
])

export function getFixWordErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return getAiToolErrorMessage(error)
}

const sayAgainFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
      text: z.string().max(FIX_WORD_TEXT_MAX),
    })
  )
  .handler(({ data, context }) =>
    sayWordsAgain({ userId: signedInActor(context.caller).userId, ...data })
  )

/** The new words, said in a copy of the clip's speaker, kept in the library. */
export function sayWordsInTheirVoice(videoId: string, clipId: string, text: string) {
  return sayAgainFn({ data: { videoId, clipId, text } })
}
