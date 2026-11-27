import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { AI_KEY_MISSING_MESSAGES } from "@/lib/video/ai-providers"
import {
  AD_ABOUT_MAX,
  AD_FILE_KIND_MESSAGE,
  AD_FILE_NOT_FOUND_MESSAGE,
  AD_LOOK_NOT_FOUND_MESSAGE,
  AD_NOT_FOUND_MESSAGE,
  AD_LOOKS_FULL_MESSAGE,
  AD_SHELF_FULL_MESSAGE,
  AD_VOICE_NOT_YOURS_MESSAGE,
  TEXT_AD_MAX,
  adReadWords,
  adRulesSchema,
  type AdReadSeconds,
  textAdLookSchema,
  type AdRules,
  type TextAdLook,
} from "@/lib/video/ads"
import { SAFE_VOICE_ERRORS, rememberedVoiceSettings } from "@/lib/video/voice"
import { adminPost, userGet, userPost } from "@/server/guards"
import {
  addClipAd,
  addClipAdFromUrl,
  addTextAd,
  getAdRules,
  listAdLooks,
  listAds,
  makeSponsorRead,
  measureLoudness,
  projectViewerCurves,
  removeAdLook,
  removeShelfAd,
  saveAdLook,
  saveAdRules,
  writeTextAd,
  type AdLook,
  type ShelfAd,
} from "@/server/video/ads"
import { requireVideoBudget } from "@/server/video/project-spend"
import { getVoiceDefaults } from "@/server/video/settings"
import { listClonedVoices } from "@/server/video/cloned-voices"

/**
 * The Ads panel's calls (`workspace/docs/ads.md`). The shelf and the looks
 * are each person's own; the rules belong to the install, so anyone signed in
 * reads them and only an admin changes them on Settings.
 */

export type { AdLook, ShelfAd }

const KNOWN_MESSAGES = new Set([
  AD_NOT_FOUND_MESSAGE,
  AD_FILE_NOT_FOUND_MESSAGE,
  AD_FILE_KIND_MESSAGE,
  AD_LOOK_NOT_FOUND_MESSAGE,
  AD_SHELF_FULL_MESSAGE,
  AD_LOOKS_FULL_MESSAGE,
  AD_VOICE_NOT_YOURS_MESSAGE,
])

/** Only words written for people leave the server; anything else is the fallback. */
export function getAdsErrorMessage(error: unknown, fallback = "The ads could not be changed.") {
  const message = error instanceof Error ? error.message.trim() : ""
  if (
    KNOWN_MESSAGES.has(message) ||
    SAFE_VOICE_ERRORS.has(message) ||
    AI_KEY_MISSING_MESSAGES.has(message) ||
    isProjectSpendLimitMessage(message)
  ) {
    return message
  }
  return describeAuthError(message) ?? fallback
}

const idSchema = z.object({ id: z.string().min(1).max(36) })
const optionalVideoId = z.string().min(1).max(36).optional()

export type AdsShelf = { ads: ShelfAd[]; looks: AdLook[]; rules: AdRules }

const loadShelfFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<AdsShelf> => {
    const [ads, looks, rules] = await Promise.all([
      listAds(context.user.id),
      listAdLooks(context.user.id),
      getAdRules(),
    ])
    return { ads, looks, rules }
  })

export function loadAdsShelf() {
  return loadShelfFn()
}

const addClipFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ mediaId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => addClipAd(context.user.id, data.mediaId))

/** A sponsor clip from the media library onto the shelf. Returns its shelf id. */
export function addClipToShelf(mediaId: string) {
  return addClipFn({ data: { mediaId } })
}

const addFromLibraryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ url: z.string().min(1).max(2048) }))
  .handler(async ({ data, context }) => addClipAdFromUrl(context.user.id, data.url))

/** A file picked in the media library onto the shelf. Returns its shelf id. */
export function addLibraryFileToShelf(url: string) {
  return addFromLibraryFn({ data: { url } })
}

const addTextFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ text: z.string().trim().min(1).max(TEXT_AD_MAX), look: textAdLookSchema })
  )
  .handler(async ({ data, context }) => addTextAd(context.user.id, data))

export function addTextToShelf(text: string, look: TextAdLook) {
  return addTextFn({ data: { text, look } })
}

const removeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema)
  .handler(async ({ data, context }) => removeShelfAd(context.user.id, data.id))

export function removeFromShelf(id: string) {
  return removeFn({ data: { id } })
}

const saveLookFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(60), look: textAdLookSchema }))
  .handler(async ({ data, context }) => saveAdLook(context.user.id, data))

export function saveTextAdLook(name: string, look: TextAdLook) {
  return saveLookFn({ data: { name, look } })
}

const removeLookFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema)
  .handler(async ({ data, context }) => removeAdLook(context.user.id, data.id))

export function removeTextAdLook(id: string) {
  return removeLookFn({ data: { id } })
}

const loadRulesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () => getAdRules())

export function loadAdRules() {
  return loadRulesFn()
}

const saveRulesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(adRulesSchema)
  .handler(async ({ data }) => saveAdRules(data))

export function saveAdRulesSetting(rules: AdRules) {
  return saveRulesFn({ data: rules })
}

const loudnessFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ mediaIds: z.array(z.string().min(1).max(36)).min(1).max(10) }))
  .handler(async ({ data, context }) => measureLoudness(context.user.id, data.mediaIds))

/** How loud each file is in LUFS, null for one with no sound or not yours. */
export function loadLoudness(mediaIds: string[]) {
  return loudnessFn({ data: { mediaIds } })
}

const writeTextFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ about: z.string().trim().min(1).max(AD_ABOUT_MAX), videoId: optionalVideoId })
  )
  .handler(async ({ data, context }) =>
    writeTextAd({ userId: context.user.id, about: data.about, videoId: data.videoId })
  )

export function writeAdText(about: string, videoId?: string) {
  return writeTextFn({ data: { about, videoId } })
}

const readFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      about: z.string().trim().min(1).max(AD_ABOUT_MAX),
      seconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
      voiceId: z.string().min(1).max(64),
      videoId: optionalVideoId,
    })
  )
  .handler(async ({ data, context }) => {
    // Only a voice this person cloned: the read is in their own voice, and a
    // language copy says it again with that voice at ElevenLabs.
    const voice = (await listClonedVoices(context.user.id)).find(
      (one) => one.voiceId === data.voiceId
    )
    if (!voice) throw new Error(AD_VOICE_NOT_YOURS_MESSAGE)
    const remembered = await getVoiceDefaults()
    const modelId = remembered?.modelId ?? "eleven_multilingual_v2"
    // The voice is the one cost known up front: about six letters a word.
    if (data.videoId) {
      await requireVideoBudget(
        context.user.id,
        data.videoId,
        aiUnitCostCents(modelId, adReadWords(data.seconds) * 6)
      )
    }
    return makeSponsorRead({
      userId: context.user.id,
      about: data.about,
      seconds: data.seconds,
      voiceId: voice.voiceId,
      voiceName: voice.name,
      modelId,
      settings: rememberedVoiceSettings(remembered),
      videoId: data.videoId,
    })
  })

/** A sponsor read, written and said in the voice, onto the shelf. Returns its shelf id. */
export function makeAdRead(read: {
  about: string
  seconds: AdReadSeconds
  voiceId: string
  videoId?: string
}) {
  return readFn({ data: read })
}

const curvesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ videoId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => projectViewerCurves(context.user.id, data.videoId))

export function loadViewerCurves(videoId: string) {
  return curvesFn({ data: { videoId } })
}
