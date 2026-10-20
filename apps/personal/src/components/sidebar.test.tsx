import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MenuActionsContext } from "@/components/menu-links"
import { PinnedLinks } from "@/components/sidebar"
import { defaultMenu, pinnedLinks } from "@/lib/menu"

function render(
  ids: string[],
  { activeId = null, editing = false }: { activeId?: string | null; editing?: boolean } = {}
) {
  const actions = {
    editing,
    places: [],
    openUrl: null,
    activeId,
    startLinkId: null,
    stayLoaded: null,
    pinnedIds: ids,
    open: () => {},
    update: () => {},
  }
  const menu = { ...defaultMenu(), pinnedLinkIds: ids }
  return renderToStaticMarkup(
    <MenuActionsContext.Provider value={actions}>
      <PinnedLinks links={pinnedLinks(menu)} onUnpin={() => {}} />
    </MenuActionsContext.Provider>
  )
}

describe("Pinned in the left menu", () => {
  it("shows its links in the order they were pinned, the open one marked", () => {
    const html = render(
      ["link-cms-listings", "link-cms-dashboard", "link-project-dashboard"],
      { activeId: "link-cms-listings" }
    )
    expect(html).toContain('aria-label="Pinned"')
    const labels = [...html.matchAll(/<span class="truncate">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(labels).toEqual(["Pinned", "Listings", "Dashboard", "My dashboard"])
    expect(html).toMatch(/href="\/localhost:3015\/admin\/listings"[^>]*data-active=""/)
  })

  it("gives each link a drag handle and an × that unpins it only while editing", () => {
    const ids = ["link-cms-listings", "link-project-dashboard"]
    expect(render(ids)).not.toContain("Unpin")
    expect(render(ids)).not.toContain("Drag")
    const html = render(ids, { editing: true })
    expect(html).toContain('aria-label="Unpin Listings"')
    expect(html).toContain('aria-label="Unpin My dashboard"')
    expect(html).toContain('aria-label="Drag Listings"')
    expect(html).toContain('aria-label="Drag My dashboard"')
  })

  it("draws nothing while no link is pinned", () => {
    expect(render([])).toBe("")
    expect(render(["gone"])).toBe("")
  })
})
