import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

import {
  loadTrafficSummary as loadTrafficSummaryQuery,
  type TrafficDayPoint,
  type TrafficKeyCount,
  type TrafficSummary,
} from "@/server/traffic"
import { adminGet } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export type { TrafficDayPoint, TrafficKeyCount, TrafficSummary }

/**
 * The `?days=` values the Traffic page accepts. Numbers, so the address
 * reads `?days=7` (a string would be JSON-quoted into `%227%22`). Defined
 * here — not re-exported from the server module — so the route and dashboard
 * never pull a server value into the browser bundle.
 *
 * Only ever added to. An address somebody saved has to keep working, so a
 * value that was once accepted is never taken back out.
 */
export const TRAFFIC_RANGES = [1, 7, 30, 90, 365] as const
export type TrafficRange = (typeof TRAFFIC_RANGES)[number]

/** What each range is called wherever it is offered. One list, so they agree. */
export const TRAFFIC_RANGE_LABELS: Record<TrafficRange, string> = {
  1: "Today",
  7: "7 days",
  30: "30 days",
  90: "90 days",
  365: "Year",
}

/** `?days=` from the address: one of `TRAFFIC_RANGES` (either type), or absent. */
export function readTrafficRange(value: unknown): TrafficRange | undefined {
  const days = typeof value === "number" ? value : Number(value)
  return (TRAFFIC_RANGES as readonly number[]).includes(days)
    ? (days as TrafficRange)
    : undefined
}

export const getTrafficErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can see the traffic numbers." },
  "The traffic numbers could not be loaded. Please try again."
)

const loadTrafficSummaryFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      days: z.union([
        z.literal(1),
        z.literal(7),
        z.literal(30),
        z.literal(90),
        z.literal(365),
      ]),
    })
  )
  .handler(async ({ data, context }): Promise<TrafficSummary> => {
    return loadTrafficSummaryQuery(
      await workspaceIdForRequest(context.user.id),
      data.days
    )
  })

export function loadTrafficSummary(days: TrafficRange) {
  return loadTrafficSummaryFn({ data: { days } })
}
