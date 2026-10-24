import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MenuActionsContext } from "@/components/menu-links"
import { PinnedLinks } from "@/components/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { defaultMenu, pinnedLinks, placeOf } from "@/lib/menu"

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
    <TooltipProvider>
      <MenuActionsContext.Provider value={actions}>
        <PinnedLinks
          links={pinnedLinks(menu)}
          placeOf={(id) => placeOf(menu, id)}
          onUnpin={() => {}}
        />
      </MenuActionsContext.Provider>
    </TooltipProvider>
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

  it("gives each link a drag handle, a cog and an × that unpins it only while editing", () => {
    const ids = ["link-cms-listings", "link-project-dashboard"]
    expect(render(ids)).not.toContain("Unpin")
    expect(render(ids)).not.toContain("Drag")
    expect(render(ids)).not.toContain("Edit ")
    const html = render(ids, { editing: true })
    expect(html).toContain('aria-label="Edit Listings"')
    expect(html).toContain('aria-label="Edit My dashboard"')
    expect(html).toContain('aria-label="Unpin Listings"')
    expect(html).toContain('aria-label="Unpin My dashboard"')
    expect(html).toContain('aria-label="Drag Listings"')
    expect(html).toContain('aria-label="Drag My dashboard"')
  })

  it("gives each panel link an arrow to its site in a new tab, hidden while editing", () => {
    const ids = ["link-cms-listings"]
    expect(render(ids)).toMatch(
      /href="http:\/\/localhost:3015\/admin\/listings" target="_blank" rel="noopener" aria-label="Open Listings in a new tab"/
    )
    expect(render(ids, { editing: true })).not.toContain("in a new tab")
  })

  it("draws nothing while no link is pinned", () => {
    expect(render([])).toBe("")
    expect(render(["gone"])).toBe("")
  })
})
