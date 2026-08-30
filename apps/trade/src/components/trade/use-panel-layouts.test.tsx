// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"

const api = vi.hoisted(() => ({
  apply: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  importLegacy: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@/lib/api/trade/panel-layouts", () => ({
  applyNamedPanelLayout: api.apply,
  createNamedPanelLayout: api.create,
  deleteNamedPanelLayout: api.remove,
  getPanelLayoutErrorMessage: () => "The panel arrangement could not be saved.",
  importLegacyPanelLayouts: api.importLegacy,
  savePanelLayout: api.save,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

const marker = "trade-panel-layouts-account-import-v1"
const horizontal = { markets: 20, chart: 58, "smart-orders": 22 }
const empty: TradePanelLayouts = {
  legacyImported: false,
  current: {},
  named: [],
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
      tradePanelLayoutKey.workspaceHorizontal,
      JSON.stringify(horizontal)
    )
    const imported: TradePanelLayouts = {
      legacyImported: true,
      current: { [tradePanelLayoutKey.workspaceHorizontal]: horizontal },
      named: [],
    }
    api.importLegacy.mockResolvedValue(imported)

    await act(async () => {
      root.render(<Harness initial={empty} onRead={onRead} />)
      await Promise.resolve()
    })

    expect(api.importLegacy).toHaveBeenCalledWith({
      [tradePanelLayoutKey.workspaceHorizontal]: horizontal,
    })
    expect(latest.current?.layouts).toEqual(imported)
    expect(
      localStorage.getItem(tradePanelLayoutKey.workspaceHorizontal)
    ).toBeNull()
    expect(localStorage.getItem(marker)).toBe("done")
  })

  it("removes old browser copies when the account already owns the layout", async () => {
    localStorage.setItem(
      tradePanelLayoutKey.workspaceHorizontal,
      JSON.stringify(horizontal)
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
      localStorage.getItem(tradePanelLayoutKey.workspaceHorizontal)
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
        tradePanelLayoutKey.workspaceHorizontal,
        horizontal
      )
      latest.current?.remember(tradePanelLayoutKey.workspaceVertical, {
        workspace: 72,
        activity: 28,
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
      tradePanelLayoutKey.workspaceVertical,
      { workspace: 72, activity: 28 }
    )
  })

  it("keeps a newer drag made while the old browser layout is importing", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const importing = deferred<TradePanelLayouts>()
    const newer = { markets: 10, chart: 80, "smart-orders": 10 }
    api.importLegacy.mockReturnValue(importing.promise)
    api.save.mockResolvedValue(undefined)
    localStorage.setItem(
      tradePanelLayoutKey.workspaceHorizontal,
      JSON.stringify(horizontal)
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
      latest.current?.remember(tradePanelLayoutKey.workspaceHorizontal, newer)
    })
    expect(api.save).not.toHaveBeenCalled()

    await act(async () => {
      importing.resolve({
        legacyImported: true,
        current: { [tradePanelLayoutKey.workspaceHorizontal]: horizontal },
        named: [],
      })
      await importing.promise
      await Promise.resolve()
    })

    expect(
      latest.current?.layouts.current[tradePanelLayoutKey.workspaceHorizontal]
    ).toEqual(newer)
    expect(api.save).toHaveBeenCalledWith(
      tradePanelLayoutKey.workspaceHorizontal,
      newer
    )
  })

  it("lets a divider drag made during a named switch win for that group", async () => {
    const latest: {
      current: ReturnType<typeof useTradePanelLayouts> | null
    } = { current: null }
    const applying = deferred<TradePanelLayouts>()
    const newer = { markets: 10, chart: 80, "smart-orders": 10 }
    api.apply.mockReturnValue(applying.promise)
    api.save.mockResolvedValue(undefined)

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

    let switched!: Promise<void>
    act(() => {
      switched = latest.current!.applyNamed("layout-1")
    })
    act(() => {
      latest.current?.remember(tradePanelLayoutKey.workspaceHorizontal, newer)
    })
    expect(api.save).not.toHaveBeenCalled()

    await act(async () => {
      applying.resolve({
        legacyImported: true,
        current: {
          [tradePanelLayoutKey.workspaceHorizontal]: horizontal,
          [tradePanelLayoutKey.workspaceVertical]: {
            workspace: 65,
            activity: 35,
          },
        },
        named: [],
      })
      await switched
      await Promise.resolve()
    })

    expect(latest.current?.layouts.current).toMatchObject({
      [tradePanelLayoutKey.workspaceHorizontal]: newer,
      [tradePanelLayoutKey.workspaceVertical]: {
        workspace: 65,
        activity: 35,
      },
    })
    expect(api.save).toHaveBeenCalledWith(
      tradePanelLayoutKey.workspaceHorizontal,
      newer
    )
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
