import {
  DEFAULT_FAVICON_MODE,
  type FaviconMode,
  type PublicFaviconSet,
} from "@/lib/favicon"

/**
 * Adding the app to a phone's home screen. The browser reads a web app
 * manifest from `HOME_SCREEN_MANIFEST_PATH` for the name, the icon and the
 * page to open, and `display: "standalone"` opens it full screen without the
 * browser's address bar. The icons are the ones already cut from the logo for
 * the browser tab, so there is nothing new to upload.
 *
 * Nothing here sends notices to the phone. It is a shortcut that opens the
 * app, the same pages as in the browser.
 */
export const HOME_SCREEN_MANIFEST_PATH = "/manifest.webmanifest"

export type WebAppManifest = {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: "standalone"
  icons: { src: string; sizes: string; type: "image/png" }[]
}

/**
 * The manifest for one app. The icons follow the browser tab's choice of the
 * light or dark logo, and fall back to the other version when the chosen one
 * was never made. With no logo there are no icons, and the phone draws its
 * own from the name.
 */
export function webAppManifest({
  appName,
  shortName,
  startPath,
  faviconSet,
  faviconMode = DEFAULT_FAVICON_MODE,
}: {
  appName: string
  shortName: string | null
  startPath: string
  faviconSet: PublicFaviconSet | null
  faviconMode?: FaviconMode
}): WebAppManifest {
  const chosen = faviconMode === "light" ? faviconSet?.light : faviconSet?.dark
  const variant = chosen ?? (faviconMode === "light" ? faviconSet?.dark : faviconSet?.light)
  return {
    name: appName,
    short_name: shortName ?? appName,
    start_url: startPath,
    scope: "/",
    display: "standalone",
    icons: variant
      ? [
          { src: variant.appleTouchIcon, sizes: "180x180", type: "image/png" },
          { src: variant.icon512, sizes: "512x512", type: "image/png" },
        ]
      : [],
  }
}
