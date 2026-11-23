import { afterEach, describe, expect, it, vi } from "vitest"

import { isDark, savedColourMode } from "@/lib/colour-mode"

function stubSaved(saved: string | null) {
  vi.stubGlobal("window", { localStorage: { getItem: () => saved } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("colour mode", () => {
  it("comes back as this browser's pick, or System with none or a stray value", () => {
    stubSaved("dark")
    expect(savedColourMode()).toBe("dark")
    stubSaved("light")
    expect(savedColourMode()).toBe("light")
    stubSaved(null)
    expect(savedColourMode()).toBe("system")
    stubSaved("blue")
    expect(savedColourMode()).toBe("system")
  })

  it("draws dark for Dark, never for Light, and as the Mac is set for System", () => {
    expect(isDark("dark", false)).toBe(true)
    expect(isDark("light", true)).toBe(false)
    expect(isDark("system", true)).toBe(true)
    expect(isDark("system", false)).toBe(false)
  })
})
