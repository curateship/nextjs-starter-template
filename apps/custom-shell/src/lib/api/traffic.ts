import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  loadTrafficSummary as loadTrafficSummaryQuery,
  type TrafficDayPoint,
  type TrafficKeyCount,
  type TrafficSummary,
} from "@/server/traffic"
import { requireAdmin } from "@/server/security"

export type { TrafficDayPoint, TrafficKeyCount, TrafficSummary }

/**
 * The `?days=` values the Traffic page accepts. Numbers, so the address
 * reads `?days=7` (a string would be JSON-quoted into `%227%22`). Defined
 * here — not re-exported from the server module — so the route and dashboard
 * never pull a server value into the browser bundle.
 */
export const TRAFFIC_RANGES = [7, 30, 90] as const
export type TrafficRange = (typeof TRAFFIC_RANGES)[number]

/** `?days=` from the address: 7, 30 or 90 (either type), anything else absent. */
export function readTrafficRange(value: unknown): TrafficRange | undefined {
  const days = typeof value === "number" ? value : Number(value)
  return (TRAFFIC_RANGES as readonly number[]).includes(days)
    ? (days as TrafficRange)
    : undefined
}

const trafficErrorMessages: Record<string, string> = {
  FORBIDDEN: "Only an admin can see the traffic numbers.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getTrafficErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(trafficErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? trafficErrorMessages[matched]
    : "The traffic numbers could not be loaded. Please try again."
}

const loadTrafficSummaryFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    })
  )
  .handler(async ({ data }): Promise<TrafficSummary> => {
    await requireAdmin()
    return loadTrafficSummaryQuery(data.days)
  })

export function loadTrafficSummary(days: TrafficRange) {
  return loadTrafficSummaryFn({ data: { days } })
}
