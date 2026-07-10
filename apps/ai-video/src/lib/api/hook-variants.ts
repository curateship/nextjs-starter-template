import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  HookRewriteInput,
  HookRewriteResult,
} from "@/server/hook-variants"

export type { HookRewriteInput, HookRewriteResult }

const hookSafeErrorMessages = new Set([
  "API usage limit reached. Try again next month.",
  "Video analysis is not configured",
  "Hook rewrite returned invalid JSON",
  "Hook rewrite returned an unexpected shape",
])

export function getHookRewriteErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Hook rewrite failed."
  if (hookSafeErrorMessages.has(error.message)) return error.message
  // Gemini HTTP failures carry a status suffix — keep those visible too.
  if (error.message.startsWith("Hook rewrite failed")) {
    return error.message
  }
  return "Hook rewrite failed."
}

const rewriteHookLinesFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      hookText: z.string().min(1).max(500),
      contextLines: z.array(z.string().max(500)).max(10),
      audioDurationMs: z.number().nonnegative().finite().max(600_000),
      count: z.number().int().min(1).max(4),
      notes: z.string().max(500).optional(),
      avoid: z.array(z.string().max(300)).max(4).optional(),
    })
  )
  .handler(async ({ data }): Promise<HookRewriteResult> => {
    const { rewriteHookLinesForCurrentUser } = await import(
      "@/server/hook-variants"
    )
    return rewriteHookLinesForCurrentUser(data)
  })

export function rewriteHookLines(input: HookRewriteInput) {
  return rewriteHookLinesFn({
    data: {
      ...input,
      notes: input.notes || undefined,
      avoid: input.avoid?.length ? input.avoid : undefined,
    },
  })
}
