// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("@/lib/api/trade/market-folders", () => ({
  createFolder: api.create,
  getMarketFolderErrorMessage: () => "Folder failed.",
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

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

import { MarketFoldersMenu } from "@/components/trade/market-folders-menu"
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

describe("the folders menu", () => {
  it("opens on hover and selects a market from a folder", async () => {
    const select = vi.fn()
    const manage = vi.fn()
    const foldersChange = vi.fn()
    await act(async () => {
      root.render(
        <TooltipProvider>
          <MarketFoldersMenu
            folders={[
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
            onManage={manage}
            onSelectMarket={select}
          />
        </TooltipProvider>
      )
    })

    expect(button("Open folders").dataset.slot).toBe("popover-trigger")
    await act(async () => {
      button("Open folders").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true })
      )
    })
    expect(document.body.textContent).toContain("Folders")
    expect(document.body.textContent).toContain("Majors")
    expect(button("Add folder")).not.toBeNull()
    expect(button("Manage folders")).not.toBeNull()
    const popover = document.body.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(popover?.className).not.toContain("h-[28rem]")

    await act(async () => button("Add folder").click())
    expect(
      document.body.querySelector("#new-market-folder-menu-name")
    ).not.toBeNull()
    const input = document.body.querySelector<HTMLInputElement>(
      "#new-market-folder-menu-name"
    )!
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
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })
    expect(api.create).toHaveBeenCalledWith({
      protocol: "hyperliquid",
      network: "mainnet",
      name: "Momentum",
    })
    expect(foldersChange).toHaveBeenCalledWith([])

    await act(async () => buttonWithText("Majors1").click())
    expect(document.body.textContent).toContain("BTC")
    await act(async () => buttonWithText("BTC").click())
    expect(select).toHaveBeenCalledWith("hyperliquid:mainnet:BTC")
    // The pick puts that coin on the chart and leaves the menu up, so the
    // next coin in the folder is one press away. Manage folders below is
    // pressed without reopening anything, which is the proof it stayed.
    expect(
      document.body.querySelector('[data-slot="popover-content"]')
    ).not.toBeNull()

    await act(async () => button("Manage folders").click())
    expect(manage).toHaveBeenCalledTimes(1)
  })
})

function button(name: string) {
  const found = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${name}"]`
  )
  if (!found) throw new Error(`Missing ${name}`)
  return found
}

function buttonWithText(text: string) {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find((candidate) => candidate.textContent === text)
  if (!found) throw new Error(`Missing ${text}`)
  return found
}
