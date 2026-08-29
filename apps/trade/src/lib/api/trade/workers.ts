import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { WORKER_KINDS } from "@/lib/trade/workers"
import { adminGet, adminPost } from "@/server/guards"
import {
  requestWorkerRestart,
  setRealMoneySwitch,
  setWorkerSwitch,
  workersDashboard,
} from "@/server/trade/workers"

import { createErrorMessage } from "../error-message"

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

/**
 * Ask the engine to finish its pass, exit cleanly, and be started again by
 * the container supervisor. A mark on the control row the engine reads every
 * second — see `requestWorkerRestart`.
 */
const requestWorkerRestartFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ kind: z.enum(WORKER_KINDS) }))
  .handler(async ({ data }) => {
    await requestWorkerRestart(data.kind)
    // Same shape as the switches: the fresh dashboard comes back with the
    // write, so the card says "Restart requested" at once.
    return workersDashboard(true)
  })

/**
 * The Settings toggle for real money. The environment master lock is not
 * reachable from here on purpose — an install that was never allowed real
 * money cannot be armed by any request, admin or not.
 */
const setRealMoneyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ on: z.boolean() }))
  .handler(async ({ data }) => {
    await setRealMoneySwitch(data.on)
    return workersDashboard(true)
  })

export function loadWorkers() {
  return readWorkersFn()
}

export function changeWorkerSwitch(input: z.infer<typeof switchSchema>) {
  return setWorkerSwitchFn({ data: input })
}

export function restartWorker(kind: (typeof WORKER_KINDS)[number]) {
  return requestWorkerRestartFn({ data: { kind } })
}

export function changeRealMoneySwitch(on: boolean) {
  return setRealMoneyFn({ data: { on } })
}

export const getWorkersErrorMessage = createErrorMessage(
  {},
  "The trading engine could not be reached. Try again in a moment."
)
