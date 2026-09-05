// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import {
  DEFAULT_EXPLORER_VIEW,
  type ExplorerView,
} from "@/lib/trade/market-explorer"
import type { ExplorerRow } from "./explorer-rows"
import { ExplorerTable } from "./explorer-table"

vi.mock("./explorer-star", () => ({
  ExplorerStar: () => <button aria-label="Add to Fav">Star</button>,
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function row(index: number): ExplorerRow {
  return {
    key: `aster:mainnet:COIN${index}`,
    marketId: `COIN${index}`,
    symbol: `COIN${index}`,
    quoteAsset: "USDT",
    subExchange: null,
    category: "crypto",
    sizeDecimals: null,
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: null,
    price: index + 1,
    change24h: null,
    volume24hUsd: index + 100,
    fundingHourly: null,
    openInterestUsd: null,
    children: [],
    gap: null,
    windows: { 5: null, 60: null, 300: null },
    venue: {
      protocol: "aster",
      protocolLabel: "Aster",
      catalog: null,
      hidden: 0,
      orders: true,
      message: null,
    },
  }
}
const folders = {
  folders: {},
  busy: false,
  toggle: async () => {},
  create: async () => true,
}
async function draw(
  rows: ExplorerRow[],
  patch: {
    pending?: boolean
    failed?: boolean
    retry?: () => void
    view?: ExplorerView
    changeView?: (view: ExplorerView) => void
  } = {}
) {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <ExplorerTable
          rows={rows}
          view={patch.view ?? DEFAULT_EXPLORER_VIEW}
          changeView={patch.changeView ?? (() => {})}
          pending={patch.pending ?? false}
          failed={patch.failed ?? false}
          retry={patch.retry ?? (() => {})}
          folders={folders}
        />
      </TooltipProvider>
    )
  )
}
describe("Markets table", () => {
  it("virtualizes thousands of rows, sorts the initial values, and keeps missing figures blank", async () => {
    await draw(Array.from({ length: 3000 }, (_, index) => row(index)))
    expect(host.querySelectorAll("tbody tr").length).toBeLessThan(50)
    expect(host.querySelector("tbody a")?.textContent).toBe("COIN2999")
    expect(host.textContent).toContain("—")
    expect(
      host.querySelector(
        'a[href="/admin/aster?market=aster%3Amainnet%3ACOIN2999"]'
      )
    ).not.toBeNull()
  })
  it("keeps loading, failed, retry and clear-filter states inside the table", async () => {
    const retry = vi.fn(),
      change = vi.fn()
    await draw([], { pending: true })
    expect(host.querySelector("table")?.textContent).toContain(
      "Loading markets"
    )
    await draw([], { failed: true, retry })
    const button = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again"
    )!
    await act(async () => button.click())
    expect(retry).toHaveBeenCalledOnce()
    await draw([], { changeView: change })
    expect(host.querySelector("table")?.textContent).toContain(
      "0 markets match"
    )
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Clear filters")!
        .click()
    )
    expect(change).toHaveBeenCalledWith(DEFAULT_EXPLORER_VIEW)
  })
  it("sorts every two seconds and holds the order while a row has keyboard focus", async () => {
    vi.useFakeTimers()
    const view = { ...DEFAULT_EXPLORER_VIEW, liveSort: true }
    const rows = [row(0), row(1)]
    await draw(rows, { view })
    await act(async () =>
      host.querySelector<HTMLAnchorElement>("tbody a")!.focus()
    )
    await draw([{ ...rows[0], volume24hUsd: 9999 }, rows[1]], { view })
    await act(async () => vi.advanceTimersByTime(2000))
    expect(host.querySelector("tbody a")?.textContent).toBe("COIN1")
    await act(async () =>
      host.querySelector<HTMLAnchorElement>("tbody a")!.blur()
    )
    await act(async () => vi.advanceTimersByTime(2000))
    expect(host.querySelector("tbody a")?.textContent).toBe("COIN0")
  })
})

it("keeps a grouped coin's identity when the busiest exchange changes", async () => {
  const { explorerRows } = await import("./explorer-rows")
  const { MarketHistory } = await import("@/lib/trade/market-history")
  const first = row(0)
  const second = { ...row(0), key: "phemex:mainnet:COIN0", volume24hUsd: 50 }
  const catalog = {
    protocol: "aster" as const,
    protocolLabel: "Aster",
    network: "mainnet" as const,
    networkLabel: "Mainnet",
    picker: {
      categories: "crypto-only" as const,
      hip3: false,
      funding: true,
      openInterest: true,
    },
    rows: [first],
  }
  const venues = [
    { ...first.venue, catalog },
    {
      ...first.venue,
      protocol: "phemex" as const,
      protocolLabel: "Phemex",
      catalog: { ...catalog, protocol: "phemex" as const, rows: [second] },
    },
  ]
  const view = { ...DEFAULT_EXPLORER_VIEW, groupByCoin: true }
  const history = new MarketHistory()
  const before = explorerRows(venues, new Map(), history, 1_000_000, view)
  const after = explorerRows(
    [
      venues[0],
      {
        ...venues[1],
        catalog: {
          ...venues[1].catalog,
          rows: [{ ...second, volume24hUsd: 9999 }],
        },
      },
    ],
    new Map(),
    history,
    1_000_000,
    view
  )
  expect(before[0].key).not.toBe(after[0].key)
  expect(before[0].displayKey).toBe(after[0].displayKey)
  expect(
    explorerRows(venues, new Map(), history, 1_000_000, {
      ...view,
      exchanges: [],
    })
  ).toEqual([])
})

it("pages through the full results and returns to the first page when filters change", async () => {
  const rows = Array.from({ length: 125 }, (_, index) => row(index))
  await draw(rows)
  expect(
    host.querySelector('[data-slot="table-footer"]')?.textContent
  ).toContain("1-50 of 125")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Go to next page"]')!
      .click()
  )
  expect(
    host.querySelector('[data-slot="table-footer"]')?.textContent
  ).toContain("51-100 of 125")
  expect(host.querySelector("tbody a")?.textContent).toBe("COIN74")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Go to last page"]')!
      .click()
  )
  expect(
    host.querySelector('[data-slot="table-footer"]')?.textContent
  ).toContain("101-125 of 125")
  expect(
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="Go to next page"]'
    )!.disabled
  ).toBe(true)
  await draw(rows.slice(0, 3), {
    view: { ...DEFAULT_EXPLORER_VIEW, search: "filtered" },
  })
  expect(
    host.querySelector('[data-slot="table-footer"]')?.textContent
  ).toContain("1-3 of 3")
  expect(host.querySelector("tbody a")?.textContent).toBe("COIN2")
})

it("fills pages from markets that still match when live figures remove earlier rows", async () => {
  const rows = Array.from({ length: 125 }, (_, index) => row(index))
  await draw(rows)
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Go to next page"]')!
      .click()
  )
  // The filter is unchanged; live prices or volume can change which rows match.
  await draw(rows.slice(0, 60))
  expect(
    host.querySelector('[data-slot="table-footer"]')?.textContent
  ).toContain("51-60 of 60")
  expect(host.querySelector("tbody a")?.textContent).toBe("COIN9")
  expect(host.querySelectorAll("tr[aria-rowindex]")).toHaveLength(10)
})
