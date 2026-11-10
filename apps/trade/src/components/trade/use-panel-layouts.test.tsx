// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"

const api = vi.hoisted(() => ({
  importLegacy: vi.fn(),
  save: vi.fn(),
  saveChartToolbarPosition: vi.fn(),
  saveOpenRow: vi.fn(),
}))

vi.mock("@/lib/api/trade/panel-layouts", () => ({
  getPanelLayoutErrorMessage: () => "The panel arrangement could not be saved.",
  importLegacyPanelLayouts: api.importLegacy,
  saveChartToolbarPosition: api.saveChartToolbarPosition,
  saveOpenMarketRow: api.saveOpenRow,
  savePanelLayout: api.save,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

const marker = "trade-panel-layouts-account-import-v1"
const backtest = { workspace: 70, trades: 30 }
const scope = { protocol: "hyperliquid", network: "mainnet" } as const
const empty: TradePanelLayouts = {
  legacyImported: false,
  current: {},
  openMarketRows: {},
  headerProfitVisible: true,
  chartToolbarPosition: null,
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

describe("the browser-to-account panel layout handoff", () => {
  it("shows the old browser layout immediately, imports it, then removes it", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const onRead = (value: ReturnType<typeof useTradePanelLayouts>) => {
      latest.current = value
    }
    localStorage.setItem(
      tradePanelLayoutKey.backtestVertical,
      JSON.stringify(backtest)
    )
    const imported: TradePanelLayouts = {
      legacyImported: true,
      current: { [tradePanelLayoutKey.backtestVertical]: backtest },
      openMarketRows: {},
      headerProfitVisible: true,
      chartToolbarPosition: null,
    }
    api.importLegacy.mockResolvedValue(imported)

    await act(async () => {
      root.render(<Harness initial={empty} onRead={onRead} />)
      await Promise.resolve()
    })

    expect(api.importLegacy).toHaveBeenCalledWith({
      [tradePanelLayoutKey.backtestVertical]: backtest,
    })
    expect(latest.current?.layouts).toEqual(imported)
    expect(
      localStorage.getItem(tradePanelLayoutKey.backtestVertical)
    ).toBeNull()
    expect(localStorage.getItem(marker)).toBe("done")
  })

  it("removes old browser copies when the account already owns the layout", async () => {
    localStorage.setItem(
      tradePanelLayoutKey.backtestVertical,
      JSON.stringify(backtest)
    )

    await act(async () => {
      root.render(
        <Harness
          initial={{ ...empty, legacyImported: true }}
          onRead={() => {}}
        />
      )
    })

    expect(api.importLegacy).not.toHaveBeenCalled()
    expect(
      localStorage.getItem(tradePanelLayoutKey.backtestVertical)
    ).toBeNull()
    expect(localStorage.getItem(marker)).toBe("done")
  })

  it("writes quick layout changes to the account in interaction order", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const first = deferred<void>()
    api.save.mockReturnValueOnce(first.promise).mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <Harness
          initial={{ ...empty, legacyImported: true }}
          onRead={(value) => {
            latest.current = value
          }}
        />
      )
    })

    act(() => {
      latest.current?.remember(
        tradePanelLayoutKey.backtestVertical,
        backtest
      )
      latest.current?.remember(tradePanelLayoutKey.flowRunVertical, {
        workspace: 72,
        trades: 28,
      })
    })
    await act(async () => Promise.resolve())
    expect(api.save).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve()
      await first.promise
      await Promise.resolve()
    })
    expect(api.save).toHaveBeenCalledTimes(2)
    expect(api.save).toHaveBeenLastCalledWith(
      tradePanelLayoutKey.flowRunVertical,
      { workspace: 72, trades: 28 }
    )
  })

  it("saves the drawing toolbar position with the rest of the account layout", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    api.saveChartToolbarPosition.mockResolvedValue({ saved: true })

    await act(async () => {
      root.render(
        <Harness
          initial={{ ...empty, legacyImported: true }}
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

  it("keeps a newer drag made while the old browser layout is importing", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const importing = deferred<TradePanelLayouts>()
    const newer = { workspace: 60, trades: 40 }
    api.importLegacy.mockReturnValue(importing.promise)
    api.save.mockResolvedValue(undefined)
    localStorage.setItem(
      tradePanelLayoutKey.backtestVertical,
      JSON.stringify(backtest)
    )

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
      latest.current?.remember(tradePanelLayoutKey.backtestVertical, newer)
    })
    expect(api.save).not.toHaveBeenCalled()

    await act(async () => {
      importing.resolve({
        legacyImported: true,
        current: { [tradePanelLayoutKey.backtestVertical]: backtest },
        openMarketRows: {},
        headerProfitVisible: true,
        chartToolbarPosition: null,
      })
      await importing.promise
      await Promise.resolve()
    })

    expect(
      latest.current?.layouts.current[tradePanelLayoutKey.backtestVertical]
    ).toEqual(newer)
    expect(api.save).toHaveBeenCalledWith(
      tradePanelLayoutKey.backtestVertical,
      newer
    )
  })

  it("remembers a closed folder row", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const initial: TradePanelLayouts = {
      ...empty,
      legacyImported: true,
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
