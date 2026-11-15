// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"

const api = vi.hoisted(() => ({
  saveChartToolbarPosition: vi.fn(),
  saveOpenRow: vi.fn(),
}))

vi.mock("@/lib/api/trade/panel-layouts", () => ({
  getPanelLayoutErrorMessage: () => "The panel arrangement could not be saved.",
  saveChartToolbarPosition: api.saveChartToolbarPosition,
  saveOpenMarketRow: api.saveOpenRow,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

const scope = { protocol: "hyperliquid", network: "mainnet" } as const
const empty: TradePanelLayouts = {
  openMarketRows: {},
  headerProfitVisible: true,
  chartToolbarPosition: null,
  hiddenTradeColumns: {}, journalView: { hidePractice: false, makers: [] }, narrowChartView: null,
}

let host: HTMLDivElement
let root: Root

function Harness({
  initial,
  onRead,
}: {
  initial: TradePanelLayouts
  onRead: (value: ReturnType<typeof useTradePanelLayouts>) => void
}) {
  const value = useTradePanelLayouts(initial)
  React.useLayoutEffect(() => onRead(value), [onRead, value])
  return null
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  vi.clearAllMocks()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe("the account's panel choices", () => {
  it("writes quick changes to the account in interaction order", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const first = deferred<{ saved: true }>()
    api.saveOpenRow.mockReturnValueOnce(first.promise)
    api.saveChartToolbarPosition.mockResolvedValue({ saved: true })

    await act(async () => {
      root.render(
        <Harness
          initial={empty}
          onRead={(value) => {
            latest.current = value
          }}
        />
      )
    })

    act(() => {
      latest.current?.rememberOpenMarketRow(scope, null)
      latest.current?.rememberChartToolbarPosition({ x: 0.5, y: 0.5 })
    })
    await act(async () => Promise.resolve())
    expect(api.saveOpenRow).toHaveBeenCalledTimes(1)
    expect(api.saveChartToolbarPosition).not.toHaveBeenCalled()

    await act(async () => {
      first.resolve({ saved: true })
      await first.promise
      await Promise.resolve()
    })
    expect(api.saveChartToolbarPosition).toHaveBeenCalledWith({ x: 0.5, y: 0.5 })
  })

  it("saves the drawing toolbar position with the rest of the account layout", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    api.saveChartToolbarPosition.mockResolvedValue({ saved: true })

    await act(async () => {
      root.render(
        <Harness
          initial={empty}
          onRead={(value) => {
            latest.current = value
          }}
        />
      )
    })

    act(() => {
      latest.current?.rememberChartToolbarPosition({ x: 0.2, y: 0.4 })
    })

    expect(latest.current?.layouts.chartToolbarPosition).toEqual({
      x: 0.2,
      y: 0.4,
    })
    await act(async () => Promise.resolve())
    expect(api.saveChartToolbarPosition).toHaveBeenCalledWith({
      x: 0.2,
      y: 0.4,
    })
  })

  it("remembers a closed folder row", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const initial: TradePanelLayouts = {
      ...empty,
      openMarketRows: { "hyperliquid:mainnet": "watched" },
    }
    api.saveOpenRow.mockResolvedValue({ saved: true })
    await act(async () => {
      root.render(
        <Harness
          initial={initial}
          onRead={(value) => {
            latest.current = value
          }}
        />
      )
    })

    act(() => latest.current?.rememberOpenMarketRow(scope, null))
    expect(latest.current?.layouts.openMarketRows).toEqual({
      "hyperliquid:mainnet": null,
    })
    await act(async () => Promise.resolve())
    expect(api.saveOpenRow).toHaveBeenCalledWith(scope, null)
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
