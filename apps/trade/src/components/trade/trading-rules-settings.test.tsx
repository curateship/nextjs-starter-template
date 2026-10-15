// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/trade/trading-rules", () => ({
  getTradingRulesLoadErrorMessage: vi.fn(() => "Could not load"),
  getTradingRulesSaveErrorMessage: vi.fn(() => "Could not save"),
  loadTradingRulesSettings: vi.fn(),
  saveTradingRulesSettings: vi.fn(() => Promise.resolve({ saved: true })),
}))
vi.mock("@/app/page-title", () => ({ useTradePageTitle: vi.fn() }))
vi.mock("@/components/settings/use-reported-save-status", () => ({
  useReportedSaveStatus: () => vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
}))

import { TradeSettingsProvider } from "@/components/trade/trade-settings-bootstrap"
import TradingRulesSettings from "@/components/trade/trading-rules-settings"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  loadTradingRulesSettings,
  saveTradingRulesSettings,
} from "@/lib/api/trade/trading-rules"
import type { TradingRule, TradingRules } from "@/lib/trade/trading-rules"

const GUARD: TradingRule = {
  id: "rule-guard",
  name: "Weekly trend guard",
  on: true,
  places: ["grid"],
  sides: "both",
  match: "all",
  then: "block",
  cards: [
    { type: "ema", position: "under", period: 50, interval: "1w", reading: "now" },
    { type: "gridsOnExchange", count: 5 },
  ],
  notes: [],
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
  vi.useRealTimers()
})

async function draw(rules: TradingRules) {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <TradeSettingsProvider value={{ tradingRules: rules }}>
          <TradingRulesSettings />
        </TradeSettingsProvider>
      </TooltipProvider>
    )
  })
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (one) =>
      one.getAttribute("aria-label") === name || one.textContent?.trim() === name
  )
  if (!found) throw new Error(`No button called ${name}`)
  return found
}

describe("the Trading rules tab", () => {
  it("lists each rule with what it covers, what it does and its conditions", async () => {
    await draw({ list: [GUARD] })

    expect(loadTradingRulesSettings).not.toHaveBeenCalled()
    const row = host.querySelector("tbody tr")
    expect(row?.textContent).toContain("Weekly trend guard")
    expect(row?.textContent).toContain(
      "Price is under EMA 50 on 1 week, and at most 5 real-money grids running on this exchange"
    )
    expect(row?.textContent).toContain("Grids")
    expect(row?.textContent).toContain("Blocks")
  })

  it("says what a rule is for when there are none yet", async () => {
    await draw({ list: [] })
    expect(host.textContent).toContain("No rules yet.")
  })

  it("saves a switched-off rule 700ms after the switch, with no Save button", async () => {
    vi.useFakeTimers()
    await draw({ list: [GUARD] })

    await act(async () => button("Weekly trend guard is on").click())
    expect(saveTradingRulesSettings).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(700))

    expect(saveTradingRulesSettings).toHaveBeenCalledWith({
      list: [{ ...GUARD, on: false }],
    })
  })

  it("opens a rule with its conditions stacked one card each", async () => {
    await draw({ list: [GUARD] })

    await act(async () => button("Edit Weekly trend guard").click())

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain("Conditions")
    expect(dialog?.textContent).toContain("Add a condition")
    expect(dialog?.textContent).toContain("EMA")
    expect(dialog?.textContent).toContain("Grids on this exchange")
    expect(
      document.querySelector<HTMLInputElement>("#rule-condition-0-period")?.value
    ).toBe("50")
    expect(
      document.querySelector<HTMLInputElement>("#rule-condition-1-count")?.value
    ).toBe("5")
  })

  it("makes a new rule, named, switched on and warning, and opens it", async () => {
    vi.useFakeTimers()
    await draw({ list: [GUARD] })

    await act(async () => button("New rule").click())
    await act(async () => vi.advanceTimersByTime(700))

    const saved = vi.mocked(saveTradingRulesSettings).mock.calls[0][0]
    expect(saved.list[1]).toMatchObject({
      name: "Rule 2",
      on: true,
      then: "warn",
      places: ["order", "dca", "grid"],
      cards: [],
    })
    expect(
      document.querySelector<HTMLInputElement>("#rule-name")?.value
    ).toBe("Rule 2")
  })

  it("keeps a name with a comma on screen, marked, and never sends it", async () => {
    vi.useFakeTimers()
    await draw({ list: [GUARD] })
    await act(async () => button("Edit Weekly trend guard").click())

    const name = document.querySelector<HTMLInputElement>("#rule-name")
    if (!name) throw new Error("No name field")
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      set?.call(name, "Weekly, trend")
      name.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => vi.advanceTimersByTime(700))

    expect(name.getAttribute("aria-invalid")).toBe("true")
    expect(saveTradingRulesSettings).not.toHaveBeenCalled()
  })
})

describe("a rule's notes", () => {
  it("adds a note and saves its words", async () => {
    vi.useFakeTimers()
    await draw({ list: [GUARD] })
    await act(async () => button("Edit Weekly trend guard").click())
    await act(async () => button("Add a note").click())

    const note = document.querySelector<HTMLInputElement>("#rule-note-0")
    if (!note) throw new Error("No note field")
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      set?.call(note, "Did I check the daily trend?")
      note.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => vi.advanceTimersByTime(700))

    const saved = vi.mocked(saveTradingRulesSettings).mock.calls.at(-1)?.[0]
    expect(saved?.list[0].notes).toEqual(["Did I check the daily trend?"])
  })
})
