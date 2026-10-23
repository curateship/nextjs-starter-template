import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  captionLookSchema,
  type CaptionLook,
} from "@/lib/video/caption-look"
import { safeBoxesSchema, type SafeBoxes } from "@/lib/video/safe-box"
import { scriptBannedWordsSchema } from "@/lib/video/script-check"
import { adminGet, adminPost, userGet } from "@/server/guards"
import {
  getCaptionSettings,
  getScriptBannedWords,
  saveCaptionLook as saveCaptionLookRow,
  saveSafeBoxes as saveSafeBoxesRow,
  saveScriptBannedWords,
} from "@/server/video/settings"

// The script check's banned words. Changing them changes the check for
// everybody in the install, so reading and saving are both on Settings, which
// is for admins.
const getScriptBannedWordsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => getScriptBannedWords())

const saveScriptBannedWordsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ words: scriptBannedWordsSchema }))
  .handler(async ({ data }) => saveScriptBannedWords(data.words))

export function loadScriptBannedWords() {
  return getScriptBannedWordsFn()
}

export function saveBannedWords(words: string[]) {
  return saveScriptBannedWordsFn({ data: { words } })
}

// The caption look and the safe boxes. Every caption window in the editor
// starts from them, so anyone signed in may read them; changing them changes
// captions for everybody, so saving is for admins, on Settings.
const getCaptionSettingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () => getCaptionSettings())

const saveCaptionLookFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ look: captionLookSchema }))
  .handler(async ({ data }) => saveCaptionLookRow(data.look))

const saveSafeBoxesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ safeBoxes: safeBoxesSchema }))
  .handler(async ({ data }) => saveSafeBoxesRow(data.safeBoxes))

export function loadCaptionSettings() {
  return getCaptionSettingsFn()
}

export function saveCaptionLook(look: CaptionLook) {
  return saveCaptionLookFn({ data: { look } })
}

export function saveSafeBoxes(safeBoxes: SafeBoxes) {
  return saveSafeBoxesFn({ data: { safeBoxes } })
}
