import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { MenuActionsContext } from "@/components/menu-links"
import { PanelFrame } from "@/components/panel-frame"
import { Sidebar } from "@/components/sidebar"
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle"
import { TopBar } from "@/components/top-bar"
import { Button } from "@/components/ui/button"
import type { PlaceChoice } from "@/components/link-editor"
import { activeLinkId, DEFAULT_SIDEBAR_WIDTH, subLinksOf, type Menu } from "@/lib/menu"
import { useMenu } from "@/lib/use-menu"
import { useOpenScreen } from "@/lib/use-open-screen"
import { cn } from "@/lib/utils"

/** Where a link can be put: the top bar, each section, and under each left-menu link. */
function placesOf(menu: Menu): PlaceChoice[] {
  return [
    { place: { kind: "top" }, label: "Top bar" },
    ...menu.sections.map((section) => ({
      place: { kind: "section" as const, sectionId: section.id },
      label: section.title || "Untitled section",
    })),
    ...menu.sections.flatMap((section) =>
      section.links.map((link) => ({
        place: { kind: "under" as const, linkId: link.id },
        label: `Under ${link.label}`,
      }))
    ),
  ]
}

/**
 * Personal: a left menu and a top bar of links, and the middle panel showing
 * another app's screen. `workspace/docs/README.md` says what it is for.
 */
export function App() {
  const { loaded, reload, update, saveStatus, retrySave } = useMenu()
  const { screen, open, goHome, report } = useOpenScreen()
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Adding, editing and dragging links only show while this is on. It starts
  // off on every visit, so the menu reads as a plain menu.
  const [editing, setEditing] = React.useState(false)

  if (loaded.state !== "ready") {
    return (
      <main className="shell-canvas flex min-h-svh items-center justify-center p-4">
        {loaded.state === "loading" ? (
          <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading the menu
          </span>
        ) : (
          <div role="alert" className="flex max-w-md flex-col items-start gap-3 rounded-lg border bg-card p-4 text-sm">
            <p className="font-medium">The menu did not load.</p>
            <p className="text-muted-foreground">{loaded.error}</p>
            <Button size="sm" onClick={reload}>
              Try again
            </Button>
          </div>
        )}
      </main>
    )
  }

  const menu = loaded.menu
  const sidebarWidth = menu.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH
  const activeId = activeLinkId(menu, screen.url)
  const actions = {
    editing,
    places: placesOf(menu),
    openUrl: screen.url,
    activeId,
    open: (url: string) => {
      setMenuOpen(false)
      open(url)
    },
    update,
  }

  return (
    <MenuActionsContext.Provider value={actions}>
      <div
        data-sidebar-root=""
        className="flex h-svh bg-sidebar text-sidebar-foreground"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
      >
        {menuOpen ? (
          <button
            type="button"
            aria-label="Close the menu"
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <aside
          className={cn(
            // The menu's edge, and the top bar's below it, are the theme's
            // line at half strength: Tyler asked for them fainter on 16 Oct
            // 2026. The theme file is Custom Shell's, so it stays as it is.
            "w-(--sidebar-width) shrink-0 border-r border-sidebar-border/50 bg-sidebar",
            // On a phone the menu opens over the page; from 768px it always
            // sits in its own column, even if it was left open on a phone.
            menuOpen ? "fixed inset-y-0 left-0 z-40 block md:static md:z-auto" : "hidden md:block"
          )}
        >
          <div className="relative h-full">
            <Sidebar
              menu={menu}
              update={update}
              editing={editing}
              onHome={() => {
                setMenuOpen(false)
                goHome()
              }}
            />
            <SidebarResizeHandle
              width={sidebarWidth}
              onCommit={(width) => update((m) => ({ ...m, sidebarWidth: width }))}
            />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            menu={menu}
            subLinks={subLinksOf(menu, activeId)}
            saveStatus={saveStatus}
            onRetrySave={retrySave}
            onOpenMenu={() => setMenuOpen(true)}
            editing={editing}
            onEditingChange={setEditing}
          />
          <main id="main-content" className="shell-canvas flex min-h-0 flex-1 flex-col">
            {screen.url && screen.frameUrl ? (
              <PanelFrame
                url={screen.frameUrl}
                load={screen.load}
                title={screen.title}
                onReport={report}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-4">
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  Pick a screen from the left menu. To add one, open the cog at the
                  top right and turn on Edit the menu.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </MenuActionsContext.Provider>
  )
}
