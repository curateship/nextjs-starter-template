import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { loadOrCreatePreferences } from "@/server/pomodoro/productivity"
import { userPreferences } from "@/server/pomodoro/schema"
import { MAX_BACKDROP_DIM } from "@/lib/pomodoro/backdrop-look"

/**
 * The member's dim slider and drift switch for the scene behind the timer.
 * Each is saved on its own, so moving the slider never resends the switch.
 * A guest keeps both in the browser (`src/lib/pomodoro/backdrop-look.ts`).
 */

const saveSchema = z.union([
  z.object({ dim: z.number().int().min(0).max(MAX_BACKDROP_DIM) }),
  z.object({ drift: z.boolean() }),
])

const loadBackdropLookFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const preferences = await loadOrCreatePreferences(context.user.id)
    return { dim: preferences.backdropDim, drift: preferences.backdropDrift }
  })

const saveBackdropLookFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveSchema)
  .handler(async ({ data, context }) => {
    await loadOrCreatePreferences(context.user.id)
    const [updated] = await db
      .update(userPreferences)
      .set({
        ...("dim" in data ? { backdropDim: data.dim } : { backdropDrift: data.drift }),
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, context.user.id))
      .returning({ dim: userPreferences.backdropDim, drift: userPreferences.backdropDrift })
    return updated
  })

export const loadBackdropLook = () => loadBackdropLookFn()
export const saveBackdropLook = (data: z.infer<typeof saveSchema>) =>
  saveBackdropLookFn({ data })
