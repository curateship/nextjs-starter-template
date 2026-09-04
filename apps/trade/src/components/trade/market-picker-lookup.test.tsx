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
    host.querySelector<HTMLButtonElement>('[aria-label="Choose market"]')!.click()
  })
}

function type(text: string) {
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="Search markets"]'
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
  it("prints the venue's warning beside a flagged coin and nowhere else", async () => {
    await act(async () =>
      root.render(
        <AllMarketsList
          catalogs={[{ ...catalog, hiddenByVolumeRows: [] }]}
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

  it("offers the category tabs, because tokenised stocks are in the list", async () => {
    await openPicker()
    expect(bodyText()).toContain("Crypto")
    expect(bodyText()).toContain("TradFi")
    expect(bodyText()).toContain("SOL-USDC")
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
      host.querySelector<HTMLButtonElement>('[aria-label="Choose market"]')!.click()
    })
    await act(async () => type("WIF"))
    expect(bodyText()).toContain("No matching markets.")
    expect(bodyText()).not.toContain("Find ")
  })
})
