// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useStreamed } from "@/lib/trade/use-streamed"

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

function Shown({ promise }: { promise: Promise<string> }) {
  const value = useStreamed(promise)
  return <output>{value ?? "waiting"}</output>
}

const shown = () => host.querySelector("output")?.textContent

describe("useStreamed", () => {
  it("paints nothing first and the value once the promise lands", async () => {
    let land!: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      land = resolve
    })
    await act(async () => root.render(<Shown promise={promise} />))
    expect(shown()).toBe("waiting")

    await act(async () => land("landed"))
    expect(shown()).toBe("landed")
  })

  it("paints a promise it has already seen land on the first frame", async () => {
    // A market click inside the route answer's one-minute cache hands the
    // page the same promise again; the list must not flash a loading state.
    const promise = Promise.resolve("landed")
    await act(async () => root.render(<Shown promise={promise} />))
    expect(shown()).toBe("landed")

    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<Shown promise={promise} />))
    expect(shown()).toBe("landed")
  })

  it("lets a newer promise take over, and drops a stale answer", async () => {
    let landFirst!: (value: string) => void
    const first = new Promise<string>((resolve) => {
      landFirst = resolve
    })
    await act(async () => root.render(<Shown promise={first} />))

    const second = Promise.resolve("second")
    await act(async () => root.render(<Shown promise={second} />))
    expect(shown()).toBe("second")

    // The first promise landing late must not overwrite the newer answer.
    await act(async () => landFirst("first"))
    expect(shown()).toBe("second")
  })
})
