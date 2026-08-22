// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { IntervalPicker } from "@/components/trade/chart-panel"
import type { CandleInterval } from "@/lib/protocols/contracts"

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

function Picker() {
  const [interval, setInterval] = React.useState<CandleInterval>("4h")
  return <IntervalPicker value={interval} onChange={setInterval} />
}

describe("the chart interval picker", () => {
  it("is one named choice and moves through intervals with the arrow keys", async () => {
    await act(async () => root.render(<Picker />))

    const group = host.querySelector<HTMLElement>("[role=tablist]")
    const tabs = Array.from(
      host.querySelectorAll<HTMLButtonElement>("[role=tab]")
    )

    expect(group?.getAttribute("aria-label")).toBe("Candle interval")
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "1m",
      "5m",
      "15m",
      "1h",
      "4h",
      "1d",
    ])
    expect(tabs[4].getAttribute("aria-selected")).toBe("true")

    tabs[4].focus()
    await act(async () => {
      tabs[4].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      )
    })

    expect(document.activeElement?.textContent).toBe("1d")
    expect(tabs[5].getAttribute("aria-selected")).toBe("true")
  })
})
