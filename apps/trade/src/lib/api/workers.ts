import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { WORKER_KINDS } from "@/lib/trade/workers"
import { adminGet, adminPost } from "@/server/guards"
import { setWorkerSwitch, workersDashboard } from "@/server/trade/workers"

import { createErrorMessage } from "./error-message"

/**
 * The doors onto the trading engine: see whether it is running, and switch it
 * off or pause it.
 *
 * **Admin only, both ways.** Reading tells you what is running on the server
 * and where, which is not a member's business; writing stops or starts the
 * thing that trades everybody's ladders. There is one engine, not one per
 * person, so this is machinery rather than a setting.
 */

const readWorkersFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => workersDashboard(true))

const switchSchema = z.object({
  kind: z.enum(WORKER_KINDS),
  // Exactly one of the two, so a click can never mean two things at once.
  change: z.union([
    z.object({ enabled: z.boolean() }),
    z.object({ paused: z.boolean() }),
  ]),
})

const setWorkerSwitchFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(switchSchema)
  .handler(async ({ data }) => {
    await setWorkerSwitch(data.kind, data.change)
    // The fresh answer comes back with the write, so the screen never has to
    // guess what it now says — and a switch that did not take shows up at once.
    return workersDashboard(true)
  })

export function loadWorkers() {
  return readWorkersFn()
}

export function changeWorkerSwitch(input: z.infer<typeof switchSchema>) {
  return setWorkerSwitchFn({ data: input })
}

export const getWorkersErrorMessage = createErrorMessage(
  {},
  "The trading engine could not be reached. Try again in a moment."
)
