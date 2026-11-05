import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { z } from "zod"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import { TEASER_NO_VIDEO_MESSAGE } from "@/lib/video/teaser"
import { editorPost } from "@/server/video/editor-guards"
import { signedInActor } from "@/server/video/project-guests"
import { scoreTeaserMoments } from "@/server/video/teaser"

/** The teaser at the start (teaser.md). It uses AI, so a guest is refused. */

export function getTeaserErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message === TEASER_NO_VIDEO_MESSAGE) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return getAiToolErrorMessage(error)
}

const scoreFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ videoId: z.string().min(1).max(36) }))
  .handler(({ data, context }) =>
    scoreTeaserMoments({
      userId: signedInActor(context.caller).userId,
      videoId: data.videoId,
      // Cancel in the window drops the request, and the scoring stops there.
      signal: getRequest().signal,
    })
  )

export function scoreTeaser(videoId: string, signal?: AbortSignal) {
  return scoreFn({ data: { videoId }, signal })
}
