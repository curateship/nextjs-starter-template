import { describe, expect, it } from "vitest"

import {
  finalAutomationRunStatuses,
  type AutomationRunStatus,
} from "@/lib/automations/run"

describe("final automation run statuses", () => {
  it("stops refreshing only after a run can no longer change", () => {
    const statuses: AutomationRunStatus[] = [
      "active",
      "waiting_approval",
      "completed",
      "failed",
      "rejected",
      "canceled",
    ]

    expect(
      statuses.filter((status) => finalAutomationRunStatuses.has(status))
    ).toEqual(["completed", "failed", "rejected", "canceled"])
  })
})
