import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import { loadAppSettings, saveAppSetting } from "@/server/pomodoro/app-settings"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import { liveRoomIds } from "@/server/pomodoro/admin-chat"
import { nudgeRooms } from "@/server/pomodoro/rooms"
import {
  appSettingSchemas,
  seasonsProblem,
  type AppSettingKey,
} from "@/lib/pomodoro/app-settings"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"

/**
 * The doors of Pomoder's Settings tabs, behind `adminGet` and `adminPost`. See
 * `workspace/docs/admin-settings.md`.
 */

export const getAppSettingsErrorMessage = createErrorMessage(
  {
    SETTING_NOT_FREE:
      "Pick a free, Live sound and theme. Guests cannot play Pro items.",
    SETTING_SEASONS: "Those seasons cannot be saved.",
  },
  "That setting did not save. Please try again."
)

const keySchema = z.enum(
  Object.keys(appSettingSchemas) as [AppSettingKey, ...AppSettingKey[]]
)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => {
    const [settings, catalog] = await Promise.all([
      loadAppSettings(),
      loadMediaCatalog(),
    ])
    return { settings, catalog }
  })

/** A default a guest gets must be one a guest can play: Live, and free. */
function assertFreePair(
  catalog: MediaCatalog,
  pair: { sound: string | null; background: string | null }
) {
  const freeSound = (value: string) =>
    catalog.sounds.some((sound) => !sound.locked && `curated:${sound.key}` === value)
  const freeTheme = (value: string) =>
    catalog.themes.some((theme) => !theme.locked && `scene:${theme.key}` === value)
  if (pair.sound && !freeSound(pair.sound)) throw new Error("SETTING_NOT_FREE")
  if (pair.background && !freeTheme(pair.background))
    throw new Error("SETTING_NOT_FREE")
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ key: keySchema, value: z.unknown() }))
  .handler(async ({ data, context }) => {
    const value = appSettingSchemas[data.key].parse(data.value)
    if (data.key === "media.defaults" || data.key === "media.seasons") {
      const catalog = await loadMediaCatalog()
      const pairs =
        data.key === "media.defaults"
          ? [value as z.infer<(typeof appSettingSchemas)["media.defaults"]>]
          : (value as z.infer<(typeof appSettingSchemas)["media.seasons"]>)
      for (const pair of pairs) assertFreePair(catalog, pair)
      if (data.key === "media.seasons") {
        const problem = seasonsProblem(
          value as z.infer<(typeof appSettingSchemas)["media.seasons"]>
        )
        // The page checks the same rule first and says which seasons clash.
        if (problem) throw new Error("SETTING_SEASONS")
      }
    }
    // Guests take a break too, so the break theme is a free Live one as well.
    if (data.key === "break.look") {
      const look = value as z.infer<(typeof appSettingSchemas)["break.look"]>
      assertFreePair(await loadMediaCatalog(), { sound: null, background: look.background })
    }
    const saved = await saveAppSetting({ key: data.key, value, actorUserId: context.user.id })
    // Every open room reads itself again, so its message box says chat is
    // paused, or opens again, without anybody reloading.
    if (data.key === "safety.pause") await nudgeRooms(await liveRoomIds(), "message")
    return saved
  })

/**
 * The two pause switches, for the banner on every Pomoder admin page. Read
 * through the same five-second hold as every setting.
 */
const pausesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => (await loadAppSettings())["safety.pause"])

export const loadPomodoroSettings = () => loadFn()
export const loadSafetyPauses = () => pausesFn()
export const savePomodoroSetting = (key: AppSettingKey, value: unknown) =>
  saveFn({ data: { key, value } })
