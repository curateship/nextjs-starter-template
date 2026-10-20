import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { getAboutYou, saveAboutYou } from "@/server/note/settings"
import { ABOUT_YOU_MAX } from "@/lib/note/library/notes"

// The one line every imported note's plan is written for. It changes the plans for
// everybody on the site, so reading and saving are both on Settings, which is
// for admins.
const getFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<string> => getAboutYou())

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ aboutYou: z.string().max(ABOUT_YOU_MAX * 2) }))
  .handler(async ({ data }): Promise<string> => saveAboutYou(data.aboutYou))

export function loadAboutYou() {
  return getFn()
}

export function saveAboutYouLine(aboutYou: string) {
  return saveFn({ data: { aboutYou } })
}
