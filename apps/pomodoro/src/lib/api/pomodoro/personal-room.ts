import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  loadMediaBootstrap,
  savePersonalBackground,
  savePersonalSound,
} from "@/server/pomodoro/personal-room"

/**
 * The personal room's endpoints: what a page draws, and the Add to my
 * personal room buttons on Sounds and Backgrounds. See
 * `workspace/docs/personal-room.md`.
 *
 * A guest never calls these. A guest's pair is picked at random by the page's
 * own loader (`guestMediaBootstrap`) and lives only as long as the visit.
 */

const loadMediaFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadMediaBootstrap(context.user.id))

const saveSoundFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ sound: z.string().max(60).nullable() }))
  .handler(async ({ data, context }) =>
    savePersonalSound(context.user.id, data.sound)
  )

const saveBackgroundFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ background: z.string().max(60).nullable() }))
  .handler(async ({ data, context }) =>
    savePersonalBackground(context.user.id, data.background)
  )

export const loadRoomMediaBootstrap = () => loadMediaFn()
export const savePersonalRoomSound = (sound: string | null) =>
  saveSoundFn({ data: { sound } })
export const savePersonalRoomBackground = (background: string | null) =>
  saveBackgroundFn({ data: { background } })
