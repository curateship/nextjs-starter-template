import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MenuActionsContext } from "@/components/menu-links"
import { RecentLinks } from "@/components/sidebar"
import { allLinks, defaultMenu } from "@/lib/menu"
import { recentLinksIn } from "@/lib/recent-links"

function render(ids: string[], activeId: string | null = null) {
  const actions = {
    editing: false,
    places: [],
    openUrl: null,
    activeId,
    startLinkId: null,
    stayLoaded: null,
    open: () => {},
    update: () => {},
  }
  return renderToStaticMarkup(
    <MenuActionsContext.Provider value={actions}>
      <RecentLinks links={recentLinksIn(allLinks(defaultMenu()), ids)} />
    </MenuActionsContext.Provider>
  )
}

describe("Recent in the left menu", () => {
  it("shows its links in order, the open one marked", () => {
    const html = render(
      ["link-cms-listings", "link-cms-dashboard", "link-project-dashboard"],
      "link-cms-listings"
    )
    expect(html).toContain('aria-label="Recent"')
    const labels = [...html.matchAll(/<span class="truncate">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(labels).toEqual(["Recent", "Listings", "Dashboard", "My dashboard"])
    expect(html).toMatch(/href="\/localhost:3015\/admin\/listings"[^>]*data-active=""/)
  })

  it("draws nothing before any link is opened", () => {
    expect(render([])).toBe("")
    expect(render(["gone"])).toBe("")
  })
})
