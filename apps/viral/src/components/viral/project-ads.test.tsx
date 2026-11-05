// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { AdsMiddle } from "@/components/viral/project-ads"
import type { WinningAd } from "@/lib/viral/ads"

function ad(id: string, title: string, startedAt: string, daysRunning: number): WinningAd {
  return {
    id,
    adArchiveId: id,
    pageName: "Prep Co",
    body: "",
    title,
    keyword: "meal prep",
    platforms: ["facebook"],
    startedAt,
    daysRunning,
    libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`,
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("the Winning ads list", () => {
  it("keeps the server's newest-first order, the order the first ad opens from", () => {
    // The server sends the newest start first; the longest-running one is last.
    const ads = [ad("new", "Started last month", "2099-02-01", 31), ad("old", "Started last year", "2098-02-01", 365)]
    act(() =>
      root.render(
        <AdsMiddle
          ads={{ state: "ready", ads, searchedAt: null, error: null, tokenSet: true }}
          searching={false}
          sample={false}
          openId={null}
          onSearch={() => undefined}
          onRetry={() => undefined}
          onPick={() => undefined}
          onBack={() => undefined}
        />
      )
    )
    const rows = [...container.querySelectorAll('[aria-label="Winning ads"] li')].map((row) => row.textContent ?? "")
    expect(rows[0]).toContain("Started last month")
    expect(rows[1]).toContain("Started last year")
  })
})
