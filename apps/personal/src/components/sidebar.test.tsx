import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MenuActionsContext } from "@/components/menu-links"
import { RecentLinks } from "@/components/sidebar"
import { defaultMenu } from "@/lib/menu"
import type { RecentScreen } from "@/lib/recent-screens"

function render(recent: RecentScreen[], activeId: string | null = null) {
  const actions = {
    editing: false,
    places: [],
    openUrl: null,
    activeId,
    startLinkId: null,
    open: () => {},
    update: () => {},
  }
  return renderToStaticMarkup(
    <MenuActionsContext.Provider value={actions}>
      <RecentLinks menu={defaultMenu()} recent={recent} />
    </MenuActionsContext.Provider>
  )
}

const screen = (url: string): RecentScreen => ({ url, title: "" })

describe("Recent in the left menu", () => {
  it("shows the last three links opened, newest first, each marked when open", () => {
    const html = render(
      [
        screen("http://localhost:3015/admin/listings/abc"),
        screen("http://localhost:3015/admin/dashboard"),
        screen("http://localhost:3015/admin/listings"),
        screen("http://localhost:3020/dashboard"),
      ],
      "link-cms-listings"
    )
    expect(html).toContain('aria-label="Recent"')
    const labels = [...html.matchAll(/<span class="truncate">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(labels).toEqual(["Recent", "Listings", "Dashboard", "My dashboard"])
    expect(html).toMatch(/href="\/localhost:3015\/admin\/listings"[^>]*data-active=""/)
  })

  it("draws nothing before any link is opened", () => {
    expect(render([])).toBe("")
    expect(render([screen("http://localhost:3015/not-in-the-menu")])).toBe("")
  })
})
