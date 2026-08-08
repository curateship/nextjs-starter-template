import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  findHook,
  HOOK_NO_TEXT_MESSAGE,
  HOOK_TEXT_MAX,
  spokenHookLine,
  type Hook,
} from "@/lib/video/hooks"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { pickWriter } from "@/lib/video/ai-choices"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { db } from "@/server/db"
import { generateJson, requireGeminiKey } from "@/server/video/gemini"
import { transcribeOpening } from "@/server/video/jump-cuts"
import { videoProjects } from "@/server/video/schema"
import { getAiDefaults } from "@/server/video/settings"
import { requireOpenAiKey } from "@/server/video/whisper"

/**
 * Three other ways to open.
 *
 * The words the video starts with are read off the timeline, sent to be
 * rewritten, and come back as three whole lines. Nothing is changed here —
 * picking one is the editor's job, and one press of undo puts the old line
 * back.
 */

const HOOK_LABEL = "Hook"

/** How much of the opening is listened to when looking for the spoken line. */
const HOOK_SPOKEN_WINDOW_MS = 12_000

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
  projectId,
}: {
  userId: string
  projectId: string
}): Promise<HookVariants> {
  const [project] = await db
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)

  const timeline = requireCanonicalTimeline(project.timeline)
  let hook = findHook(timeline.tracks)

  // Nothing written on screen, but something is being said: the opening line
  // is the spoken one. A raw piece to camera has no caption at the top, and
  // refusing to help with the very case the tool is for would be perverse.
  if (!hook?.text && hook?.spokenBy) {
    const said = spokenHookLine(
      await transcribeOpening({
        userId,
        projectId,
        clipId: hook.spokenBy.clipId,
        windowMs: HOOK_SPOKEN_WINDOW_MS,
      })
    )
    if (said) hook = { ...hook, clipIds: [], text: said.text }
  }
  if (!hook?.text) throw new Error(HOOK_NO_TEXT_MESSAGE)

  // Whichever AI has been chosen for rewriting does it.
  const writer = pickWriter(await getAiDefaults(), {
    words: !!(await getAiKey("gemini")),
    openai: !!(await getAiKey("openai")),
  })
  if (writer?.id === "openai") {
    return {
      hook,
      variants: await rewriteWithOpenAi({
        userId,
        projectId,
        model: writer.model,
        text: hook.text,
      }),
    }
  }

  const apiKey = await requireGeminiKey()
  const answer = await runAiCall(
    {
      userId,
      provider: "gemini",
      model: "gemini-2.5-flash",
      feature: "hook_variants",
      metadata: { projectId },
    },
    async () => {
      const result = await generateJson({
        apiKey,
        model: "gemini-2.5-flash",
        parts: [{ text: hookPrompt(hook.text) }],
        schema: variantsSchema,
        label: HOOK_LABEL,
      })
      return {
        result: result.value.variants,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      }
    }
  )

  const variants = tidy(answer, hook.text)
  return { hook, variants }
}

/** Whatever came back, as three usable lines. */
function tidy(lines: string[], original: string) {
  return lines
    .map((line) => line.trim().replace(/^["“]|["”]$/g, ""))
    .filter((line) => line && line !== original)
    .slice(0, 3)
}

/** The same question, asked of OpenAI. */
async function rewriteWithOpenAi({
  userId,
  projectId,
  model,
  text,
}: {
  userId: string
  projectId: string
  model: string
  text: string
}) {
  const apiKey = await requireOpenAiKey()
  const lines = await runAiCall(
    {
      userId,
      provider: "openai",
      model,
      feature: "hook_variants",
      metadata: { projectId },
    },
    async () => {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: hookPrompt(text) }],
        }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) {
        const body = await response.text().then(
          (detail) => detail.slice(0, 500),
          () => ""
        )
        console.error(`OpenAI ${HOOK_LABEL}`, response.status, body)
        throw new Error(`${HOOK_LABEL} failed (HTTP ${response.status})`)
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error(`${HOOK_LABEL} came back empty`)
      const parsed = variantsSchema.safeParse(JSON.parse(content))
      if (!parsed.success) {
        throw new Error(`${HOOK_LABEL} came back in an unexpected shape`)
      }
      return {
        result: parsed.data.variants,
        usage: {
          inputTokens: payload.usage?.prompt_tokens ?? 0,
          outputTokens: payload.usage?.completion_tokens ?? 0,
        },
      }
    }
  )
  return tidy(lines, text)
}
