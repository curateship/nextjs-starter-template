// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

type Item = { exchange: string; walletId: string; walletLabel: string }

const items: Item[] = [
  { exchange: "Aster", walletId: "wallet-2", walletLabel: "Second" },
  { exchange: "Aster", walletId: "wallet-2", walletLabel: "Second" },
  { exchange: "Phemex", walletId: "wallet-1", walletLabel: "Main" },
]

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<Harness />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function Harness() {
  const [firstExchange, setFirstExchange] = useState<string | null>(null)
  const [firstWallet, setFirstWallet] = useState<string | null>(null)
  const [secondExchange, setSecondExchange] = useState<string | null>(null)
  const [secondWallet, setSecondWallet] = useState<string | null>(null)

  const filter = (
    exchange: string | null,
    wallet: string | null,
    setExchange: (value: string | null) => void,
    setWallet: (value: string | null) => void
  ) => (
    <CountedFilterPopover
      items={items}
      groups={[
        {
          label: "Exchange",
          value: exchange,
          valueOf: (item) => item.exchange,
          onChange: setExchange,
        },
        {
          label: "Wallet",
          value: wallet,
          valueOf: (item) => item.walletId,
          labelOf: (item) => item.walletLabel,
          onChange: setWallet,
        },
      ]}
      onClear={() => {
        setExchange(null)
        setWallet(null)
      }}
    />
  )

  return (
    <>
      {filter(firstExchange, firstWallet, setFirstExchange, setFirstWallet)}
      {filter(secondExchange, secondWallet, setSecondExchange, setSecondWallet)}
    </>
  )
}

function buttons(name: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === name
  )
}

async function settlePopover(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("the counted filter popover", () => {
  it("counts options and keeps two widget filters independent", async () => {
    const triggers = buttons("Filter")
    expect(triggers).toHaveLength(2)

    await act(async () => triggers[0].click())
    expect(document.body.textContent).toContain("Exchange")
    expect(buttons("Aster2")).toHaveLength(1)
    expect(buttons("Phemex1")).toHaveLength(1)
    expect(buttons("Second2")).toHaveLength(1)
    expect(buttons("Main1")).toHaveLength(1)

    await act(async () => buttons("Aster2")[0].click())
    expect(buttons("Filter (1)")).toHaveLength(1)
    expect(buttons("Filter")).toHaveLength(1)

    await act(async () => buttons("Done")[0].click())
    await settlePopover()
    await act(async () => buttons("Filter")[0].click())
    await settlePopover()
    await act(async () => buttons("Phemex1")[0].click())

    expect(buttons("Filter (1)")).toHaveLength(2)
    await act(async () => buttons("Clear all")[0].click())
    expect(buttons("Filter (1)")).toHaveLength(1)
    expect(buttons("Filter")).toHaveLength(1)
  })

  it("closes from the keyboard", async () => {
    await act(async () => buttons("Filter")[0].click())
    expect(buttons("Done")).toHaveLength(1)

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(buttons("Done")).toHaveLength(0)
  })
})
