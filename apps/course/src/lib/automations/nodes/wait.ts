import { HourglassIcon } from "lucide-react"
import { z } from "zod"

import { plural } from "@/lib/format/plural"

import { defineNode } from "../node-descriptor"

export const WAIT_UNITS = ["hours", "days"] as const
export type WaitUnit = (typeof WAIT_UNITS)[number]

/** The longest one Wait may hold a run: sixty days, in either unit. */
export const WAIT_MAX_DAYS = 60

const HOUR_MS = 60 * 60 * 1000
const UNIT_MS: Record<WaitUnit, number> = { hours: HOUR_MS, days: 24 * HOUR_MS }

export type WaitSettings = {
  amount: number
  unit: WaitUnit
  stopOnClick: boolean
}

export function readWaitSettings(
  settings: Record<string, unknown>
): WaitSettings {
  return {
    amount:
      typeof settings.amount === "number" && Number.isFinite(settings.amount)
        ? settings.amount
        : 0,
    unit: WAIT_UNITS.includes(settings.unit as WaitUnit)
      ? (settings.unit as WaitUnit)
      : "days",
    stopOnClick: settings.stopOnClick !== false,
  }
}

/** "2 days", "1 hour". */
export function describeWaitLength({ amount, unit }: WaitSettings): string {
  return `${amount} ${plural(amount, unit.slice(0, -1), unit)}`
}

export function waitDurationMs({ amount, unit }: WaitSettings): number {
  return amount * UNIT_MS[unit]
}

/**
 * Holds the run for a set time, then carries on.
 *
 * The run costs nothing while it waits: the engine hands its claim back and
 * points its wake-up time at the end of the wait, so nothing looks at it again
 * until then.
 *
 * `stopOnClick` is what turns a row of Waits into a sequence that knows when to
 * stop. A person who clicked any link in this flow's emails has done what the
 * emails were asking, so the next one would only be noise.
 */
export const waitNode = defineNode({
  kind: "wait",
  palette: {
    key: "flow-wait",
    group: "Flow",
    description: "Wait a while, then carry on",
  },
  createSettings: () => ({ amount: 2, unit: "days", stopOnClick: true }),
  settingsSchema: z
    .object({
      amount: z
        .number()
        .int("Wait a whole number of hours or days.")
        .min(1, "Wait at least 1 hour."),
      unit: z.enum(WAIT_UNITS),
      stopOnClick: z.boolean(),
    })
    .refine(
      (settings) =>
        waitDurationMs(settings) <= WAIT_MAX_DAYS * UNIT_MS.days,
      { message: `Wait ${WAIT_MAX_DAYS} days or less.`, path: ["amount"] }
    ),
  name: () => "Wait",
  description: (settings) => {
    const wait = readWaitSettings(settings)
    if (wait.amount < 1) return "Say how long to wait."
    const length = `Waits ${describeWaitLength(wait)}, then carries on.`
    return wait.stopOnClick
      ? `${length} Stops for anyone who clicked a link.`
      : length
  },
  icon: HourglassIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/wait-panel"),
})
