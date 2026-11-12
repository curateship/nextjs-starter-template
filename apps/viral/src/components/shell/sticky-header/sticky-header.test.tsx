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
  it("shows nothing while saving or once saved", () => {
    for (const status of ["saving", "saved"] as const) {
      const markup = renderToStaticMarkup(<StickyHeader saveStatus={status} />)
      expect(markup).not.toContain("Saving…")
      expect(markup).not.toContain("Saved")
    }
  })

  it("keeps announcing a refused save and names the fix", () => {
    const markup = renderToStaticMarkup(
      <StickyHeader
        saveStatus={{ blocked: "fix the brand colour in Admin → Styling → Public" }}
      />
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain("Not saved")
    expect(markup).toContain("fix the brand colour in Admin")
  })
})
