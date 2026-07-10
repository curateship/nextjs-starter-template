import { z } from "zod"

import { requireAppOrigin } from "@/server/origin"
import { requireUser } from "@/server/security"
import { ANALYSIS_MODEL, generateJson } from "@/server/video-analysis"
import { hookWordBudget } from "@/lib/hook-variants"

// Hook variants: rewrite just a video's opening hook line N ways. The editor's
// Hook dialog detects the hook client-side (lib/hook-variants.ts) and sends
// the live text here — no DB read, so unsaved edits are what gets rewritten.
// Voice generation and the timeline swap stay in their existing modules.

export type HookRewriteInput = {
  hookText: string
  // Later on-screen lines, for topical context (the dialog sends up to 10).
  contextLines: string[]
  // Length of the original hook voice clip — budgets the rewrite's word count
  // so the new line fits the same slot when spoken.
  audioDurationMs: number
  count: number
  notes?: string
  avoid?: string[]
}

export type HookRewriteResult = { lines: string[] }

const rewriteSchema = z.object({
  lines: z.array(z.string().trim().min(1).max(300)).min(1).max(4),
})

const HOOK_REWRITE_SHAPE_ERROR = "Hook rewrite returned an unexpected shape"

function rewritePrompt(input: HookRewriteInput) {
  const wordBudget = hookWordBudget(input.audioDurationMs)
  const parts = [
    `You are a short-form video scriptwriter. A finished reel opens with this spoken hook line:
"${input.hookText}"

Write ${input.count} alternative hook line(s) for the SAME video — same topic and payoff, different angle or framing. The rest of the video is unchanged, so each line must lead naturally into what follows.`,
  ]
  if (input.contextLines.length) {
    parts.push(
      `What the video says after the hook:\n${input.contextLines.map((line) => `- ${line}`).join("\n")}`
    )
  }
  if (input.notes) {
    parts.push(`Extra notes from the creator: ${input.notes}`)
  }
  if (input.avoid?.length) {
    parts.push(
      `Each new line must be clearly different from ALL of these:\n${input.avoid.map((line) => `- "${line}"`).join("\n")}`
    )
  }
  parts.push(`Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "lines": ["..."] }

Rules:
- Exactly ${input.count} line(s), each a distinct angle (question, bold claim, curiosity gap, pattern interrupt...).
- Spoken words only — no camera directions, no emojis, no hashtags.
- Max ${wordBudget} words per line so it fits the original hook's length when spoken.
- Write in the same energetic, scroll-stopping style as the original.`)
  return parts.join("\n\n")
}

export async function rewriteHookLinesForCurrentUser(
  input: HookRewriteInput
): Promise<HookRewriteResult> {
  requireAppOrigin()
  const user = await requireUser()

  const result = await generateJson(
    [{ text: rewritePrompt(input) }],
    rewriteSchema,
    "Hook rewrite",
    {
      userId: user.id,
      action: {
        provider: "gemini",
        feature: "script_generation",
        model: ANALYSIS_MODEL,
      },
    }
  )

  // Dedupe (the model occasionally repeats itself) and require the full count.
  const lines = Array.from(
    new Set(result.lines.map((line) => line.replace(/\s+/g, " ").trim()))
  ).filter(Boolean)
  if (lines.length < input.count) {
    throw new Error(HOOK_REWRITE_SHAPE_ERROR)
  }
  return { lines: lines.slice(0, input.count) }
}
