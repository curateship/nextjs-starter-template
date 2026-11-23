import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import {
  loadMediaBootstrap,
  loadUnsetPair,
  savePersonalBackground,
  savePersonalSound,
} from "@/server/pomodoro/personal-room"
import { guestMediaBootstrap } from "@/lib/pomodoro/media-pair"

/**
 * The personal room's endpoints: what a page draws, and the Add to my
 * personal room buttons on Sounds and Backgrounds. See
 * `workspace/docs/personal-room.md`.
 *
 * A guest has no personal room. A guest's pair is picked at random from the
 * free Live items by `loadGuestMediaFn`, the one door here open without an
 * account, and lives only as long as the visit.
 */

/**
 * What a page draws for a guest: the Live catalogue and a random free pair
 * from it. Open on purpose; see `src/app/open-endpoints.ts`.
 */
const loadGuestMediaFn = createServerFn({ method: "GET" }).handler(async () => {
  const [catalog, unset] = await Promise.all([loadMediaCatalog(), loadUnsetPair()])
  return guestMediaBootstrap(catalog, Math.random, unset)
})

const loadMediaFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadMediaBootstrap(context.user.id))

const saveSoundFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ sound: z.string().max(200).nullable() }))
  .handler(async ({ data, context }) =>
    savePersonalSound(context.user.id, data.sound)
  )

const saveBackgroundFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ background: z.string().max(200).nullable() }))
  .handler(async ({ data, context }) =>
    savePersonalBackground(context.user.id, data.background)
  )

export const loadRoomMediaBootstrap = () => loadMediaFn()
export const loadGuestMediaBootstrap = () => loadGuestMediaFn()
export const savePersonalRoomSound = (sound: string | null) =>
  saveSoundFn({ data: { sound } })
export const savePersonalRoomBackground = (background: string | null) =>
  saveBackgroundFn({ data: { background } })
