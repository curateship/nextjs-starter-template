import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  BLUR_FOLLOW_FAILED_MESSAGE,
  BLUR_NOT_FOUND_MESSAGE,
  BLUR_NOTHING_UNDER_MESSAGE,
  type BlurTrackPoint,
  type ShareBox,
} from "@/lib/video/blur"
import { editorPost } from "@/server/video/editor-guards"
import {
  findFacesUnderBlur,
  findFacesUnderItem,
  followUnderBlur,
  followUnderItem,
} from "@/server/video/blur-follow"
import { FOLLOW_ITEM_NOT_FOUND_MESSAGE } from "@/lib/video/follow-track"
import { signedInActor } from "@/server/video/project-guests"

/**
 * Blur that follows something (blur.md). Both calls use AI, so a guest sent
 * from Project is refused, the same as every AI tool outside the Thumbnail
 * section. The video is looked up as the caller's own before anything is
 * drawn or sent.
 */

const KNOWN_MESSAGES = new Set([
  BLUR_NOT_FOUND_MESSAGE,
  BLUR_NOTHING_UNDER_MESSAGE,
  FOLLOW_ITEM_NOT_FOUND_MESSAGE,
])

export function getBlurFollowErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message.includes("came back")) return `${BLUR_FOLLOW_FAILED_MESSAGE}. Try again.`
  return getAiToolErrorMessage(error)
}

const ids = {
  videoId: z.string().min(1).max(36),
  clipId: z.string().min(1).max(64),
}

const share = z.number().min(0).max(1)

// `item` is Stick to a moving thing (stick-to-a-moving-thing.md): text, a
// shape, a sticker or a small video, in place of a blur.
const target = z.enum(["blur", "item"]).optional()

const findFacesFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ ...ids, target }))
  .handler(({ data: { target: which, ...data }, context }) => {
    const ask = { userId: signedInActor(context.caller).userId, ...data }
    return which === "item" ? findFacesUnderItem(ask) : findFacesUnderBlur(ask)
  })

const followFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      ...ids,
      target,
      box: z.object({ left: share, top: share, width: share, height: share }),
    })
  )
  .handler(({ data: { target: which, ...data }, context }) => {
    const ask = { userId: signedInActor(context.caller).userId, ...data }
    return which === "item" ? followUnderItem(ask) : followUnderBlur(ask)
  })

export function findBlurFaces(
  videoId: string,
  clipId: string,
  which: "blur" | "item" = "blur"
): Promise<ShareBox[]> {
  return findFacesFn({ data: { videoId, clipId, target: which } })
}

export function followBlur(
  videoId: string,
  clipId: string,
  box: ShareBox,
  which: "blur" | "item" = "blur"
): Promise<BlurTrackPoint[]> {
  return followFn({ data: { videoId, clipId, box, target: which } })
}
