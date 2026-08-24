// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MarketFolderStar } from "@/components/trade/market-folder-star"
import { MarketFoldersPanel } from "@/components/trade/market-folders-panel"
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
vi.mock("@/lib/api/market-folders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/market-folders")>()),
  // Called rather than passed: `vi.mock` is hoisted above the const above it,
  // so the stub can only be reached once the module is actually used.
  savePanelLayout: (input: Parameters<typeof savePanelLayout>[0]) =>
    savePanelLayout(input),
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
    hiddenByVolumeKeys: [],
  },
]

/** The props every render shares; the watched read has landed empty. */
const shared = {
  protocol: "hyperliquid" as const,
  network: "mainnet" as const,
  marketsError: null,
  watchedOrders: {
    rows: [],
    cacheScope: "test",
    settled: true,
    failed: false,
    refusals: new Map(),
    onRetry: () => {},
  },
  walletName: () => "Practice",
  selectedMarketKey: null,
  panelRows: DEFAULT_MARKET_PANEL_ROWS,
  onFoldersChange: () => {},
  onPanelRowsChange: () => {},
  onSelectMarket: () => {},
  onRetryMarkets: () => {},
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

  it("keeps folders independent and opens their markets in the one panel", async () => {
    const savedFav = { ...fav, marketKeys: [btc.key] }
    const namedFolder: MarketFolder = {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Test",
      isFav: false,
      position: 1,
      hidden: false,
      marketKeys: [],
    }
    await act(async () => {
      root.render(
        <MarketFoldersPanel
          {...shared}
          folders={[savedFav, namedFolder]}
          catalogs={catalogs}
        />
      )
    })

    const folderPanel = host
    // Watched leads the panel and opens expanded; All markets closes it out.
    const toggles = Array.from(
      folderPanel.querySelectorAll("button[aria-expanded]")
    )
    expect(toggles[0]!.textContent).toContain("Watched")
    expect(toggles[0]!.getAttribute("aria-expanded")).toBe("true")
    expect(toggles.at(-1)!.textContent).toContain("All markets")
    expect(toggles.at(-1)!.getAttribute("aria-expanded")).toBe("false")
    const favToggle = toggles.find((one) => one.textContent?.includes("Fav"))!
    expect(folderPanel.textContent).toContain("Folders")
    const addFolder = folderPanel.querySelector(
      'button[aria-label="Add folder"]'
    )!
    await act(async () => click(addFolder))
    expect(
      folderPanel.querySelector('input[aria-label="Folder name"]')
    ).not.toBeNull()
    const manageFolders = folderPanel.querySelector(
      'button[aria-label="Manage folders"]'
    )!
    await act(async () => click(manageFolders))
    expect(document.body.textContent).toContain("Manage folders")
    expect(
      document.body.querySelector('input[aria-label="New folder name"]')
    ).not.toBeNull()
    expect(document.body.textContent).toContain("New folder")
    expect(document.body.textContent).toContain("Create")
    expect(document.body.textContent).toContain("Order")
    // Every row of the panel drags and hides, the two that are not folders
    // included, and only a named folder can be deleted.
    for (const name of ["Watched", "Fav", "Test", "All markets"]) {
      expect(
        document.body.querySelector(`button[aria-label="Reorder ${name}"]`)
      ).not.toBeNull()
      expect(
        document.body.querySelector(`button[aria-label="Hide ${name}"]`)
      ).not.toBeNull()
    }
    expect(
      document.body.querySelector('button[aria-label="Delete Test"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('button[aria-label="Delete Fav"]')
    ).toBeNull()
    expect(
      document.body.querySelector('input[aria-label="Rename Fav"]')
    ).toBeNull()
    expect(favToggle.textContent).toContain("1 market")
    // The one 12px gutter the whole panel shares, header and body alike.
    expect(favToggle.className).toContain("px-3")
    expect(favToggle.getAttribute("aria-expanded")).toBe("false")
    expect(folderPanel.textContent).not.toContain("BTC")

    await act(async () => click(favToggle))
    expect(favToggle.getAttribute("aria-expanded")).toBe("true")
    expect(favToggle.className).toContain("bg-muted/60")
    expect(favToggle.parentElement?.nextElementSibling?.className).toContain(
      "bg-muted/60"
    )
    expect(folderPanel.textContent).toContain("BTC")
    const expandedMarket = Array.from(
      folderPanel.querySelectorAll("button")
    ).find((button) => button.textContent?.includes("BTC"))!
    // Edge to edge: no rounding anywhere on a list row any more, so the fill
    // reaches the panel's sides.
    expect(expandedMarket.className).not.toContain("rounded")
    expect(expandedMarket.className).not.toContain("border-b")
    expect(expandedMarket.className).toContain("px-3")
    const testToggle = Array.from(
      folderPanel.querySelectorAll('button[aria-expanded="false"]')
    ).find((button) => button.textContent?.includes("Test"))!
    expect(testToggle.className).toContain("hover:bg-muted")
    expect(testToggle.parentElement?.className).toContain("border-t")
  })

  it("follows the saved order and leaves a switched-off row out", async () => {
    const named: MarketFolder = {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Daily",
      isFav: false,
      position: 1,
      hidden: true,
      marketKeys: [],
    }
    await act(async () => {
      root.render(
        <MarketFoldersPanel
          {...shared}
          folders={[fav, named]}
          catalogs={catalogs}
          // All markets dragged above everything, Watched switched off.
          panelRows={{
            all: { position: -2, hidden: false },
            watched: { position: -1, hidden: true },
          }}
        />
      )
    })

    const toggles = Array.from(host.querySelectorAll("button[aria-expanded]"))
    expect(toggles.map((one) => one.textContent)).toHaveLength(2)
    expect(toggles[0]!.textContent).toContain("All markets")
    expect(toggles[1]!.textContent).toContain("Fav")
    expect(host.textContent).not.toContain("Watched")
    expect(host.textContent).not.toContain("Daily")

    // Both switched-off rows are still in the cog window, saying so, with an
    // eye that offers to bring them back.
    await act(async () =>
      click(host.querySelector('button[aria-label="Manage folders"]')!)
    )
    expect(
      document.body.querySelector('button[aria-label="Show Watched"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('button[aria-label="Show Daily"]')
    ).not.toBeNull()
    expect(document.body.textContent).toContain("Hidden")
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
        <MarketFoldersPanel
          {...shared}
          folders={[fav, named]}
          catalogs={catalogs}
        />
      )
    })

    await act(async () =>
      click(host.querySelector('button[aria-label="Manage folders"]')!)
    )
    await act(async () =>
      click(document.body.querySelector('button[aria-label="Hide Daily"]')!)
    )

    expect(savePanelLayout).toHaveBeenCalledWith({
      protocol: "hyperliquid",
      network: "mainnet",
      rowIds: ["watched", fav.id, named.id, "all"],
      hiddenRowIds: [named.id],
    })
  })

  it("lets Fav be renamed from the cog window", async () => {
    await act(async () => {
      root.render(
        <MarketFoldersPanel {...shared} folders={[fav]} catalogs={catalogs} />
      )
    })

    await act(async () =>
      click(host.querySelector('button[aria-label="Manage folders"]')!)
    )
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

  it("does not call a volume-hidden folder empty", async () => {
    await act(async () => {
      root.render(
        <MarketFoldersPanel
          {...shared}
          folders={[{ ...fav, marketKeys: [btc.key] }]}
          catalogs={[
            { ...catalogs[0], rows: [], hiddenByVolumeKeys: [btc.key] },
          ]}
        />
      )
    })

    const favToggle = host.querySelector('button[aria-expanded="false"]')!
    await act(async () => click(favToggle))
    expect(host.textContent).toContain(
      "Fav's markets are hidden by your daily volume setting."
    )
    expect(host.textContent).not.toContain("Fav is empty")
  })
})
