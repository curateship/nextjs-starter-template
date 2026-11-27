import { describe, expect, it } from "vitest"

import { exportProgressText, stopExportsLabel } from "@/lib/video/export-status"

const waiting = { status: "queued" as const, error_message: null, queue_position: null, started_at: null }

describe("an export's progress line", () => {
  it("says how many are ahead of a waiting export", () => {
    expect(exportProgressText({ ...waiting, queue_position: 3 }, null)).toBe("Waiting, 2 ahead of it")
    expect(exportProgressText({ ...waiting, queue_position: 1 }, null)).toBe("Waiting to start…")
    expect(exportProgressText(waiting, null)).toBe("Waiting to start…")
  })

  it("gives the worker's own words when it waits for disk room", () => {
    expect(
      exportProgressText({ ...waiting, error_message: "Waiting for room on the server's disk" }, null)
    ).toBe("Waiting for room on the server's disk")
  })

  it("counts a running export from when the worker began", () => {
    const running = { ...waiting, status: "running" as const, started_at: "2026-11-06T10:00:00.000Z" }
    expect(exportProgressText(running, Date.parse("2026-11-06T10:02:14.000Z"))).toBe(
      "Making it now · 2:14 so far"
    )
    expect(exportProgressText(running, null)).toBe("Making it now…")
    expect(exportProgressText({ ...running, started_at: null }, Date.now())).toBe("Making it now…")
  })
})

describe("the Stop button", () => {
  it("names how many it stops", () => {
    expect(stopExportsLabel(1)).toBe("Stop export")
    expect(stopExportsLabel(3)).toBe("Stop all 3 exports")
  })
})
