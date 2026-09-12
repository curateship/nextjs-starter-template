// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AllMarketsList } from "@/components/trade/market-list-panel"
import { MarketPicker } from "@/components/trade/market-picker"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketRow } from "@/lib/protocols/contracts"
import type {
  MarketFolder,
  MarketFolderActions,
} from "@/lib/trade/market-folders"
import fixture from "@/server/protocols/solana/jupiter.fixture.json"
import { toSolanaMarketCatalog } from "@/server/protocols/solana/markets"

/**
 * The Solana list drawn from Jupiter's real answers: the warning badge on a
 * coin the venue flagged, and the lookup the picker offers when a search
 * matches nothing loaded. Rendered here because the running app has no
 * Jupiter key on this machine, so this is the closest runtime that draws the
 * real components with real rows.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("@/lib/api/trade/markets", () => ({
  getMarketsErrorMessage: () => "The lookup failed.",
}))

const catalog = toSolanaMarketCatalog({
  network: "mainnet",
  verified: fixture.verified,
  topTraded: fixture.topTraded,
})
const rows = catalog.rows
const fav: MarketFolder = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Fav",
  isFav: true,
  position: 0,
  hidden: false,
  marketKeys: [],
}
const folderActions: MarketFolderActions = {
  busy: false,
  quickAdd: () => {},
  toggle: async () => {},
  create: async () => true,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  window.localStorage.clear()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function openPicker(
  onSearchBeyond?: (query: string) => Promise<MarketRow[]>,
  shown: MarketRow[] = rows
) {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MarketPicker
          rows={shown}
          selected={shown[0]}
          capabilities={catalog.picker}
          folders={[fav]}
          folderActions={folderActions}
          onSelect={() => {}}
          venueLabel={catalog.protocolLabel}
          onSearchBeyond={onSearchBeyond}
        />
      </TooltipProvider>
    )
  )
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>('[aria-label="Choose market"]')!
      .click()
  })
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Search markets"]')!
      .click()
  )
}

function type(text: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search markets"]'
  )!
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!
  setter.call(input, text)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

const bodyText = () => document.body.textContent ?? ""

describe("the Solana list", () => {
  it.each(["broken json", '{"views":["old-filter"],"categories":[]}'])(
    "ignores unreadable saved filters: %s",
    async (saved) => {
      window.localStorage.setItem("trade-market-picker-filters", saved)
      await openPicker()
      expect(
        document.querySelector('[aria-label="Filter markets"]')?.textContent
      ).toBe("All markets")
      expect(document.querySelectorAll("tbody tr").length).toBeGreaterThan(0)
    }
  )

  it("keeps a pinned picker open outside the pointer and moves it with arrow keys", async () => {
    await openPicker()
    const panel = document.querySelector<HTMLElement>('[aria-label="Markets"]')!
    const bounds = vi
      .spyOn(panel, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(20, 30, 400, 400))
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Pin markets"]')!
        .click()
    )
    expect(
      document.querySelector('button[aria-label="Unpin markets"]')
    ).not.toBeNull()
    const leave = new MouseEvent("pointerout", {
      bubbles: true,
      relatedTarget: document.body,
    })
    Object.defineProperty(leave, "pointerType", { value: "mouse" })
    await act(async () => {
      panel.dispatchEvent(leave)
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
    expect(document.querySelector('[aria-label="Markets"]')).toBe(panel)
    const drag = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Drag markets"]'
    )!
    await act(async () =>
      drag.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      )
    )
    expect(bounds).toHaveBeenCalled()
    expect(panel.textContent).not.toContain("Open interest")
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Unpin markets"]')!
        .click()
    )
    await act(async () => {
      panel.dispatchEvent(leave)
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
    expect(document.querySelector('[aria-label="Markets"]')).toBeNull()
    bounds.mockRestore()
  })
  it("prints the venue's warning beside a flagged coin and nowhere else", async () => {
    await act(async () =>
      root.render(
        <AllMarketsList
          catalogs={[{ ...catalog, hiddenByVolumeRows: [] }]}
          hiddenKeys={new Set()}
          onHide={() => {}}
          marketsError={null}
          marketsPending={false}
          selectedKey={null}
          onSelect={() => {}}
          onRetry={() => {}}
        />
      )
    )
    const text = bodyText()
    expect(text).toContain("stORE")
    expect(text).toContain("Suspicious")
    expect(text).toContain("Unverified")
    // One badge per warned coin, none on the verified ones.
    const badges = [...host.querySelectorAll("span[title]")].filter((one) =>
      /vouched|audit/.test(one.getAttribute("title") ?? "")
    )
    expect(badges).toHaveLength(
      rows.filter((row) => row.caution !== null).length
    )
    // A coin with no day's figures shows a dash, never a zero.
    expect(text).toContain("—")
  })

  it("combines checkbox filters and keeps only three market columns", async () => {
    const shown: MarketRow[] = [
      {
        ...rows[0],
        key: "solana:mainnet:crypto",
        symbol: "COIN",
        category: "crypto",
        volume24hUsd: 300,
      },
      {
        ...rows[0],
        key: "solana:mainnet:stock",
        symbol: "STOCK",
        category: "stocks",
        volume24hUsd: 200,
      },
      {
        ...rows[0],
        key: "solana:mainnet:gold",
        symbol: "GOLD",
        category: "commodities",
        volume24hUsd: 100,
      },
    ]
    await openPicker(undefined, shown)
    expect(
      [...document.querySelectorAll("th")].map((cell) => cell.textContent)
    ).toEqual(["Market", "24h change", "Volume"])
    expect(document.querySelector('[role="tablist"]')).toBeNull()
    await act(async () =>
      document
        .querySelector('[aria-label="Filter markets"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
    )
    const check = async (label: string) => {
      const item = [
        ...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'),
      ].find((item) => item.textContent === label)!
      expect(item).toBeDefined()
      await act(async () => item.click())
    }
    const table = () => document.querySelector("tbody")!.textContent!
    await check("Crypto")
    expect(table()).toContain("COIN")
    expect(table()).not.toContain("STOCK")
    await check("TradFi")
    expect(table()).toContain("COIN")
    expect(table()).toContain("STOCK")
    expect(table()).toContain("GOLD")
    await check("Stocks")
    expect(table()).toContain("STOCK")
    expect(table()).not.toContain("GOLD")
    await act(async () => root.render(null))
    await openPicker(undefined, shown)
    expect(table()).toContain("COIN")
    expect(table()).toContain("STOCK")
    expect(table()).not.toContain("GOLD")
    await act(async () =>
      document
        .querySelector('[aria-label="Filter markets"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
    )
    await check("Commodities")
    expect(table()).toContain("GOLD")
    await check("Crypto")
    expect(table()).not.toContain("COIN")
    await check("All markets")
    expect(document.querySelectorAll("tbody tr")).toHaveLength(3)
    await check("Favorites")
    expect(bodyText()).toContain("No matching markets.")
    await check("Favorites")
    expect(document.querySelectorAll("tbody tr")).toHaveLength(3)
  })

  it("offers to look a coin up on Solana when nothing loaded matches", async () => {
    const found: MarketRow = {
      ...rows[0],
      key: "solana:mainnet:FoundMint111111111111111111111111111111111",
      marketId: "FoundMint111111111111111111111111111111111",
      symbol: "WIF",
      caution: "unverified",
    }
    const lookup = vi.fn(async (query: string) =>
      query === "WIF" ? [found] : []
    )
    await openPicker(lookup)
    await act(async () => type("WIF"))
    expect(bodyText()).toContain("No matching markets.")
    const button = [...document.querySelectorAll("button")].find((one) =>
      one.textContent?.includes('Find "WIF" on Solana')
    )
    expect(button).toBeDefined()

    await act(async () => button!.click())
    expect(lookup).toHaveBeenCalledWith("WIF")

    // Nothing there: the picker says so instead of going quiet.
    await act(async () => type("ZZZ"))
    const miss = [...document.querySelectorAll("button")].find((one) =>
      one.textContent?.includes('Find "ZZZ" on Solana')
    )
    await act(async () => miss!.click())
    expect(bodyText()).toContain("Nothing on Solana is called that")
  })

  it("draws a found coin once the page has folded it into the list", async () => {
    const found: MarketRow = {
      ...rows[0],
      key: "solana:mainnet:FoundMint111111111111111111111111111111111",
      marketId: "FoundMint111111111111111111111111111111111",
      symbol: "WIF",
      caution: "unverified",
    }
    await openPicker(undefined, [...rows, found])
    await act(async () => type("WIF"))
    expect(bodyText()).toContain("WIF-USDC")
    expect(bodyText()).toContain("Unverified")
    expect(bodyText()).not.toContain("No matching markets.")
  })

  it("shows a found coin even when it has no volume to speak of", async () => {
    // The list hides a row with no day's volume, which is right for a
    // catalogue of thousands and wrong for the one coin somebody just asked
    // for by name. Solana had 900 coins of 3,189 with no day's figures, so
    // this is the ordinary case, not a corner: without the fix the lookup
    // succeeded, the row arrived, and the picker swallowed it in silence.
    const quiet: MarketRow = {
      ...rows[0],
      key: "solana:mainnet:QuietMint1111111111111111111111111111111111",
      marketId: "QuietMint1111111111111111111111111111111111",
      symbol: "QUIET",
      volume24hUsd: 0,
      change24h: null,
      caution: "unverified",
    }
    await openPicker(async () => [quiet], [...rows, quiet])
    await act(async () => type("QUIET"))
    // Hidden until it is asked for: it has no volume.
    expect(bodyText()).toContain("No matching markets.")

    const button = [...document.querySelectorAll("button")].find((one) =>
      one.textContent?.includes('Find "QUIET" on Solana')
    )
    await act(async () => button!.click())
    expect(bodyText()).toContain("QUIET-USDC")
    expect(bodyText()).not.toContain("No matching markets.")
  })

  it("never offers the lookup on a venue that has none", async () => {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <MarketPicker
            rows={rows}
            selected={rows[0]}
            capabilities={{ ...catalog.picker, search: false }}
            folders={[fav]}
            folderActions={folderActions}
            onSelect={() => {}}
            venueLabel="Solana"
            onSearchBeyond={async () => []}
          />
        </TooltipProvider>
      )
    )
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('[aria-label="Choose market"]')!
        .click()
    })
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Search markets"]'
        )!
        .click()
    )
    await act(async () => type("WIF"))
    expect(bodyText()).toContain("No matching markets.")
    expect(bodyText()).not.toContain("Find ")
  })
})
