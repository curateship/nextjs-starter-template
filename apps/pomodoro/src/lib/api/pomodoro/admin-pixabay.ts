import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  pixabayKeyStatus,
  savePixabayKey as storePixabayKey,
  type PixabayKeyStatus,
} from "@/server/pomodoro/pixabay-key"

/**
 * The Pixabay tab under Settings → App settings. See "Pixabay" in
 * `workspace/docs/admin-settings.md`. Neither door ever answers with the key:
 * only whether one is saved and its last four characters.
 */
export type { PixabayKeyStatus }

export const getPixabayKeyErrorMessage = createErrorMessage(
  {
    ENCRYPTION_NOT_CONFIGURED:
      "Secret storage is not set up: the server's CUSTOM_SHELL_SECRET_ENCRYPTION_KEY is missing. Nothing was saved.",
  },
  "The Pixabay key did not save. Please try again."
)

const loadStatusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => pixabayKeyStatus())

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      // Pixabay's keys are 34 characters today; anything printable from 10 to
      // 100 is let through so a longer key next year still saves.
      key: z.string().trim().regex(/^[\x21-\x7e]{10,100}$/).nullable(),
    })
  )
  .handler(({ data, context }) =>
    storePixabayKey({ key: data.key, actorUserId: context.user.id })
  )

export const loadPixabayKeyStatus = () => loadStatusFn()
export const savePixabayKey = (key: string | null) => saveFn({ data: { key } })
