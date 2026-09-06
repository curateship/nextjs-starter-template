// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it } from "vitest"
import { EngineUptimeCard } from "@/components/workers/engine-uptime-card"
import type { EngineUptime } from "@/lib/trade/engine-uptime"

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
async function draw(uptime: EngineUptime) {
  await act(async () => root.render(<EngineUptimeCard uptime={uptime} />))
}
const checkedAt = "2026-09-06T12:00:00.000Z"
it("shows an empty history without claiming measured uptime", async () => {
  await draw({ outages: [], totalDowntimeMs: 0, checkedAt })
  expect(host.textContent).toContain("No outages recorded in the last 30 days.")
  expect(host.textContent).toContain("Down 0 times, 0 minutes in all")
})
it("shows start, end, ongoing duration and the 30-day total", async () => {
  await draw({
    checkedAt,
    totalDowntimeMs: 150_000,
    outages: [
      {
        startedAt: "2026-09-06T11:59:00.000Z",
        endedAt: null,
        durationMs: 60_000,
      },
      {
        startedAt: "2026-09-05T12:00:00.000Z",
        endedAt: "2026-09-05T12:01:30.000Z",
        durationMs: 90_000,
      },
    ],
  })
  expect(host.textContent).toContain("Down 2 times, 2.5 minutes in all")
  const rows = host.querySelectorAll("li")
  expect(rows).toHaveLength(2)
  expect(rows[0].textContent).toContain("Ongoing")
  expect(rows[0].textContent).toContain("1 minute so far")
  expect(rows[1].textContent).toContain("1.5 minutes")
  expect(rows[1].textContent).not.toContain("Ongoing")
  expect(host.textContent).toContain("Reload to update")
})
