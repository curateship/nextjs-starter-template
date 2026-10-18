import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { WEIGHT_UNITS } from "@/lib/fitness/weights"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { previewImport, runImport } from "@/server/fitness/import"
import { copySharedProgram, loadSharedProgram } from "@/server/fitness/sharing"

export type { SharedProgram } from "@/server/fitness/sharing"
export type { ImportPreview } from "@/server/fitness/import"

const code = z.string().min(8).max(24)

/**
 * A shared program's public page. Open to anyone with the link, signed in or
 * not, and listed in `src/app/open-endpoints.ts`. It hands out only the
 * program's name, days, lifts, sets, reps and rest, never anything about the
 * owner.
 */
const sharedFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ code }))
  .handler(async ({ data }) => loadSharedProgram(data.code))

export function loadShared(shareCode: string) {
  return sharedFn({ data: { code: shareCode } })
}

const copyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ code }))
  .handler(async ({ data, context }) => copySharedProgram(context.user.id, data.code))

export function copyShared(shareCode: string) {
  return copyFn({ data: { code: shareCode } })
}

const importInput = z.object({
  text: z.string().min(1).max(5 * 1024 * 1024),
  unit: z.enum(WEIGHT_UNITS),
  programId: z.string().min(1).max(36),
})

const previewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(importInput)
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`fitness-import:${context.user.id}`, { maxAttempts: 30, windowSeconds: 60 * 60 })
    return previewImport(context.user.id, data)
  })

export function previewWorkoutImport(text: string, unit: (typeof WEIGHT_UNITS)[number], programId: string) {
  return previewFn({ data: { text, unit, programId } })
}

const runFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    importInput.extend({
      matches: z
        .array(z.object({ name: z.string().max(80), exerciseId: z.string().min(1).max(36).nullable() }))
        .max(500),
    })
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`fitness-import:${context.user.id}`, { maxAttempts: 30, windowSeconds: 60 * 60 })
    return runImport(context.user.id, data)
  })

export function runWorkoutImport(data: Parameters<typeof runFn>[0]["data"]) {
  return runFn({ data })
}
