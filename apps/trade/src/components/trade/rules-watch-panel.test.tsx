// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("@/lib/trade/live-market", () => ({ useLiveFigures: () => null }))

import { RulesWatchPanel } from "./rules-watch-panel"
import {
  DEFAULT_TRADING_RULES,
  newTradingRule,
} from "@/lib/trade/trading-rules"
import type { RuleFacts } from "@/lib/trade/trading-rules"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, host: HTMLDivElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

const factsFor = () => ({}) as RuleFacts

/**
 * **The Rules box lives in the left panel** (Tyler, 15 Oct 2026), and stays
 * on screen with nothing to check, saying why.
 */
it("says why nothing is checked", async () => {
  const draw = (idleNote: string | null) =>
    act(async () =>
      root.render(
        <RulesWatchPanel
          marketKey="hyperliquid:mainnet:BTC"
          rules={DEFAULT_TRADING_RULES}
          holdings={[]}
          factsFor={factsFor}
          idleNote={idleNote}
        />
      )
    )

  await draw(null)
  expect(host.textContent).toContain("Rules")
  expect(host.textContent).toContain("No trading rules are switched on")

  await draw("Rules only check trades in a real-money wallet.")
  expect(host.textContent).toContain(
    "Rules only check trades in a real-money wallet."
  )
})

/**
 * **The header picks the rule and edits it; the counts sit in the body**
 * (Tyler, 15 Oct 2026).
 */
it("shows one rule at a time, with its counts in the body and a cog to edit it", async () => {
  window.localStorage.clear()
  const edit = vi.fn()
  const rules = {
    list: [
      { ...newTradingRule("a", "Main Grid rule"), notes: ["Check BTC"] },
      { ...newTradingRule("b", "Second rule"), notes: ["One", "Two"] },
      { ...newTradingRule("c", "Off rule"), on: false },
    ],
  }
  await act(async () =>
    root.render(
      <RulesWatchPanel
        marketKey="hyperliquid:mainnet:BTC"
        rules={rules}
        holdings={[]}
        factsFor={factsFor}
        onEditRule={edit}
      />
    )
  )
  const box = host.querySelector("[data-rules-box]")!
  const header = box.firstElementChild!
  // No counts in the header: the rule's name, its cog and the fold arrow.
  expect(header.textContent).toBe("RulesMain Grid rule")
  expect(header.textContent).not.toContain("to tick")
  // The counts moved to the body, for the rule on screen.
  expect(box.textContent).toContain("1 to tick")
  expect(box.textContent).toContain("Check BTC")
  expect(box.textContent).not.toContain("Two")
  expect(box.textContent).toContain("1 other rule also needs a look")

  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Edit Main Grid rule"]')!
      .click()
  )
  expect(edit).toHaveBeenCalledWith("a")
})
