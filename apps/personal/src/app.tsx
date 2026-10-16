import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { MenuActionsContext } from "@/components/menu-links"
import { PanelFrame } from "@/components/panel-frame"
import { Sidebar } from "@/components/sidebar"
import { TopBar } from "@/components/top-bar"
import { Button } from "@/components/ui/button"
import { activeLinkId, type Menu } from "@/lib/menu"
import { useMenu } from "@/lib/use-menu"
import { useOpenScreen } from "@/lib/use-open-screen"
import { cn } from "@/lib/utils"

function placesOf(menu: Menu) {
  return [
    { place: { kind: "top" as const }, label: "Top bar" },
    ...menu.sections.map((section) => ({
      place: { kind: "section" as const, sectionId: section.id },
      label: section.title || "Untitled section",
    })),
  ]
}

/**
 * Personal: a left menu and a top bar of links, and the middle panel showing
 * another app's screen. `workspace/docs/README.md` says what it is for.
 */
export function App() {
  const { loaded, reload, update, saveStatus, retrySave } = useMenu()
  const { screen, open, report } = useOpenScreen()
  const [menuOpen, setMenuOpen] = React.useState(false)

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
  const actions = {
    places: placesOf(menu),
    openUrl: screen.url,
    activeId: activeLinkId(menu, screen.url),
    open: (url: string) => {
      setMenuOpen(false)
      open(url)
    },
    update,
  }

  return (
    <MenuActionsContext.Provider value={actions}>
      <div className="flex h-svh bg-sidebar text-sidebar-foreground">
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
            "w-60 shrink-0 border-r border-sidebar-border bg-sidebar",
            // On a phone the menu opens over the page; from 768px it always
            // sits in its own column, even if it was left open on a phone.
            menuOpen ? "fixed inset-y-0 left-0 z-40 block md:static md:z-auto" : "hidden md:block"
          )}
        >
          <Sidebar menu={menu} update={update} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            menu={menu}
            saveStatus={saveStatus}
            onRetrySave={retrySave}
            onOpenMenu={() => setMenuOpen(true)}
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
                  Pick a screen from the left menu. To add one, press Add link under
                  any section, or + in the top bar.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </MenuActionsContext.Provider>
  )
}
