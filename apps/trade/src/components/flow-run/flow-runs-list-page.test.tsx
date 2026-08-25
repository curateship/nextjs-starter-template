import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { FlowRunListRow } from "@/lib/api/flow-runs"

/**
 * Which actions each kind of row offers. A RUNNING row is the one somebody
 * may need to act on, so it carries Pause (or Resume) and Stop — the same
 * two acts its canvas offers — and refuses Delete. A finished row is the
 * other way round. Decided while rendering, so checked by rendering; the
 * clicks go through the same endpoints the canvas header already proves.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children?: unknown }) => <a>{props.children as never}</a>,
  useRouter: () => ({ navigate: () => {} }),
}))

const { FlowRunsListPage } =
  await import("@/components/flow-run/flow-runs-list-page")

function row(over: Partial<FlowRunListRow>): FlowRunListRow {
  return {
    id: "run-1",
    automationId: "auto-1",
    automationName: "DCA - Phemex",
    walletId: "w1",
    walletLabel: "Live",
    real: true,
    venue: "Phemex",
    status: "running",
    paused: false,
    holding: false,
    capUsd: 100,
    coins: 85,
    working: 2,
    startedAt: 1_700_000_000_000,
    stoppedAt: null,
    stoppedReason: null,
    netUsd: 0,
    tradesClosed: 0,
    holdingCoins: 0,
    headline: null,
    ...over,
  }
}

describe("the live-runs table's actions", () => {
  it("offers Pause and Stop on a running row, and refuses Delete", () => {
    const html = renderToStaticMarkup(<FlowRunsListPage initial={[row({})]} />)
    expect(html).toContain('aria-label="Pause DCA - Phemex"')
    expect(html).toContain('aria-label="Stop DCA - Phemex"')
    // Delete is drawn but refused — a switched-on run is stopped, never
    // tidied away.
    expect(html).toMatch(
      /aria-label="Delete the run of DCA - Phemex"[^>]*disabled|disabled[^>]*aria-label="Delete the run of DCA - Phemex"/
    )
  })

  it("offers Resume instead of Pause once the run is paused", () => {
    const html = renderToStaticMarkup(
      <FlowRunsListPage initial={[row({ paused: true })]} />
    )
    expect(html).toContain('aria-label="Resume DCA - Phemex"')
    expect(html).not.toContain('aria-label="Pause DCA - Phemex"')
  })

  it("offers only Delete once the run is over", () => {
    const html = renderToStaticMarkup(
      <FlowRunsListPage
        initial={[
          row({ status: "stopped", stoppedReason: "Switched off by hand." }),
        ]}
      />
    )
    expect(html).not.toContain('aria-label="Pause DCA - Phemex"')
    expect(html).not.toContain('aria-label="Stop DCA - Phemex"')
    expect(html).toContain('aria-label="Delete the run of DCA - Phemex"')
  })

  it("shows stopping progress and offers no second action", () => {
    const html = renderToStaticMarkup(
      <FlowRunsListPage initial={[row({ status: "stopping", working: 7 })]} />
    )
    expect(html).toContain("Stopping")
    expect(html).toContain("7 ladders left to call off")
    expect(html).not.toContain('aria-label="Pause DCA - Phemex"')
    expect(html).not.toContain('aria-label="Stop DCA - Phemex"')
    expect(html).toMatch(
      /aria-label="Delete the run of DCA - Phemex"[^>]*disabled|disabled[^>]*aria-label="Delete the run of DCA - Phemex"/
    )
  })
})
