import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { goalSchema, type Goal, type GoalProgress } from "@/lib/trade/goal"
import { userGet, userPost } from "@/server/guards"
import {
  forgetGoalWallets,
  loadGoalProgress,
  loadWalletsWorth,
} from "@/server/trade/goal"
import { loadGoal, saveGoal } from "@/server/trade/prefs"

const saveGoalInput = z.object({ goal: goalSchema })

const loadGoalFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ goal: Goal }> => ({
    goal: await loadGoal(context.user.id),
  }))

const loadGoalProgressFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{ goal: Goal; progress: GoalProgress }> =>
      loadGoalProgress(context.user.id)
  )

/**
 * What the wallets are worth, on its own.
 *
 * The Goals screen shows what a percent means in dollars whether the goal is
 * on or off, and `loadGoalProgress` answers nothing at all while it is off —
 * deliberately, so a header on an account with no goal never sweeps an
 * exchange. Both read the same held sweep.
 */
const loadGoalWalletsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ walletsWorth: number | null }> => ({
    walletsWorth: (await loadWalletsWorth(context.user.id)).worth,
  }))

const saveGoalFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveGoalInput)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveGoal(context.user.id, data.goal)
    // A goal just switched on must not wait a minute for the wallet total it
    // is a percent of, so the held sweep is dropped on every save.
    forgetGoalWallets(context.user.id)
    return { saved: true }
  })

export function loadGoalSetting() {
  return loadGoalFn()
}

export function loadDailyGoal() {
  return loadGoalProgressFn()
}

export function loadGoalWallets() {
  return loadGoalWalletsFn()
}

export function saveGoalSetting(goal: Goal) {
  return saveGoalFn({ data: { goal } })
}

export const getGoalLoadErrorMessage = createErrorMessage(
  {},
  "Your goal could not be loaded. Try again."
)

export const getGoalSaveErrorMessage = createErrorMessage(
  {},
  "That goal was not saved. The screen still shows your choice, but it will be back to how it was after a reload."
)
