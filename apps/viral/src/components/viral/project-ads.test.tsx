// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AdCopyCards, AdsMiddle } from "@/components/viral/project-ads"
import type { WinningAd } from "@/lib/viral/ads"

vi.mock("@/lib/api/viral/viral-ads", () => ({
  loadAdCopiesFn: vi.fn(async () => ({
    copies: [{ id: "copy-1", mainText: "x".repeat(140), headline: "Dinner, sorted", description: "For dads", createdAt: "2099-01-01T00:00:00.000Z" }],
    price: { cents: 1, writer: "Gemini Flash" },
  })),
  writeAdCopyFn: vi.fn(),
}))

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
        />
      )
    )
    const rows = [...container.querySelectorAll('[aria-label="Winning ads"] li')].map((row) => row.textContent ?? "")
    expect(rows[0]).toContain("Started last month")
    expect(rows[1]).toContain("Started last year")
  })
})

describe("Write an ad like this", () => {
  it("shows Meta's three boxes with their lengths, and a price with the writer", async () => {
    await act(async () => root.render(<AdCopyCards projectId="project-a" adArchiveId="111" sample={false} />))
    expect(container.textContent).toContain("140 of about 125 characters")
    expect(container.textContent).toContain("About 1 cent with Gemini Flash")
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Write an ad")).toBe(true)
    expect(container.querySelectorAll('button[aria-label^="Copy the"]')).toHaveLength(3)
  })

  it("leaves Write an ad off a sample's made-up ad", async () => {
    await act(async () => root.render(<AdCopyCards projectId="sample" adArchiveId="sample-ad-1" sample />))
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Write an ad")).toBe(false)
    expect(container.textContent).toContain("made up")
  })
})
