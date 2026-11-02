import { z } from "zod"

import {
  findHook,
  HOOK_NO_TEXT_MESSAGE,
  HOOK_SPOKEN_WINDOW_MS,
  HOOK_TEXT_MAX,
  spokenHookLine,
  type Hook,
} from "@/lib/video/hooks"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { transcribeOpening } from "@/server/video/jump-cuts"
import { videoSpendMetadata } from "@/server/video/project-spend"
import { getOwnedVideo } from "@/server/video/project-videos"
import { askWriter } from "@/server/video/writer"

/**
 * Three other ways to open.
 *
 * The words the video starts with are read off the timeline, sent to be
 * rewritten, and come back as three whole lines. Nothing is changed here —
 * picking one is the editor's job, and one press of undo puts the old line
 * back.
 */

const HOOK_LABEL = "Hook"

const variantsSchema = z.object({
  variants: z.array(z.string().max(HOOK_TEXT_MAX)).max(6),
})

function hookPrompt(text: string) {
  return `Rewrite the opening line of a short social video so more people keep watching.

The line is: "${text}"

Answer with JSON only, in exactly this shape, and nothing else:
{ "variants": ["...", "...", "..."] }

Rules:
- Give exactly three rewrites, each a complete opening line on its own.
- Keep them about as long as the original, and never longer than ${HOOK_TEXT_MAX} characters.
- Keep the language, the meaning and any names or numbers in the original.
- Drop hesitations and filler — "um", "uh", "you know", "like" — even if the original is full of them. The line was written down from speech, so it may not read like writing.
- Make each one different from the others: one plainer, one more curious, one bolder.
- No hashtags, no emoji, no quotation marks around the line.`
}

export type HookVariants = {
  hook: Hook
  variants: string[]
}

export async function rewriteHook({
  userId,
  videoId,
}: {
  userId: string
  videoId: string
}): Promise<HookVariants> {
  const video = await getOwnedVideo(userId, videoId)
  const timeline = requireCanonicalTimeline(video.timeline)
  let hook = findHook(timeline.tracks)

  // Nothing written on screen, but something is being said: the opening line
  // is the spoken one. A raw piece to camera has no caption at the top, and
  // refusing to help with the very case the tool is for would be perverse.
  if (!hook?.text && hook?.spokenBy) {
    const said = spokenHookLine(
      await transcribeOpening({
        userId,
        videoId,
        clipId: hook.spokenBy.clipId,
        windowMs: HOOK_SPOKEN_WINDOW_MS,
      })
    )
    if (said) hook = { ...hook, clipIds: [], text: said.text }
  }
  if (!hook?.text) throw new Error(HOOK_NO_TEXT_MESSAGE)

  // Whichever AI has been chosen for rewriting does it.
  const answer = await askWriter({
    userId,
    feature: "hook_variants",
    metadata: videoSpendMetadata(video),
    prompt: hookPrompt(hook.text),
    schema: variantsSchema,
    label: HOOK_LABEL,
  })
  return { hook, variants: tidy(answer.variants, hook.text) }
}

/** Whatever came back, as three usable lines. */
function tidy(lines: string[], original: string) {
  return lines
    .map((line) => line.trim().replace(/^["“]|["”]$/g, ""))
    .filter((line) => line && line !== original)
    .slice(0, 3)
}
