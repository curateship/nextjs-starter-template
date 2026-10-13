import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { scriptBannedWordsSchema } from "@/lib/video/script-check"
import { adminGet, adminPost } from "@/server/guards"
import {
  getScriptBannedWords,
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
