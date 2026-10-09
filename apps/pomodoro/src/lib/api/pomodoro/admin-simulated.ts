import { createServerFn } from "@tanstack/react-start"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  listSimulatedUserIds,
  loadSimulatedStatus,
  removeAllSimulated,
  requestMakeNow,
  type SimulatedStatus,
} from "@/server/pomodoro/simulated-accounts"

/**
 * The Made-up members tab under Settings → App settings, and the mark on the
 * admin lists. Every door is behind `adminGet` or `adminPost`. See
 * `workspace/docs/made-up-members.md`. How many, Hours a day and Pause
 * everything save through the ordinary setting door in `app-settings.ts`.
 */
export type { SimulatedStatus }

export const getSimulatedErrorMessage = createErrorMessage(
  {},
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
