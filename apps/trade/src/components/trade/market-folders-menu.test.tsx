// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("@/lib/api/trade/market-folders", () => ({
  createFolder: api.create,
  getMarketFolderErrorMessage: () => "Folder failed.",
}))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: toast }))

vi.mock("@/components/trade/market-list-panel", () => ({
  MarketRowLine: ({
    row,
    onSelect,
  }: {
    row: { key: string; symbol: string }
    onSelect: (key: string) => void
  }) => (
    <button type="button" onClick={() => onSelect(row.key)}>
      {row.symbol}
    </button>
  ),
}))

vi.mock("@/components/trade/market-folders-manager", () => ({
  MarketFoldersManager: ({ manageOpen }: { manageOpen: boolean }) =>
    manageOpen ? <div data-testid="manage-folders" /> : null,
}))

import {
  FoldersBlockMenuRows,
  MarketFoldersMenu,
} from "@/components/trade/market-folders-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { TooltipProvider } from "@/components/ui/tooltip"

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  vi.clearAllMocks()
  api.create.mockResolvedValue([])
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (HTMLElement.prototype as { hasPointerCapture?: unknown })
    .hasPointerCapture
  delete (HTMLElement.prototype as { setPointerCapture?: unknown })
    .setPointerCapture
  delete (HTMLElement.prototype as { releasePointerCapture?: unknown })
    .releasePointerCapture
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe("the Folders block", () => {
  it.each([false, true])(
    "respects visibility and selects markets, hidden=%s",
    async (hidden) => {
      const select = vi.fn()
      const foldersChange = vi.fn()
      await act(async () => {
        root.render(
          <TooltipProvider>
            <MarketFoldersMenu
              panelRows={{
                all: { position: 2, hidden },
                hiddenMarketKeys: [],
              }}
              marketsError={null}
              marketsPending={false}
              onRetryMarkets={vi.fn()}
              folders={[
                {
                  id: "fav",
                  name: "Favorites",
                  isFav: true,
                  position: -1,
                  hidden,
                  marketKeys: [],
                },
                {
                  id: "folder-1",
                  name: "Majors",
                  isFav: false,
                  position: 0,
                  hidden: false,
                  marketKeys: ["hyperliquid:mainnet:BTC"],
                },
              ]}
              protocol="hyperliquid"
              network="mainnet"
              catalogs={[
                {
                  rows: [
                    {
                      key: "hyperliquid:mainnet:BTC",
                      symbol: "BTC",
                      change24h: 1,
                      volume24hUsd: 1,
                    },
                  ],
                  hiddenByVolumeRows: [],
                } as never,
              ]}
              selectedMarketKey={null}
              onFoldersChange={foldersChange}
              onPanelRowsChange={vi.fn()}
              managing={false}
              onManagingChange={vi.fn()}
              onSelectMarket={select}
            />
          </TooltipProvider>
        )
      })

      // Drawn in place as a block's body: nothing to open first.
      expect(document.body.textContent).toContain("Majors")
      expect(document.body.textContent).not.toContain("Watched")
      expect(document.body.textContent?.includes("All markets")).toBe(!hidden)
      expect(document.body.textContent?.includes("Favorites")).toBe(!hidden)
      // No buttons of its own: a new folder and Manage folders are in the
      // block's ⋮ (Tyler, 8 Nov 2026).
      expect(document.querySelector('button[aria-label="Add folder"]')).toBeNull()
      expect(document.querySelector('button[aria-label="Manage folders"]')).toBeNull()
      expect(foldersChange).not.toHaveBeenCalled()

      await act(async () => buttonWithText("Majors1").click())
      expect(document.body.textContent).toContain("BTC")
      await act(async () => buttonWithText("BTC").click())
      expect(select).toHaveBeenCalledWith("hyperliquid:mainnet:BTC")
      // The pick puts that coin on the chart and leaves the folder open, so
      // the next coin is one press away.
      expect(document.body.textContent).toContain("BTC")

    }
  )

  it("makes a folder and opens Manage folders from the block's ⋮", async () => {
    const manage = vi.fn()
    const foldersChange = vi.fn()
    await act(async () => {
      root.render(
        <DropdownMenu open>
          <DropdownMenuTrigger />
          <DropdownMenuContent>
            <FoldersBlockMenuRows
              protocol="hyperliquid"
              network="mainnet"
              folders={[]}
              onFoldersChange={foldersChange}
              onManage={manage}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )
    })
    const input = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="New folder name"]'
    )!
    // Never greyed out: an empty press says what is missing and makes nothing.
    const add = document.body.querySelector<HTMLButtonElement>('button[aria-label="Add folder"]')!
    expect(add.disabled).toBe(false)
    await act(async () => add.click())
    expect(api.create).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith("Type the folder's name first.")
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!
    await act(async () => {
      setValue.call(input, "Momentum")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      input
        .closest("form")
        ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(api.create).toHaveBeenCalledWith({
      protocol: "hyperliquid",
      network: "mainnet",
      name: "Momentum",
    })
    // Shown at once, before the server answers, then the saved list.
    expect(foldersChange.mock.calls[0][0]).toMatchObject([{ name: "Momentum", marketKeys: [] }])
    expect(foldersChange).toHaveBeenLastCalledWith([])
    expect(input.value).toBe("")

    const item = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(
      (one) => one.textContent?.includes("Manage folders")
    ) as HTMLElement
    await act(async () => item.click())
    expect(manage).toHaveBeenCalledTimes(1)
  })
})

function buttonWithText(text: string) {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find((candidate) => candidate.textContent === text)
  if (!found) throw new Error(`Missing ${text}`)
  return found
}
