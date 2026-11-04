import { describe, expect, it } from "vitest"

import type { PublicFaviconVariant } from "@/lib/favicon"
import { webAppManifest } from "@/lib/home-screen"

const variant = (name: string): PublicFaviconVariant => ({
  source: `https://cdn.test/${name}.png`,
  icon16: `https://cdn.test/${name}-16.png`,
  icon32: `https://cdn.test/${name}-32.png`,
  appleTouchIcon: `https://cdn.test/${name}-180.png`,
  icon512: `https://cdn.test/${name}-512.png`,
})

describe("the home-screen manifest", () => {
  it("opens the app's start page full screen, with the tab's chosen logo", () => {
    expect(
      webAppManifest({
        appName: "Project",
        shortName: null,
        startPath: "/dashboard",
        faviconSet: { light: variant("light"), dark: variant("dark") },
        faviconMode: "light",
      })
    ).toEqual({
      name: "Project",
      short_name: "Project",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      icons: [
        { src: "https://cdn.test/light-180.png", sizes: "180x180", type: "image/png" },
        { src: "https://cdn.test/light-512.png", sizes: "512x512", type: "image/png" },
      ],
    })
  })

  it("falls back to the other logo, and to no icons without a logo", () => {
    const onlyLight = webAppManifest({
      appName: "A long app name",
      shortName: "Short",
      startPath: "/",
      faviconSet: { light: variant("light") },
      faviconMode: "dark",
    })
    expect(onlyLight.short_name).toBe("Short")
    expect(onlyLight.icons[0].src).toBe("https://cdn.test/light-180.png")
    expect(webAppManifest({ appName: "A", shortName: null, startPath: "/", faviconSet: null }).icons).toEqual([])
  })
})
