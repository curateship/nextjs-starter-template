import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import { ACTOR_IMAGE_MODEL_IDS } from "@/lib/video/asset-factories"
import {
  PICTURE_EDIT_FAILED_MESSAGE,
  PICTURE_EDIT_NOT_FOUND_MESSAGE,
  PICTURE_EDIT_WORDS_MAX,
  PICTURE_EDIT_WORDS_MESSAGE,
} from "@/lib/video/picture-edits"
import { editorPost } from "@/server/video/editor-guards"
import { signedInActor } from "@/server/video/project-guests"
import {
  cleanUpOwnedPicture,
  type EditedPicture,
} from "@/server/video/picture-edits"

export type { EditedPicture }

/**
 * Taking a reflection or an object off a picture clip on the timeline
 * (picture-clean-up.md). It uses AI outside the Thumbnail section, so a guest
 * sent from Project is refused. The picture must be in the caller's own
 * library and the video their own.
 */

const KNOWN_MESSAGES = new Set([PICTURE_EDIT_NOT_FOUND_MESSAGE, PICTURE_EDIT_WORDS_MESSAGE])

export function getPictureEditErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message === PICTURE_EDIT_FAILED_MESSAGE) return `${message}. Try again.`
  return getAiToolErrorMessage(error)
}

const cleanUpFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      mediaId: z.string().min(1).max(36),
      kind: z.enum(["reflection", "object"]),
      words: z.string().max(PICTURE_EDIT_WORDS_MAX).optional(),
      model: z.enum(ACTOR_IMAGE_MODEL_IDS),
    })
  )
  .handler(({ data, context }) =>
    cleanUpOwnedPicture({ userId: signedInActor(context.caller).userId, ...data })
  )

export function cleanUpPicture(data: {
  videoId: string
  mediaId: string
  kind: "reflection" | "object"
  words?: string
  model: (typeof ACTOR_IMAGE_MODEL_IDS)[number]
}): Promise<EditedPicture> {
  return cleanUpFn({ data })
}
