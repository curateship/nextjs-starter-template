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
import { findFacesUnderBlur, followUnderBlur } from "@/server/video/blur-follow"
import { signedInActor } from "@/server/video/project-guests"

/**
 * Blur that follows something (blur.md). Both calls use AI, so a guest sent
 * from Project is refused, the same as every AI tool outside the Thumbnail
 * section. The video is looked up as the caller's own before anything is
 * drawn or sent.
 */

const KNOWN_MESSAGES = new Set([BLUR_NOT_FOUND_MESSAGE, BLUR_NOTHING_UNDER_MESSAGE])

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

const findFacesFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object(ids))
  .handler(({ data, context }) =>
    findFacesUnderBlur({ userId: signedInActor(context.caller).userId, ...data })
  )

const followFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      ...ids,
      box: z.object({ left: share, top: share, width: share, height: share }),
    })
  )
  .handler(({ data, context }) =>
    followUnderBlur({ userId: signedInActor(context.caller).userId, ...data })
  )

export function findBlurFaces(videoId: string, clipId: string): Promise<ShareBox[]> {
  return findFacesFn({ data: { videoId, clipId } })
}

export function followBlur(
  videoId: string,
  clipId: string,
  box: ShareBox
): Promise<BlurTrackPoint[]> {
  return followFn({ data: { videoId, clipId, box } })
}
