// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MarketFolderStar } from "@/components/trade/market-folder-star"
import { MarketFoldersPanel } from "@/components/trade/market-folders-panel"
import { MarketListPanel } from "@/components/trade/market-list-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketKey, MarketRow } from "@/lib/protocols/contracts"
import type { MarketFolder } from "@/lib/trade/market-folders"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const fav: MarketFolder = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Fav",
  isFav: true,
  position: 0,
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

  it("keeps folders independent and opens their markets in the lower panel", async () => {
    const savedFav = { ...fav, marketKeys: [btc.key] }
    const namedFolder: MarketFolder = {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Test",
      isFav: false,
      position: 1,
      marketKeys: [],
    }
    function LeftColumn() {
      return (
        <div>
          <section data-testid="market-panel">
            <MarketListPanel
              catalogs={catalogs}
              marketsError={null}
              network="mainnet"
              watchedOrders={{
                rows: [],
                cacheScope: "test",
                settled: true,
                failed: false,
                refusals: new Map(),
                onRetry: () => {},
              }}
              walletName={() => "Practice"}
              selectedKey={null}
              onSelect={() => {}}
              onRetry={() => {}}
            />
          </section>
          <section data-testid="folder-panel">
            <MarketFoldersPanel
              folders={[savedFav, namedFolder]}
              protocol="hyperliquid"
              network="mainnet"
              catalogs={catalogs}
              selectedMarketKey={null}
              onFoldersChange={() => {}}
              onSelectMarket={() => {}}
            />
          </section>
        </div>
      )
    }
    await act(async () => {
      root.render(<LeftColumn />)
    })

    const marketPanel = host.querySelector('[data-testid="market-panel"]')!
    const folderPanel = host.querySelector('[data-testid="folder-panel"]')!
    const favToggle = folderPanel.querySelector(
      'button[aria-expanded="false"]'
    )!
    expect(marketPanel.textContent).not.toContain("Fav")
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
    expect(document.body.textContent).toContain("Fav always stays first")
    expect(
      document.body.querySelector('input[aria-label="New folder name"]')
    ).not.toBeNull()
    expect(document.body.textContent).toContain("New folder")
    expect(document.body.textContent).toContain("Create")
    expect(document.body.textContent).toContain("Order")
    expect(document.body.textContent).toContain("Always first")
    expect(favToggle.textContent).toContain("1 market")
    expect(favToggle.className).toContain("sm:px-5")
    expect(favToggle.getAttribute("aria-expanded")).toBe("false")
    expect(folderPanel.textContent).not.toContain("BTC")

    await act(async () => click(favToggle))
    expect(favToggle.getAttribute("aria-expanded")).toBe("true")
    expect(folderPanel.textContent).toContain("BTC")
    expect(marketPanel.textContent).not.toContain("BTC")
    const expandedMarket = Array.from(
      folderPanel.querySelectorAll("button")
    ).find((button) => button.textContent?.includes("BTC"))!
    expect(expandedMarket.className).toContain("rounded-none")
    expect(expandedMarket.className).not.toContain("border-b")
    expect(expandedMarket.className).toContain("sm:px-5")
    const testToggle = Array.from(
      folderPanel.querySelectorAll('button[aria-expanded="false"]')
    ).find((button) => button.textContent?.includes("Test"))!
    expect(testToggle.parentElement?.className).toContain("border-t")
  })

  it("does not call a volume-hidden folder empty", async () => {
    await act(async () => {
      root.render(
        <MarketFoldersPanel
          folders={[{ ...fav, marketKeys: [btc.key] }]}
          protocol="hyperliquid"
          network="mainnet"
          catalogs={[
            { ...catalogs[0], rows: [], hiddenByVolumeKeys: [btc.key] },
          ]}
          selectedMarketKey={null}
          onFoldersChange={() => {}}
          onSelectMarket={() => {}}
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
