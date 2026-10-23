import { describe, expect, it } from "vitest"

import {
  brandImagesAreCurrent,
  darkBrandSvg,
  flipCssColorLightness,
  flipLightness,
  type BrandImages,
} from "@/lib/brand-image"

describe("the dark-mode twin of a brand image", () => {
  it("swaps black for white and back again", () => {
    expect(flipLightness(0, 0, 0)).toEqual([255, 255, 255])
    expect(flipLightness(255, 255, 255)).toEqual([0, 0, 0])
  })

  it("keeps a mid grey where it is", () => {
    expect(flipLightness(128, 128, 128)).toEqual([127, 127, 127])
  })

  it("keeps the colour and moves only the lightness", () => {
    // Navy is a dark blue, so its twin is a pale blue: blue still the biggest
    // channel, red and green still equal and still the smallest.
    const [red, green, blue] = flipLightness(0, 0, 128)
    expect(blue).toBeGreaterThan(200)
    expect(red).toBe(green)
    expect(red).toBeLessThan(blue)
  })

  it("comes back to the original when applied twice", () => {
    const pixels: [number, number, number][] = [
      [12, 84, 200],
      [240, 120, 10],
      [7, 7, 7],
    ]
    for (const [red, green, blue] of pixels) {
      const [r, g, b] = flipLightness(red, green, blue)
      expect(flipLightness(r, g, b)).toEqual([red, green, blue])
    }
  })

  it("rewrites hex, shorthand, named and rgb colours", () => {
    expect(flipCssColorLightness("#000000")).toBe("#ffffff")
    expect(flipCssColorLightness("#fff")).toBe("#000000")
    expect(flipCssColorLightness("black")).toBe("#ffffff")
    expect(flipCssColorLightness("rgb(255, 255, 255)")).toBe("#000000")
  })

  it("carries transparency through untouched", () => {
    expect(flipCssColorLightness("#00000080")).toBe("#ffffff80")
    expect(flipCssColorLightness("rgba(0, 0, 0, 0.5)")).toBe(
      "rgba(255, 255, 255, 0.5)"
    )
  })

  it("leaves alone anything that names no colour", () => {
    const untouched = ["none", "currentColor", "var(--ink)", "rebeccapurple"]
    for (const value of untouched) {
      expect(flipCssColorLightness(value)).toBe(value)
    }
  })

  it("flips every fill and stroke in an SVG", () => {
    const svg = darkBrandSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="#000000"><path d="M0 0h10v10H0z" fill="white" stroke="none"/><circle cx="5" cy="5" r="2" stroke="#000"/></svg>`
    )
    expect(svg).toContain(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="#ffffff">`
    )
    expect(svg).toContain(`fill="#000000"`)
    expect(svg).toContain(`stroke="none"`)
    expect(svg).toContain(`stroke="#ffffff"`)
  })

  it("steps over a quoted attribute holding an angle bracket", () => {
    const svg = darkBrandSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" aria-label="A &gt; B" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>`
    )
    expect(svg).toContain(`aria-label="A &gt; B"`)
    expect(svg).toContain(`viewBox="0 0 10 10" fill="#ffffff">`)
  })

  it("leaves a self-closing root tag closed", () => {
    expect(darkBrandSvg(`<svg viewBox="0 0 1 1"/>`)).toBe(
      `<svg viewBox="0 0 1 1" fill="#ffffff"/>`
    )
  })

  it("gives a colourless SVG a white root, so it shows on a dark page", () => {
    const svg = darkBrandSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>`
    )
    expect(svg).toContain(`fill="#ffffff"`)
  })
})

describe("when the stored pictures need rebuilding", () => {
  const logo = "https://media.example.test/owner/logo.png"
  const darkSource =
    "https://media.example.test/owner/favicons/version-1/dark-source.png"

  it("accepts a complete chain built from the one logo", () => {
    expect(brandImagesAreCurrent(logo, inStep())).toBe(true)
  })

  it("rebuilds when the tab icon was chosen separately", () => {
    expect(
      brandImagesAreCurrent(logo, {
        ...inStep(),
        favicon: "https://media.example.test/owner/old-favicon.png",
      })
    ).toBe(false)
  })

  it("rebuilds when the dark twin's files are missing", () => {
    expect(
      brandImagesAreCurrent(logo, { ...inStep(), faviconSet: null })
    ).toBe(false)
  })

  it("rebuilds when the dark logo points somewhere else", () => {
    expect(
      brandImagesAreCurrent(logo, {
        ...inStep(),
        logoDark: "https://media.example.test/owner/hand-picked-dark.png",
      })
    ).toBe(false)
  })

  it("treats no logo as in step only when nothing is left behind", () => {
    const empty: BrandImages = {
      logo: "",
      logoDark: "",
      favicon: "",
      faviconDark: "",
      faviconSet: null,
    }
    expect(brandImagesAreCurrent("", empty)).toBe(true)
    expect(
      brandImagesAreCurrent("", { ...empty, faviconDark: darkSource })
    ).toBe(false)
  })

  function inStep(): BrandImages {
    return {
      logo,
      logoDark: darkSource,
      favicon: logo,
      faviconDark: darkSource,
      faviconSet: {
        light: variant(logo, "light"),
        dark: variant(darkSource, "dark"),
      },
    }
  }

  function variant(source: string, mode: "light" | "dark") {
    const root = `https://media.example.test/owner/favicons/version-1/${mode}`
    return {
      source,
      icon16: `${root}-16.png`,
      icon32: `${root}-32.png`,
      appleTouchIcon: `${root}-180.png`,
      icon512: `${root}-512.png`,
    }
  }
})
