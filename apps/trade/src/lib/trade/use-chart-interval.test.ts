// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  chartIntervalStorageKey,
  DEFAULT_CHART_INTERVAL,
} from "@/lib/trade/chart-interval"
import { useChartInterval } from "@/lib/trade/use-chart-interval"
import {
  CANDLE_INTERVALS,
  type CandleInterval,
  type ProtocolId,
} from "@/lib/protocols/contracts"

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

/**
 * The hook on its own, drawn the way the header draws it: the chosen frame in
 * the text, and one button per frame to choose with. The test reads the text
 * and presses a button, so nothing has to reach outside the component.
 */
function Probe({ protocol }: { protocol: ProtocolId }) {
  const [interval, choose] = useChartInterval(protocol)
  return React.createElement(
    "div",
    null,
    React.createElement("span", { "data-testid": "shown" }, interval),
    ...CANDLE_INTERVALS.map((option) =>
      React.createElement(
        "button",
        {
          key: option,
          type: "button",
          "aria-label": `Show ${option} candles`,
          onClick: () => choose(option),
        },
        option
      )
    )
  )
}

async function show(protocol: ProtocolId) {
  await act(async () => {
    root.render(React.createElement(Probe, { protocol }))
  })
}

function shown(): string {
  return host.querySelector('[data-testid="shown"]')?.textContent ?? ""
}

async function pick(option: CandleInterval) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="Show ${option} candles"]`
  )
  expect(button).not.toBeNull()
  await act(async () => {
    button!.click()
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.localStorage.clear()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe("the chart's timeframe", () => {
  it("remembers one exchange's choice without touching another's", async () => {
    await show("hyperliquid")
    await pick("1d")
    expect(shown()).toBe("1d")

    await show("kucoin")
    expect(shown()).toBe(DEFAULT_CHART_INTERVAL)
    await pick("1h")

    await show("hyperliquid")
    expect(shown()).toBe("1d")
    await show("kucoin")
    expect(shown()).toBe("1h")
  })

  it("writes the exchange's own key and reads nothing else", async () => {
    // The single key every exchange shared before this split. It is history,
    // not a second answer: an exchange with no frame of its own opens on the
    // default rather than on whatever was last charted somewhere else.
    window.localStorage.setItem("trade-chart-interval", "15m")
    await show("hyperliquid")
    expect(shown()).toBe(DEFAULT_CHART_INTERVAL)

    await pick("1h")
    expect(
      window.localStorage.getItem(chartIntervalStorageKey("hyperliquid"))
    ).toBe("1h")
    await show("kucoin")
    expect(shown()).toBe(DEFAULT_CHART_INTERVAL)
  })

  it("ignores a saved value that is not a timeframe", async () => {
    window.localStorage.setItem(
      chartIntervalStorageKey("hyperliquid"),
      "fortnight"
    )
    await show("hyperliquid")
    expect(shown()).toBe(DEFAULT_CHART_INTERVAL)
  })
})
