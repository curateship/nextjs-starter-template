import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { appSettingSchemas } from "@/lib/pomodoro/app-settings"
import { PERSONALITY_MAX } from "@/lib/pomodoro/simulated-voice"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { adminGet, adminPost } from "@/server/guards"
import {
  listSimulatedUserIds,
  loadSimulatedStatus,
  removeAllSimulated,
  requestMakeNow,
  type SimulatedStatus,
} from "@/server/pomodoro/simulated-accounts"
import { loadPersonality, previewVoice, savePersonality } from "@/server/pomodoro/simulated-voice"
import { giveMadeUpMembersFiles } from "@/server/pomodoro/simulated-shares"

/**
 * The Made-up members tab under Settings → App settings, and the mark on the
 * admin lists. Every door is behind `adminGet` or `adminPost`. See
 * `workspace/docs/made-up-members.md`. How many, Hours a day and Pause
 * everything save through the ordinary setting door in `app-settings.ts`.
 */
export type { SimulatedStatus }

export const getSimulatedErrorMessage = createErrorMessage(
  {
    NOT_MADE_UP: "That account is not one of the made-up members.",
    PIXABAY_IMPORTS_OFF: "Add a Pixabay key on the Pixabay tab first.",
    NO_MADE_UP_MEMBERS: "There are no made-up members yet. Make them first.",
    RATE_LIMITED: "That is a lot of Previews in a few minutes. Wait a little and try again.",
  },
  "That did not work. Please try again."
)

const statusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => loadSimulatedStatus())

const makeNowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(({ context }) => requestMakeNow(context.user.id))

const removeAllFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(({ context }) => removeAllSimulated(context.user.id))

const idsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => listSimulatedUserIds())

export const loadSimulatedMembers = () => statusFn()
export const makeSimulatedMembersNow = () => makeNowFn()
export const removeAllSimulatedMembers = () => removeAllFn()
export const loadSimulatedMemberIds = () => idsFn()

/** "Give them files to share": Pixabay links, one per line (task 05, part 9). */
const giveFilesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ links: z.array(z.string().max(500)).min(1).max(50) }))
  .handler(({ data, context }) =>
    giveMadeUpMembersFiles({ links: data.links, actorUserId: context.user.id })
  )

export const giveMadeUpMembersSharedFiles = (links: string[]) =>
  giveFilesFn({ data: { links } })

/**
 * Preview spends real AI money, so it is held to twenty in ten minutes per
 * admin. Each one writes five lines and sends them nowhere.
 */
const previewFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(appSettingSchemas["simulated.voice"])
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`simulated-preview:${context.user.id}`, { maxAttempts: 20, windowSeconds: 600 })
    return previewVoice(context.user.id, data)
  })

const userIdSchema = z.object({ userId: z.string().trim().min(1).max(36) })

const loadVoiceFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(userIdSchema)
  .handler(({ data }) => loadPersonality(data.userId))

const saveVoiceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(userIdSchema.extend({ personality: z.string().trim().max(PERSONALITY_MAX) }))
  .handler(({ data, context }) => savePersonality(context.user.id, data.userId, data.personality))

export const previewSimulatedVoice = (voice: z.input<(typeof appSettingSchemas)["simulated.voice"]>) =>
  previewFn({ data: voice })
export const loadSimulatedPersonality = (userId: string) => loadVoiceFn({ data: { userId } })
export const saveSimulatedPersonality = (userId: string, personality: string) =>
  saveVoiceFn({ data: { userId, personality } })
