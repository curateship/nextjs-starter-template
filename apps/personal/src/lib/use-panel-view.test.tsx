import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { usePanelView } from "@/lib/use-panel-view"

function Kept() {
  return <span>{usePanelView().kept}</span>
}

function renderWith(saved: Record<string, string>) {
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => saved[key] ?? null } })
  return renderToStaticMarkup(<Kept />)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("screens kept loaded", () => {
  it("comes back as the number this browser saved", () => {
    expect(renderWith({ "personal-panel-kept": "8" })).toBe("<span>8</span>")
  })

  it("starts at three with nothing saved, or a number the cog doesn't offer", () => {
    expect(renderWith({})).toBe("<span>3</span>")
    expect(renderWith({ "personal-panel-kept": "7" })).toBe("<span>3</span>")
  })
})
