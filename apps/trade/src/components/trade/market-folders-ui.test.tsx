// @vitest-environment jsdom

import { act, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MarketFolderStar } from "@/components/trade/market-folder-star"
import { MarketFoldersManager } from "@/components/trade/market-folders-manager"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketKey, MarketRow } from "@/lib/protocols/contracts"
import {
  DEFAULT_MARKET_PANEL_ROWS,
  type MarketFolder,
} from "@/lib/trade/market-folders"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// The panel's saves are server functions, which cannot run in jsdom. Only the
// layout save is stubbed; everything else in the module stays real.
const savePanelLayout = vi.fn(
  async (_input: {
    protocol: string
    network: string
    rowIds: string[]
    hiddenRowIds: string[]
  }) => ({
    folders: [] as MarketFolder[],
    panelRows: DEFAULT_MARKET_PANEL_ROWS,
  })
)
const setHiddenMarket = vi.fn(
  async (input: {
    protocol: string
    network: string
    marketKey: string
    hidden: boolean
  }) => ({
    ...DEFAULT_MARKET_PANEL_ROWS,
    hiddenMarketKeys: input.hidden ? [input.marketKey] : [],
  })
)
vi.mock("@/lib/api/trade/market-folders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trade/market-folders")>()),
  // Called rather than passed: `vi.mock` is hoisted above the const above it,
  // so the stub can only be reached once the module is actually used.
  savePanelLayout: (input: Parameters<typeof savePanelLayout>[0]) =>
    savePanelLayout(input),
  setHiddenMarket: (input: Parameters<typeof setHiddenMarket>[0]) =>
    setHiddenMarket(input),
}))

const fav: MarketFolder = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Fav",
  isFav: true,
  position: 0,
  hidden: false,
  marketKeys: [],
}

const btc: MarketRow = {
  key: "hyperliquid:mainnet:BTC" as MarketKey,
  marketId: "BTC",
  symbol: "BTC",
  quoteAsset: "USDC",
  subExchange: null,
  category: "crypto",
  sizeDecimals: 3,
  priceTick: null,
  minOrderValueUsd: null,
  maxLeverage: 40,
  isolatedOnly: false,
  iconUrl: null,
  price: 100,
  change24h: 0.01,
  volume24hUsd: 1_000_000,
  fundingHourly: null,
  openInterestUsd: null,
}

const catalogs = [
  {
    protocol: "hyperliquid" as const,
    protocolLabel: "Hyperliquid",
    network: "mainnet" as const,
    networkLabel: "Mainnet",
    picker: {
      categories: "full" as const,
      hip3: true,
      funding: true,
      openInterest: true,
    },
    rows: [btc],
    hiddenByVolumeRows: [],
  },
]

/** The props every render shares. */
const shared = {
  protocol: "hyperliquid" as const,
  network: "mainnet" as const,
  marketsError: null,
  marketsPending: false,
  selectedMarketKey: null,
  panelRows: DEFAULT_MARKET_PANEL_ROWS,
  onFoldersChange: () => {},
  onPanelRowsChange: () => {},
  onSelectMarket: () => {},
  onRetryMarkets: () => {},
}

function TestMarketFoldersManager(
  props: ComponentProps<typeof MarketFoldersManager>
) {
  return <MarketFoldersManager {...props} manageOpen />
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0 })
  )
  ;(element as HTMLElement).click()
}

describe("the market folder controls", () => {
  it("keeps the header star styling and adds an empty market to Fav", async () => {
    const quickAdd = vi.fn()
    await act(async () => {
      root.render(
        <TooltipProvider>
          <MarketFolderStar
            symbol="BTC"
            marketKey="hyperliquid:mainnet:BTC"
            folders={[fav]}
            busy={false}
            onQuickAdd={quickAdd}
            onToggle={async () => {}}
            onCreate={async () => true}
          />
        </TooltipProvider>
      )
    })

    const star = host.querySelector('button[aria-label="Add BTC to Fav"]')!
    expect(star.className).toContain("focus-visible:outline-solid")
    await act(async () => click(star))
    expect(quickAdd).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain("Save to folder")
  })

  it("keeps the picker-row star styling and opens folders when filled", async () => {
    const createFolder = vi.fn(async () => false)
    await act(async () => {
      root.render(
        <MarketFolderStar
          compact
          symbol="BTC"
          marketKey="hyperliquid:mainnet:BTC"
          folders={[{ ...fav, marketKeys: ["hyperliquid:mainnet:BTC"] }]}
          busy={false}
          onQuickAdd={() => {}}
          onToggle={async () => {}}
          onCreate={createFolder}
        />
      )
    })

    const star = host.querySelector(
      'button[aria-label="Choose folders for BTC"]'
    )!
    expect(star.className).toContain("text-muted-foreground/50")
    expect(star.className).toContain("p-0.5")
    await act(async () => click(star))
    expect(document.body.textContent).toContain("Save to folder")
    expect(document.body.textContent).not.toContain("New folder")
    expect(
      document.body.querySelector('input[aria-label="Folder name"]')
    ).not.toBeNull()
    const input = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Folder name"]'
    )!
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!
    await act(async () => {
      setValue.call(input, "Daily")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const create = document.body.querySelector(
      'button[aria-label="Create folder"]'
    )!
    await act(async () => click(create))
    expect(createFolder).toHaveBeenCalledWith("Daily")
    expect(input.value).toBe("Daily")
  })

  it("sends the whole arrangement when an eye is pressed", async () => {
    savePanelLayout.mockClear()
    const named: MarketFolder = {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Daily",
      isFav: false,
      position: 1,
      hidden: false,
      marketKeys: [],
    }
    await act(async () => {
      root.render(
        <TooltipProvider>
          <TestMarketFoldersManager
            {...shared}
            folders={[fav, named]}
            catalogs={catalogs}
          />
        </TooltipProvider>
      )
    })

    await act(async () =>
      click(document.body.querySelector('button[aria-label="Hide Daily"]')!)
    )

    expect(savePanelLayout).toHaveBeenCalledWith({
      protocol: "hyperliquid",
      network: "mainnet",
      rowIds: [fav.id, named.id, "all"],
      hiddenRowIds: [named.id],
    })
  })

  it("lets Fav be renamed from the cog window", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <TestMarketFoldersManager
            {...shared}
            folders={[fav]}
            catalogs={catalogs}
          />
        </TooltipProvider>
      )
    })

    // Inside the window, not the panel behind it: both list a row called Fav.
    const dialog = document.body.querySelector('[role="dialog"]')!
    const favRow = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent?.trim().startsWith("Fav")
    )!
    await act(async () => click(favRow))
    expect(
      document.body.querySelector('input[aria-label="Rename Fav"]')
    ).not.toBeNull()
  })
})
