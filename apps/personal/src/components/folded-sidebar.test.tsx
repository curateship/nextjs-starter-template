import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MenuActionsContext } from "@/components/menu-links"
import { Sidebar } from "@/components/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { defaultMenu, type Menu } from "@/lib/menu"

/** The starting menu plus a link with sub-links, one with no icon, and a tab link at the bottom. */
function menu(): Menu {
  const start = defaultMenu()
  start.sections[0].links.push({
    id: "link-reports",
    label: "reports",
    url: "http://localhost:3020/reports",
    children: [{ id: "link-weekly", label: "Weekly", url: "http://localhost:3020/reports/weekly" }],
  })
  start.top.push({ id: "link-ign", label: "IGN", url: "https://ign.com", icon: "star", opens: "tab" })
  return { ...start, pinnedLinkIds: ["link-cms-listings"] }
}

function render({
  folded,
  editing = false,
  activeId = null,
}: {
  folded: boolean
  editing?: boolean
  activeId?: string | null
}) {
  const actions = {
    editing,
    places: [],
    openUrl: null,
    activeId,
    startLinkId: null,
    stayLoaded: null,
    pinnedIds: ["link-cms-listings"],
    open: () => {},
    update: () => {},
  }
  return renderToStaticMarkup(
    <TooltipProvider>
      <MenuActionsContext.Provider value={actions}>
        <Sidebar
          menu={menu()}
          update={() => {}}
          editing={editing}
          onEditingChange={() => {}}
          folded={folded}
          onFoldedChange={() => {}}
          onHome={() => {}}
          footer={null}
        />
      </MenuActionsContext.Provider>
    </TooltipProvider>
  )
}

describe("the folded left menu", () => {
  it("shows Pinned, then each section's links, then the bottom links, as icons named for their links", () => {
    const html = render({ folded: true })
    const names = [...html.matchAll(/<a [^>]*aria-label="([^"]*)"/g)].map((m) => m[1])
    expect(names).toEqual([
      "Listings",
      "My dashboard",
      "reports",
      "Dashboard",
      "Listings",
      "IGN (opens in its own tab)",
    ])
  })

  it("hides section names and sub-links, and gives a link with no icon its first letter", () => {
    const html = render({ folded: true })
    expect(html).not.toContain(">Project<")
    expect(html).not.toContain("Weekly")
    expect(html).toMatch(/aria-label="reports"[^>]*>(?:(?!<\/a>).)*>r<\/span>/)
  })

  it("marks a link while one of its sub-links is open", () => {
    const html = render({ folded: true, activeId: "link-weekly" })
    expect(html).toMatch(/aria-label="reports"[^>]*data-active=""/)
  })

  it("turns the logo into the unfold button and has no fold, pencil or edit controls", () => {
    const html = render({ folded: true, editing: true })
    expect(html).toContain('aria-label="Unfold the menu"')
    expect(html).not.toContain("Fold the menu")
    expect(html).not.toContain("editing the menu")
    expect(html).not.toContain("Add section")
  })
})

describe("the logo row of the full menu", () => {
  it("has a pencil that turns editing on, and a button that folds the menu", () => {
    const html = render({ folded: false })
    expect(html).toMatch(/aria-label="Edit the menu"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Edit the menu"/)
    expect(html).toContain('aria-label="Fold the menu"')
    expect(html).not.toContain("Unfold the menu")
  })

  it("keeps the pencil pressed while editing, so it turns editing off", () => {
    const html = render({ folded: false, editing: true })
    expect(html).toMatch(/aria-label="Stop editing the menu"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Stop editing the menu"/)
  })
})

describe("the folded menu's section arrows", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("puts an arrow above Pinned and each section that hides its icons", () => {
    const html = render({ folded: true })
    const arrows = [...html.matchAll(/aria-label="(Hide [^"]*)" aria-expanded="true"/g)].map((m) => m[1])
    expect(arrows).toEqual(["Hide Pinned", "Hide Project", "Hide CMS"])
  })

  it("shows a section folded in the full menu folded here too, its arrow offering to show it", () => {
    const folded: Record<string, string> = { "personal-sidebar-section-section-cms": "closed" }
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => folded[key] ?? null } })
    const html = render({ folded: true })
    expect(html).toContain('aria-label="Show CMS" aria-expanded="false"')
    const names = [...html.matchAll(/<a [^>]*aria-label="([^"]*)"/g)].map((m) => m[1])
    expect(names).toEqual(["Listings", "My dashboard", "reports", "IGN (opens in its own tab)"])
  })
})
