// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EngineErrorsCard } from "@/components/workers/engine-errors-card"
import type { EngineErrorRow } from "@/lib/trade/engine-errors"

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

function row(over: Partial<EngineErrorRow> = {}): EngineErrorRow {
  return {
    id: crypto.randomUUID(),
    kind: "error",
    source: "ladder-worker",
    message: "Ladder loop failed: fetch failed",
    times: 1,
    firstSeenAt: "2026-09-05T03:12:00.000Z",
    lastSeenAt: "2026-09-05T03:12:00.000Z",
    ...over,
  }
}

async function draw(errors: EngineErrorRow[]) {
  await act(async () => {
    root.render(<EngineErrorsCard errors={errors} />)
  })
}

describe("the engine's error history", () => {
  it("says so plainly when nothing has gone wrong", async () => {
    await draw([])

    expect(host.textContent).toContain("No errors recorded")
  })

  it("shows the place, the words and the time", async () => {
    await draw([row()])

    expect(host.textContent).toContain("ladder-worker")
    expect(host.textContent).toContain("Ladder loop failed: fetch failed")
    expect(host.textContent).toContain("2026")
  })

  it("says how many times a folded row repeated", async () => {
    await draw([row({ times: 12, lastSeenAt: "2026-09-05T03:12:45.000Z" })])

    expect(host.textContent).toContain("12 times")
  })

  it("says a warning is a warning rather than colouring it", async () => {
    await draw([row({ kind: "warning", message: "fill failed" })])

    expect(host.textContent).toContain("Warning")
  })

  it("puts the newest at the top", async () => {
    await draw([
      row({ message: "Older", lastSeenAt: "2026-09-05T01:00:00.000Z" }),
      row({ message: "Newer", lastSeenAt: "2026-09-05T04:00:00.000Z" }),
    ])

    const messages = [...host.querySelectorAll("tbody tr")].map(
      (line) => line.textContent ?? ""
    )
    expect(messages[0]).toContain("Newer")
    expect(messages[1]).toContain("Older")
  })
})
