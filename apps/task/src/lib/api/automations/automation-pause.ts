import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ShellAutomationPause } from "@/lib/custom-shell"
import { runAutomationTick } from "@/server/automations/engine"
import {
  countHeldAutomationRuns,
  setAutomationPause,
} from "@/server/automations/pause"
import { adminPost } from "@/server/guards"

import { createErrorMessage } from "../error-message"

/**
 * The saved switch plus the number of runs standing still because of it.
 *
 * There is no read endpoint beside this: the switch rides in the shell config
 * every signed-in page already loads, so the header badge and the automations
 * page both read it from there and can never disagree about it.
 */
export type AutomationPauseState = {
  pause: ShellAutomationPause
  /** Runs stopped where they stand, waiting for the switch to go back off. */
  held_runs: number
}

export const getAutomationPauseErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can pause automations." },
  "We could not change the automations switch. Please try again."
)

/**
 * Flips the switch, and on the way back off kicks a pass straight away.
 *
 * Without that kick the held runs would sit there for up to another fifteen
 * seconds after the person watching has already pressed Resume, which reads as
 * the button not having worked. The count is taken after that pass, so the
 * answer is what is really still held rather than the number from a moment ago.
 *
 * Who flipped it is `context.user.name`, never anything the browser sent — the
 * request carries a single boolean.
 */
const setAutomationPauseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data, context }): Promise<AutomationPauseState> => {
    const pause = await setAutomationPause({
      enabled: data.enabled,
      changedBy: context.user.name,
    })

    if (!pause.enabled) {
      // The switch is already saved, so a failure in the walk belongs to the
      // ticker to pick up rather than something to fail the button over.
      await runAutomationTick().catch((error) => {
        console.error("Automation tick after resuming failed", error)
      })
    }

    return { pause, held_runs: await countHeldAutomationRuns() }
  })

export function saveAutomationPause(enabled: boolean) {
  return setAutomationPauseFn({ data: { enabled } })
}
