import { describe, expect, it } from "vitest"

import { appendAutomationLog, type AutomationLogEntry } from "./automation-log"

describe("appendAutomationLog", () => {
  it("keeps the newest canvas activity first and caps retained entries", () => {
    let entries: AutomationLogEntry[] = []
    for (let index = 0; index < 105; index += 1) {
      entries = appendAutomationLog(entries, {
        id: String(index),
        time: index,
        message: `Event ${index}`,
      })
    }

    expect(entries).toHaveLength(100)
    expect(entries[0]?.message).toBe("Event 104")
    expect(entries.at(-1)?.message).toBe("Event 5")
  })
})
