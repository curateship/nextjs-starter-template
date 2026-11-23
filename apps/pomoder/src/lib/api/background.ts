import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  applyBackgroundPreference,
  loadBackgroundPreference,
} from "@/server/background-preferences"
import { requireAppOrigin } from "@/server/origin"
import { findCurrentUser } from "@/server/security"

const backgroundSchema = z.object({ background: z.string().max(60).nullable() })

const loadBackgroundPreferenceFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await findCurrentUser()
    if (!user) return null
    return loadBackgroundPreference(user.id)
  }
)

const saveBackgroundPreferenceFn = createServerFn({ method: "POST" })
  .inputValidator(backgroundSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await findCurrentUser()
    if (!user) return null
    return applyBackgroundPreference(user.id, data.background)
  })

export const loadBackgroundPreferenceValue = () => loadBackgroundPreferenceFn()
export const saveBackgroundPreferenceValue = (background: string | null) =>
  saveBackgroundPreferenceFn({ data: { background } })
