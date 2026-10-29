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
import { useColourMode } from "@/lib/colour-mode"
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
  setSidebarShade,
  sidebarShadeColor,
  startLink,
  stayLoadedLink,
  type Menu,
} from "@/lib/menu"
import { useFavicon } from "@/lib/use-favicon"
import { useMenu } from "@/lib/use-menu"
import { useWideScreen } from "@/lib/use-menu-form-side"
import { useOpenScreen } from "@/lib/use-open-screen"
import { usePanelView } from "@/lib/use-panel-view"
import { useRememberedOpen } from "@/lib/use-remembered-open"
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
  const view = usePanelView()
  const colour = useColourMode()
  const screens = useOpenScreen(
    startLink(menu)?.url ?? null,
    stayLoadedLink(menu)?.url ?? null,
    (url) => screenName(menu, url),
    view.kept,
    menu.brand?.name
  )
  const { frames, screen, open, goHome } = screens
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Adding, editing and dragging links only show while this is on. It starts
  // off on every visit, so the menu reads as a plain menu.
  const [editing, setEditingState] = React.useState(false)
  // Folded down to icons, remembered by this browser (Tyler's pick, 22 Oct
  // 2026). Only beside the page: a phone's menu opens over it, always whole.
  const [unfolded, setUnfolded] = useRememberedOpen("personal-sidebar")
  const wide = useWideScreen()
  const folded = wide && !unfolded
  const setFolded = (next: boolean) => {
    if (wide) setUnfolded(!next)
  }
  // The folded menu has no room for the edit controls, so switching editing
  // on unfolds it.
  const setEditing = (next: boolean) => {
    setEditingState(next)
    if (next) setFolded(false)
  }

  const sidebarWidth = menu.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH
  const sidebarShade = sidebarShadeColor(menu.sidebarShade ?? 0)
  const activeId = activeLinkId(menu, screen?.url ?? null)
  useFavicon(menu.brand?.logo)
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
    stayLoaded: stayLoadedLink(menu),
    pinnedIds: menu.pinnedLinkIds ?? [],
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
    kept: view.kept,
    setKept: view.setKept,
    shade: menu.sidebarShade ?? 0,
    setShade: (shade) => update((m) => setSidebarShade(m, shade)),
    colourMode: colour.mode,
    setColourMode: colour.setMode,
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
            style={
              {
                "--sidebar-width": `${sidebarWidth}px`,
                // The theme's file is Custom Shell's, so the chosen shade
                // replaces the menu's colour here instead.
                ...(sidebarShade ? { "--sidebar": sidebarShade } : {}),
              } as React.CSSProperties
            }
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
                "shrink-0 border-r border-sidebar-border/50 bg-sidebar",
                // Folded is Custom Shell's 3rem: a 32px icon and 8px either side.
                folded ? "w-12" : "w-(--sidebar-width)",
                // On a phone the menu opens over the page; from 768px it always
                // sits in its own column, even if it was left open on a phone.
                menuOpen ? "fixed inset-y-0 left-0 z-40 block md:static md:z-auto" : "hidden md:block"
              )}
            >
              <div className="relative h-full">
                <Sidebar
                  menu={shown}
                  update={update}
                  editing={editing}
                  onEditingChange={setEditing}
                  folded={folded}
                  onFoldedChange={setFolded}
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
                      folded={folded}
                    />
                  }
                />
                <SidebarResizeHandle
                  width={sidebarWidth}
                  onCommit={(width) => update((m) => ({ ...m, sidebarWidth: width }))}
                  folded={folded}
                  onToggleFolded={() => setFolded(!folded)}
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
