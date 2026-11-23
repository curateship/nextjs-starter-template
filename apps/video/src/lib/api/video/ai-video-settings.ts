import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { SHOT_LENGTHS } from "@/lib/video/asset-factories"
import {
  KEYED_COMPANIES,
  VIDEO_COMPANIES,
  VIDEO_SIZES,
  type KeyedCompany,
  type VideoCompany,
  type VideoSize,
} from "@/lib/video/video-models"
import type { ShotLengthSeconds } from "@/lib/video/asset-factories"
import { adminGet, adminPost } from "@/server/guards"
import type { AiVideoSettings, VideoSpend } from "@/server/video/ai-video-settings"
import type { VideoKeyStatus } from "@/server/video/settings"

export type { AiVideoSettings, VideoKeyStatus, VideoSpend }

/**
 * Settings → AI video: the Wan and Seedance keys, which company new AI shots
 * start on, and each company's starting size, length and sound. Admin only,
 * like the Pexels and YouTube keys.
 */

const describeError = createErrorMessage(
  {
    EMPTY_KEY: "Paste a key first.",
    UNKNOWN_REGION: "Pick one of the regions on the list.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE: "The saved key can no longer be read. Paste it again.",
  },
  "That did not work. Try again in a moment."
)

export function getAiVideoSettingsErrorMessage(error: unknown) {
  return describeError(error)
}

const companySchema = z.enum(KEYED_COMPANIES)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() =>
    import("@/server/video/ai-video-settings").then((m) => m.loadAiVideoSettings())
  )

export function loadAiVideoSettings(): Promise<AiVideoSettings> {
  return loadFn()
}

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ company: companySchema, apiKey: z.string().min(1).max(300) }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.saveVideoKey(data.company, data.apiKey)
    return settings.getVideoKeyStatus(data.company)
  })

export function saveVideoKey(company: KeyedCompany, apiKey: string): Promise<VideoKeyStatus> {
  return saveKeyFn({ data: { company, apiKey } })
}

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ company: companySchema }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.removeVideoKey(data.company)
    return settings.getVideoKeyStatus(data.company)
  })

export function removeVideoKey(company: KeyedCompany): Promise<VideoKeyStatus> {
  return removeKeyFn({ data: { company } })
}

const saveRegionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ company: companySchema, region: z.string().min(1).max(20) }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.saveVideoRegion(data.company, data.region)
    return settings.getVideoKeyStatus(data.company)
  })

export function saveVideoRegion(company: KeyedCompany, region: string): Promise<VideoKeyStatus> {
  return saveRegionFn({ data: { company, region } })
}

/** Tests the typed key on the picked region, or the saved key when nothing is typed. */
const testKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      company: companySchema,
      apiKey: z.string().max(300).optional(),
    })
  )
  .handler(async ({ data }) => {
    const [settings, companies] = await Promise.all([
      import("@/server/video/settings"),
      import("@/server/video/video-companies"),
    ])
    const saved = await settings.getVideoKey(data.company)
    const status = await settings.getVideoKeyStatus(data.company)
    const apiKey = data.apiKey?.trim() || saved?.apiKey
    if (!apiKey) {
      return { ok: false as const, message: "There is no key to test. Paste one first." }
    }
    return companies.testCompanyKey(data.company, apiKey, status.region)
  })

export function testVideoKey(company: KeyedCompany, apiKey?: string) {
  return testKeyFn({ data: { company, apiKey } })
}

const startSchema = z
  .object({
    size: z.enum(VIDEO_SIZES),
    length: z.literal(SHOT_LENGTHS),
    sound: z.boolean(),
  })
  .strict()

const saveDefaultsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      company: z.enum(VIDEO_COMPANIES).optional(),
      starts: z
        .object({ wan: startSchema.optional(), seedance: startSchema.optional() })
        .strict()
        .optional(),
    })
  )
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.saveVideoModelDefaults(data)
  })

export type VideoStart = { size: VideoSize; length: ShotLengthSeconds; sound: boolean }

export function saveVideoModelDefaults(change: {
  company?: VideoCompany
  starts?: Partial<Record<KeyedCompany, VideoStart>>
}): Promise<void> {
  return saveDefaultsFn({ data: change })
}
