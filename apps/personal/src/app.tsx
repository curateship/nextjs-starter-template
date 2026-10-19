import * as React from "react"
import { Loader2Icon, MenuIcon } from "lucide-react"

import type { PlaceChoice } from "@/components/link-editor"
import { MenuDrag } from "@/components/menu-drag"
import { MenuActionsContext } from "@/components/menu-links"
import { PanelFrames, type AppMenuControls } from "@/components/panel-frame"
import { SignIn } from "@/components/sign-in"
import { Sidebar } from "@/components/sidebar"
import { SidebarFooter, type PanelControls } from "@/components/sidebar-footer"
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle"
import { Button } from "@/components/ui/button"
import {
  activeLinkId,
  addLink,
  allLinks,
  appMenuWidth,
  DEFAULT_SIDEBAR_WIDTH,
  hasLinkTo,
  newId,
  parseAppUrl,
  screenName,
  setAppMenuWidth,
  startLink,
  type Menu,
} from "@/lib/menu"
import { useMenu } from "@/lib/use-menu"
import { useOpenScreen } from "@/lib/use-open-screen"
import { usePanelView } from "@/lib/use-panel-view"
import { useSession } from "@/lib/use-session"
import { cn } from "@/lib/utils"

/** Where a link can be put: the bottom of the menu, each section, and under each section link. */
function placesOf(menu: Menu): PlaceChoice[] {
  return [
    { place: { kind: "top" }, label: "Bottom of the menu" },
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
 * Personal: a left menu, and the middle panel showing another app's screen
 * with the app's own top navigation. `workspace/docs/README.md` says what it
 * is for.
 */
export function App() {
  const { session, check, signIn, signOut, expired } = useSession()
  // The menu lives above the sign-in, so a change the sign-in running out
  // stopped is still here to save once signed in again.
  const { loaded, reload, update, saveStatus, retrySave } = useMenu(
    session.state === "signed-in",
    expired
  )

  if (session.state === "signed-out") {
    return <SignIn passwordSet={session.passwordSet} onSignIn={signIn} onCheckAgain={check} />
  }
  if (session.state === "checking") return <Waiting>Checking your sign-in</Waiting>
  if (session.state === "failed") {
    return <Failed title="The sign-in check did not finish." error={session.error} onRetry={check} />
  }
  if (loaded.state === "loading") return <Waiting>Loading the menu</Waiting>
  if (loaded.state === "failed") {
    return <Failed title="The menu did not load." error={loaded.error} onRetry={reload} />
  }

  return (
    <Personal
      menu={loaded.menu}
      update={update}
      saveStatus={saveStatus}
      retrySave={retrySave}
      onSignOut={() => void signOut()}
    />
  )
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell-canvas flex min-h-svh items-center justify-center p-4">
      <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {children}
      </span>
    </main>
  )
}

function Failed({ title, error, onRetry }: { title: string; error: string; onRetry: () => void }) {
  return (
    <main className="shell-canvas flex min-h-svh items-center justify-center p-4">
      <div role="alert" className="flex max-w-md flex-col items-start gap-3 rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{error}</p>
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </main>
  )
}

/**
 * The page once the menu has loaded. It waits for the menu so a visit to the
 * bare address can open the start screen straight away.
 */
function Personal({
  menu,
  update,
  saveStatus,
  retrySave,
  onSignOut,
}: {
  menu: Menu
  update: (change: (menu: Menu) => Menu) => void
  onSignOut: () => void
} & Pick<ReturnType<typeof useMenu>, "saveStatus" | "retrySave">) {
  const screens = useOpenScreen(
    startLink(menu)?.url ?? null,
    (url) => screenName(menu, url),
    menu.brand?.name
  )
  const { frames, screen, open, goHome } = screens
  const view = usePanelView()
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Adding, editing and dragging links only show while this is on. It starts
  // off on every visit, so the menu reads as a plain menu.
  const [editing, setEditing] = React.useState(false)

  const sidebarWidth = menu.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH
  const activeId = activeLinkId(menu, screen?.url ?? null)
  const places = placesOf(menu)
  const openAt = (url: string, linkId?: string, title?: string) => {
    setMenuOpen(false)
    open(url, title ?? allLinks(menu).find((link) => link.id === linkId)?.label)
  }
  const actions = {
    editing,
    places,
    openUrl: screen?.url ?? null,
    activeId,
    startLinkId: menu.startLinkId ?? null,
    open: openAt,
    update,
  }
  const panel: PanelControls = {
    screen,
    canGoBack: screens.canGoBack,
    canGoForward: screens.canGoForward,
    back: screens.back,
    forward: screens.forward,
    reload: screens.reload,
    recent: screens.recent,
    openRecent: (url, title) => openAt(url, undefined, title),
    canPin: screen !== null && !hasLinkTo(menu, screen.url),
    places,
    // Pinning works with editing off: it is the one quick menu change that
    // doesn't need the switch, or asking for it first defeats the point.
    pin: (place) => {
      if (!screen) return
      const label = (screen.title.trim() || parseAppUrl(screen.url)?.host || "Screen")
        .slice(0, 60)
        .trim()
      update((m) => addLink(m, place, { id: newId("link"), label, url: screen.url, icon: "link" }))
    },
    zoom: view.zoom,
    setZoom: view.setZoom,
    phone: view.phone,
    setPhone: view.setPhone,
  }

  const appMenu: AppMenuControls = {
    widthOf: (url) => appMenuWidth(menu, url),
    editing,
    setWidth: (host, width) => update((m) => setAppMenuWidth(m, host, width)),
  }

  return (
    <MenuActionsContext.Provider value={actions}>
      <MenuDrag menu={menu} update={update}>
        {(shown) => (
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
                // The menu's edge is the theme's line at half strength: Tyler
                // asked for it fainter on 16 Oct 2026. The theme file is Custom
                // Shell's, so it stays as it is.
                "w-(--sidebar-width) shrink-0 border-r border-sidebar-border/50 bg-sidebar",
                // On a phone the menu opens over the page; from 768px it always
                // sits in its own column, even if it was left open on a phone.
                menuOpen ? "fixed inset-y-0 left-0 z-40 block md:static md:z-auto" : "hidden md:block"
              )}
            >
              <div className="relative h-full">
                <Sidebar
                  menu={shown}
                  recent={screens.recent}
                  update={update}
                  editing={editing}
                  onHome={() => {
                    setMenuOpen(false)
                    goHome()
                  }}
                  footer={
                    <SidebarFooter
                      panel={panel}
                      saveStatus={saveStatus}
                      onRetrySave={retrySave}
                      editing={editing}
                      onEditingChange={setEditing}
                      onSignOut={onSignOut}
                    />
                  }
                />
                <SidebarResizeHandle
                  width={sidebarWidth}
                  onCommit={(width) => update((m) => ({ ...m, sidebarWidth: width }))}
                />
              </div>
            </aside>
            <main id="main-content" className="shell-canvas flex min-w-0 flex-1 flex-col">
              <PanelFrames
                frames={frames.kept}
                openId={frames.openId}
                view={{ zoom: view.zoom, phone: view.phone }}
                appMenu={appMenu}
              >
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <p className="max-w-sm text-center text-sm text-muted-foreground">
                    Pick a screen from the left menu. To add one, open the cog at the
                    bottom of the menu and turn on Edit the menu.
                  </p>
                </div>
              </PanelFrames>
            </main>
            {/* With no top bar, a phone opens the menu from the bottom-left
                corner, clear of the app's own top navigation. */}
            <Button
              variant="outline"
              size="icon"
              aria-label="Open the menu"
              className="fixed bottom-3 left-3 z-20 bg-sidebar shadow-sm md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <MenuIcon />
            </Button>
          </div>
        )}
      </MenuDrag>
    </MenuActionsContext.Provider>
  )
}
