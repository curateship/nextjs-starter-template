import { describe, expect, it } from "vitest"

import { createDefaultPublicTheme } from "@/lib/public-theme"
import {
  MAX_PUBLIC_THEME_PRESETS,
  MAX_PUBLIC_THEME_PRESET_NAME_LENGTH,
  normalizePublicThemePresets,
  publicThemePresetNameProblem,
  publicThemePresetSwatches,
} from "@/lib/public-theme-presets"

describe("public theme presets", () => {
  it("reads a saved preset and drops anything it cannot use", () => {
    const presets = normalizePublicThemePresets([
      { id: " mine ", name: "  Summer  ", theme: { radius: 4 } },
      { id: "", name: "No id", theme: {} },
      { id: "no-name", name: "   ", theme: {} },
      { id: "mine", name: "Duplicate id", theme: {} },
      "not an object",
      null,
    ])

    expect(presets).toHaveLength(1)
    expect(presets[0].id).toBe("mine")
    expect(presets[0].name).toBe("Summer")
    expect(presets[0].theme).toEqual({
      ...createDefaultPublicTheme(),
      radius: 4,
    })
  })

  it("stops reading at the preset limit and cuts a long name", () => {
    const tooMany = Array.from({ length: MAX_PUBLIC_THEME_PRESETS + 5 }, (
      _,
      index
    ) => ({ id: `preset-${index}`, name: "x".repeat(200), theme: {} }))

    const presets = normalizePublicThemePresets(tooMany)

    expect(presets).toHaveLength(MAX_PUBLIC_THEME_PRESETS)
    expect(presets[0].name).toHaveLength(MAX_PUBLIC_THEME_PRESET_NAME_LENGTH)
  })

  it("reads anything that is not a list of presets as none saved", () => {
    expect(normalizePublicThemePresets(undefined)).toEqual([])
    expect(normalizePublicThemePresets({ id: "one" })).toEqual([])
    expect(normalizePublicThemePresets("presets")).toEqual([])
  })

  it("names the problem with a preset name", () => {
    expect(publicThemePresetNameProblem("Summer")).toBeNull()
    expect(publicThemePresetNameProblem("   ")).toBe("Give the preset a name.")
    expect(publicThemePresetNameProblem("x".repeat(200))).toContain(
      String(MAX_PUBLIC_THEME_PRESET_NAME_LENGTH)
    )
  })

  it("refuses a name another preset already uses, whatever its case", () => {
    const saved = [
      { id: "one", name: "Summer", theme: createDefaultPublicTheme() },
    ]

    expect(publicThemePresetNameProblem("  summer  ", saved)).toBe(
      "You already have a preset called summer."
    )
    expect(publicThemePresetNameProblem("Winter", saved)).toBeNull()
  })

  it("shows a theme token where a preset leaves the colour alone", () => {
    const [canvas, chrome, brand, border] = publicThemePresetSwatches(
      createDefaultPublicTheme()
    )

    expect(canvas).toBe("var(--muted)")
    expect(chrome).toBe("var(--background)")
    expect(brand).toBe("var(--primary)")
    expect(border).toBe("var(--border)")
  })

  it("shows the fixed colour where a preset sets one", () => {
    const [canvas, , brand] = publicThemePresetSwatches({
      ...createDefaultPublicTheme(),
      brandColor: "#8a5a2b",
      canvasColor: { mode: "custom", strength: 60, color: "#faf8f4" },
    })

    expect(canvas).toBe("#faf8f4")
    expect(brand).toBe("#8a5a2b")
  })
})
