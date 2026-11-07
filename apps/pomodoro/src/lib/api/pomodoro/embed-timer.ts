import { createServerFn } from "@tanstack/react-start"

import { loadAppSettings } from "@/server/pomodoro/app-settings"

/**
 * Whether `/embed/timer` shows the timer: the admin's switch in Settings →
 * Notion timer. Open to anyone, because the embed is read inside other sites'
 * pages with no sign-in. See `workspace/docs/embed-timer.md`.
 */
const readEmbedTimerFn = createServerFn({ method: "GET" }).handler(async () => ({
  enabled: (await loadAppSettings())["embed.notionTimer"],
}))

export const readEmbedTimer = () => readEmbedTimerFn()
