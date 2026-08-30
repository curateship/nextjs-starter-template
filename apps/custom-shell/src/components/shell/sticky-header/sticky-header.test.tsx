import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}))
vi.mock("@/components/shell/sticky-header/sticky-header-right-nav", () => ({
  StickyHeaderRightNav: () => null,
}))

import { StickyHeader } from "@/components/shell/sticky-header/sticky-header"

describe("StickyHeader save status", () => {
  it("announces a completed save", () => {
    const markup = renderToStaticMarkup(<StickyHeader saveStatus="saved" />)

    expect(markup).toContain('role="status"')
    expect(markup).toContain("Saved")
  })

  it("does not announce the saving step", () => {
    const markup = renderToStaticMarkup(<StickyHeader saveStatus="saving" />)

    expect(markup).not.toContain('role="status"')
    expect(markup).toContain("Saving…")
  })

  it("keeps announcing a refused save", () => {
    const markup = renderToStaticMarkup(<StickyHeader saveStatus="blocked" />)

    expect(markup).toContain('role="status"')
    expect(markup).toContain("Not saved")
  })
})
