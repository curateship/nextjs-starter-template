import { describe, expect, it } from "vitest"

import {
  isGeneratedFaviconStoragePath,
  normalizePublicFaviconSet,
  publicFaviconLinks,
  type PublicFaviconVariant,
} from "@/lib/favicon"

const light = faviconVariant("light")
const dark = faviconVariant("dark")

describe("public favicons", () => {
  it("recognises only the generated favicon storage folder", () => {
    expect(
      isGeneratedFaviconStoragePath(
        "00000000-0000-4000-8000-000000000001/favicons/00000000-0000-4000-8000-000000000002/light-32.png"
      )
    ).toBe(true)
    expect(
      isGeneratedFaviconStoragePath(
        "00000000-0000-4000-8000-000000000001/source.png"
      )
    ).toBe(false)
    expect(
      isGeneratedFaviconStoragePath(
        "00000000-0000-4000-8000-000000000001/favicons/00000000-0000-4000-8000-000000000002/light-64.png"
      )
    ).toBe(false)
  })

  it("emits every generated size and the optional dark set", () => {
    expect(
      publicFaviconLinks({
        favicon: light.source,
        faviconDark: dark.source,
        faviconSet: { light, dark },
      })
    ).toEqual([
      link(light.icon16, "icon", 16),
      link(light.icon32, "icon", 32),
      link(light.appleTouchIcon, "apple-touch-icon", 180),
      link(light.icon512, "icon", 512),
      link(dark.icon16, "icon", 16, true),
      link(dark.icon32, "icon", 32, true),
      link(dark.appleTouchIcon, "apple-touch-icon", 180, true),
      link(dark.icon512, "icon", 512, true),
    ])
  })

  it("uses the selected original until its generated files are ready", () => {
    expect(
      publicFaviconLinks({
        favicon: "https://media.example.test/new.png",
        faviconDark: "",
        faviconSet: { light },
      })
    ).toEqual([{ rel: "icon", href: "https://media.example.test/new.png" }])
  })

  it("removes unsafe and incomplete saved sets", () => {
    expect(
      normalizePublicFaviconSet({
        light: { ...light, icon16: "javascript:alert(1)" },
        dark,
      })
    ).toEqual({ dark })
    expect(
      normalizePublicFaviconSet({ light: { source: light.source } })
    ).toBeNull()
  })

  it("emits no custom tags after both favicon choices are removed", () => {
    expect(
      publicFaviconLinks({ favicon: "", faviconDark: "", faviconSet: null })
    ).toEqual([])
  })
})

function faviconVariant(name: string): PublicFaviconVariant {
  const base = `https://media.example.test/favicons/${name}`
  return {
    source: `https://media.example.test/${name}.png`,
    icon16: `${base}-16.png`,
    icon32: `${base}-32.png`,
    appleTouchIcon: `${base}-180.png`,
    icon512: `${base}-512.png`,
  }
}

function link(
  href: string,
  rel: "icon" | "apple-touch-icon",
  size: number,
  darkMode = false
) {
  return {
    rel,
    href,
    type: "image/png",
    sizes: `${size}x${size}`,
    ...(darkMode ? { media: "(prefers-color-scheme: dark)" } : {}),
  }
}
