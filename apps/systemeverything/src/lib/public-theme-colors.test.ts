import { describe, expect, it } from "vitest"

import {
  PUBLIC_THEME_DARK_SURFACE,
  PUBLIC_THEME_LIGHT_SURFACE,
  contrastRatio,
  derivePublicBrandColors,
  hasReadableTextContrast,
  mixHexColors,
  publicThemeContrast,
  readableTextOnBrand,
} from "@/lib/public-theme-colors"

describe("public theme colours", () => {
  it("derives a hover shade, soft tint, readable text, and dark pairing", () => {
    const colors = derivePublicBrandColors("#336699")

    expect(colors).not.toBeNull()
    expect(colors?.light).toEqual({
      brand: "#336699",
      hover: "#2d5a87",
      soft: "#e7edf3",
      foreground: "#fafafa",
    })
    expect(colors?.dark.brand).not.toBe("#336699")
    expect(
      hasReadableTextContrast(colors?.dark.brand ?? "", PUBLIC_THEME_DARK_SURFACE)
    ).toBe(true)
  })

  it("handles near-white, near-black, and saturated yellow brands", () => {
    const pale = derivePublicBrandColors("#fefefe")
    const dark = derivePublicBrandColors("#010101")
    const yellow = derivePublicBrandColors("#ffea00")

    expect(pale?.light.foreground).toBe("#18181b")
    expect(dark?.light.foreground).toBe("#fafafa")
    expect(dark?.light.hover).not.toBe("#010101")
    expect(yellow?.dark.brand).toBe("#ffea00")
    expect(yellow?.dark.foreground).toBe("#18181b")
    expect(readableTextOnBrand("#777777")).toBe("#000000")
    expect(
      hasReadableTextContrast(
        readableTextOnBrand("#777777"),
        "#777777"
      )
    ).toBe(true)
  })

  it("keeps manual values when the brand colour changes", () => {
    const overrides = {
      hoverColor: "#111111",
      softColor: "#222222",
      foregroundColor: "#333333",
      darkColor: "#444444",
    }

    expect(derivePublicBrandColors("#3b82f6", overrides)?.light).toEqual({
      brand: "#3b82f6",
      hover: "#111111",
      soft: "#222222",
      foreground: "#333333",
    })
    expect(derivePublicBrandColors("#dc2626", overrides)?.dark).toEqual({
      brand: "#444444",
      hover: "#111111",
      soft: "#222222",
      foreground: "#333333",
    })
  })

  it("measures normal-text contrast without accepting invalid colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21)
    expect(hasReadableTextContrast("#fefefe", PUBLIC_THEME_LIGHT_SURFACE)).toBe(
      false
    )
    expect(hasReadableTextContrast("#18181b", PUBLIC_THEME_LIGHT_SURFACE)).toBe(
      true
    )
    expect(contrastRatio("blue", "#ffffff")).toBeNull()
    expect(readableTextOnBrand("#ffffff")).toBe("#18181b")
  })

  it("checks page text, button text, and links in both modes", () => {
    const colors = derivePublicBrandColors("#fefefe", {
      foregroundColor: "#fefefe",
      darkColor: "#19191c",
    })

    expect(colors).not.toBeNull()
    expect(publicThemeContrast(colors!)).toEqual({
      light: { pageText: true, buttonText: false, link: false },
      dark: { pageText: true, buttonText: true, link: false },
    })

    const paleDarkMode = derivePublicBrandColors("#fefefe", {
      foregroundColor: "#fefefe",
      darkColor: "#fefefe",
    })
    expect(publicThemeContrast(paleDarkMode!).dark).toEqual({
      pageText: true,
      buttonText: false,
      link: true,
    })
  })

  it("mixes known colours without leaving six-digit hex", () => {
    expect(mixHexColors("#336699", "#000000", 0.12)).toBe("#2d5a87")
    expect(mixHexColors("#ffffff", "#336699", 0.12)).toBe("#e7edf3")
  })
})
