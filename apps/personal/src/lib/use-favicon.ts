import * as React from "react"

/** Personal's own tab icon, the one `index.html` starts with. */
const DEFAULT_ICON = "/logo.png"

/**
 * Points the browser tab's icon at the logo chosen for the menu's logo row,
 * or back at Personal's own when there is none. Tyler asked for it on 18 Oct
 * 2026. The logo is a data address the menu file checked, so it is always a
 * picture.
 */
export function useFavicon(logo: string | undefined) {
  React.useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) return
    link.type = logo ? logo.slice("data:".length, logo.indexOf(";")) : "image/png"
    link.href = logo ?? DEFAULT_ICON
  }, [logo])
}
