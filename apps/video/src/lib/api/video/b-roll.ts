import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  BROLL_MAX_SENTENCES,
  BROLL_PHRASE_MAX_CHARACTERS,
  SAFE_BROLL_ERRORS,
  isPexelsFileUrl,
} from "@/lib/video/b-roll"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import type { BrollRow, BrollStatus, BrollSuggestion } from "@/server/video/b-roll"
import type { PexelsBatch } from "@/server/video/pexels"
import type { PexelsKeyStatus } from "@/server/video/settings"

export type { BrollRow, BrollStatus, BrollSuggestion, PexelsBatch, PexelsKeyStatus }

/**
 * B-roll from Pexels, and its key. The key is admin only, like the YouTube
 * key. Finding and placing B-roll is for anyone editing their own project.
 */

const describeKeyError = createErrorMessage(
  {
    EMPTY_KEY: "Paste a key first.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE: "The saved key can no longer be read. Paste it again.",
  },
  "That did not work. Try again in a moment."
)

/** The B-roll refusals as they are, everything else as the AI tools say it. */
export function getBrollErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (SAFE_BROLL_ERRORS.has(message)) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return getAiToolErrorMessage(error)
}

export function getPexelsKeyErrorMessage(error: unknown) {
  return describeKeyError(error)
}

const loadKeyFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => import("@/server/video/settings").then((m) => m.getPexelsKeyStatus()))

export function loadPexelsKeyStatus(): Promise<PexelsKeyStatus> {
  return loadKeyFn()
}

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.savePexelsApiKey(data.apiKey)
    return settings.getPexelsKeyStatus()
  })

export function savePexelsKey(apiKey: string): Promise<PexelsKeyStatus> {
  return saveKeyFn({ data: { apiKey } })
}

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    const settings = await import("@/server/video/settings")
    await settings.removePexelsApiKey()
    return settings.getPexelsKeyStatus()
  })

export function removePexelsKey(): Promise<PexelsKeyStatus> {
  return removeKeyFn()
}

/** Tests the typed key, or the saved one when nothing is typed. */
const testKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().max(200).optional() }))
  .handler(async ({ data }) => {
    const [settings, pexels] = await Promise.all([
      import("@/server/video/settings"),
      import("@/server/video/pexels"),
    ])
    const key = data.apiKey?.trim() || (await settings.getPexelsApiKey())
    if (!key) return { ok: false as const, message: "There is no key to test. Paste one first." }
    return pexels.testPexelsKey(key)
  })

export function testPexelsKey(apiKey?: string) {
  return testKeyFn({ data: { apiKey } })
}

const idSchema = z.string().min(1).max(36)
const rowIdSchema = z.string().min(1).max(12)
const phraseSchema = z.string().max(BROLL_PHRASE_MAX_CHARACTERS * 2)

const statusFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/b-roll").then((m) => m.brollStatus(context.user.id, data.projectId))
  )

export function loadBrollStatus(projectId: string): Promise<BrollStatus> {
  return statusFn({ data: { projectId } })
}

const suggestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/b-roll").then((m) => m.suggestBroll(context.user.id, data.projectId))
  )

export function suggestBroll(projectId: string): Promise<BrollSuggestion> {
  return suggestFn({ data: { projectId } })
}

const searchFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectId: idSchema,
      rows: z
        .array(z.object({ id: rowIdSchema, phrase: phraseSchema }))
        .min(1)
        .max(BROLL_MAX_SENTENCES),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/b-roll").then((m) => m.searchBroll(context.user.id, data))
  )

export function searchBroll(
  projectId: string,
  rows: { id: string; phrase: string }[]
): Promise<PexelsBatch> {
  return searchFn({ data: { projectId, rows } })
}

/** A pexels.com page, so the credit kept with a file links where it should. */
const pexelsPage = z
  .string()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === "https:" && /(^|\.)pexels\.com$/.test(url.hostname)
    } catch {
      return false
    }
  })

const pickSchema = z.object({
  startMs: z.number().finite().min(0),
  endMs: z.number().finite().min(0),
  phrase: phraseSchema.min(1),
  candidate: z.object({
    pexelsId: z.number().int().positive(),
    pageUrl: pexelsPage,
    photographer: z.string().max(200),
    photographerUrl: pexelsPage,
    // Checked again where it is fetched; the server only downloads from
    // Pexels' own video host.
    fileUrl: z.string().max(1000).refine(isPexelsFileUrl),
    durationMs: z.number().int().min(0).max(24 * 60 * 60_000),
  }),
})

const placeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectId: idSchema,
      picks: z
        .array(pickSchema)
        .min(1)
        .max(BROLL_MAX_SENTENCES)
        .refine((picks) => picks.every((pick) => pick.endMs > pick.startMs)),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/b-roll").then((m) => m.saveBrollPicks(context.user.id, data))
  )

export type BrollPickInput = z.input<typeof pickSchema>

export function saveBrollPicks(projectId: string, picks: BrollPickInput[]) {
  return placeFn({ data: { projectId, picks } })
}
