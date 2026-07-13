import { describe, expect, it } from "vitest"

import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "@/lib/custom-shell"

describe("sidebar width", () => {
  it("uses the current sidebar width as the default", () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(218)
  })

  it("keeps dragged widths within the supported range", () => {
    expect(MIN_SIDEBAR_WIDTH).toBe(144)
    expect(clampSidebarWidth(MIN_SIDEBAR_WIDTH - 100)).toBe(MIN_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(300.4)).toBe(300)
    expect(clampSidebarWidth(MAX_SIDEBAR_WIDTH + 100)).toBe(MAX_SIDEBAR_WIDTH)
  })
})
