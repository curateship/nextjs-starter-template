// @vitest-environment jsdom

import type { ComponentProps } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    children,
    ...props
  }: ComponentProps<"a"> & {
    to: string
    params?: { runId: string }
  }) => (
    <a href={params ? to.replace("$runId", params.runId) : to} {...props}>
      {children}
    </a>
  ),
}))

import { RunningBotsWidget } from "@/components/trade/running-bots-widget"
import type { TradingOverviewBot } from "@/lib/trade/dashboard/overview"

const bots: TradingOverviewBot[] = [
  {
    automationId: "automation-1",
    runId: "run-1",
    name: "Buy the dip",
    state: "running",
    statusWords: null,
    marketCount: 12,
    positionCount: 3,
    netUsd: 24.5,
    startedAt: 100,
  },
  {
    automationId: "automation-2",
    runId: "run-2",
    name: "Needs cash",
    state: "waiting",
    statusWords: "BTC — not enough free cash to place the whole ladder.",
    marketCount: 8,
    positionCount: 1,
    netUsd: -4,
    startedAt: 90,
  },
]

let host: HTMLDivElement | null = null
let root: Root | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe("the running bots widget", () => {
  it("uses the standard light gray subheader without a doubled top line", () => {
    const html = renderToStaticMarkup(
      <RunningBotsWidget bots={bots} className="" />
    )
    const document = new DOMParser().parseFromString(html, "text/html")

    expect(
      document.querySelector('[data-slot="dashboard-card-header"]')?.className
    ).toContain("border-b-0")
    expect(
      document.querySelector('[data-slot="table-container"]')?.className
    ).toContain("color-mix")
  })

  it("shows one table row per automation with its counts, status and money", () => {
    const html = renderToStaticMarkup(
      <RunningBotsWidget bots={bots} className="" />
    )

    expect(html).toContain('href="/flow-runs/run-1"')
    expect(html).toContain("Automation")
    expect(html).toContain("Markets")
    expect(html).toContain("Positions")
    expect(html).toContain("Made or lost")
    expect(html).toContain("Running")
    expect(html).toContain(">12<")
    expect(html).toContain(">3<")
    expect(html).toContain("+$24.50")
    expect(html).toContain("Waiting")
    expect(html).toContain("BTC — not enough free cash")
    expect(html.match(/data-slot="table-row"/g)).toHaveLength(3)
    expect(html).toContain("-$4.00")
  })

  it("links the empty state to the automation canvases", () => {
    const html = renderToStaticMarkup(
      <RunningBotsWidget bots={[]} className="" />
    )

    expect(html).toContain("No running bots.")
    expect(html).toContain('href="/admin/recipes"')
    expect(html).toContain("Open recipes")
  })

  it("uses the same row typography as Active Trades", () => {
    const html = renderToStaticMarkup(
      <RunningBotsWidget bots={bots} className="" />
    )
    const document = new DOMParser().parseFromString(html, "text/html")
    const cells = document.querySelectorAll("tbody tr:first-child td")

    expect(cells[0].querySelector("a")?.className).toContain(
      "text-xs font-medium"
    )
    expect(cells[1].className).toContain("text-xs text-muted-foreground")
    expect(cells[2].className).toContain("font-mono text-xs")
    expect(cells[3].className).toContain("font-mono text-xs")
    expect(cells[4].className).not.toContain("font-mono")
    expect(cells[4].querySelector("span")?.className).toContain("font-medium")
  })

  it("sorts the rows from the table headings", async () => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root?.render(<RunningBotsWidget bots={bots} className="" />)
    )

    const markets = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Markets"
    )
    expect(markets).toBeDefined()
    await act(async () => markets?.click())
    await act(async () => markets?.click())

    const rows = [...host.querySelectorAll("tbody tr")]
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Needs cash"),
      expect.stringContaining("Buy the dip"),
    ])
  })
})
