import { createServerFn } from "@tanstack/react-start"

import type { CapacitySummary } from "@/server/orchestrator"

export type { CapacitySummary } from "@/server/orchestrator"

const loadCapacitySummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CapacitySummary> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user || user.role !== "admin") throw new Error("Not authorized")

    const { getCapacitySummary } = await import("@/server/orchestrator")
    return getCapacitySummary()
  }
)

export function loadCapacitySummary() {
  return loadCapacitySummaryFn()
}

export function getCapacityErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Capacity request failed."
}
