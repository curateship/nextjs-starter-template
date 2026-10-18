import * as React from "react"
import { Loader2Icon } from "lucide-react"

import type { PlaceChoice } from "@/components/link-editor"
import { MenuDrag } from "@/components/menu-drag"
import { MenuActionsContext } from "@/components/menu-links"
import { PanelFrames } from "@/components/panel-frame"
import { SignIn } from "@/components/sign-in"
import { Sidebar } from "@/components/sidebar"
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle"
import { TopBar, type PanelControls } from "@/components/top-bar"
import { Button } from "@/components/ui/button"
import {
  activeLinkId,
  addLink,
  DEFAULT_SIDEBAR_WIDTH,
  hasLinkTo,
  newId,
  parseAppUrl,
  screenName,
  startLink,
  subLinksOf,
  type Menu,
} from "@/lib/menu"
import { useMenu } from "@/lib/use-menu"
import { useOpenScreen } from "@/lib/use-open-screen"
import { usePanelView } from "@/lib/use-panel-view"
import { useSession } from "@/lib/use-session"
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
  const screens = useOpenScreen(startLink(menu)?.url ?? null, menu.brand?.name)
  const { frames, screen, open, goHome, report } = screens
  const view = usePanelView()
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Adding, editing and dragging links only show while this is on. It starts
  // off on every visit, so the menu reads as a plain menu.
  const [editing, setEditing] = React.useState(false)

  const sidebarWidth = menu.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH
  const activeId = activeLinkId(menu, screen?.url ?? null)
  const places = placesOf(menu)
  const openAt = (url: string, linkId?: string) => {
    setMenuOpen(false)
    open(url, linkId ? (frameUrl) => activeLinkId(menu, frameUrl) === linkId : undefined)
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
    name: screenName(menu, screen?.url ?? null, screen?.title ?? ""),
    canGoBack: screens.canGoBack,
    canGoForward: screens.canGoForward,
    back: screens.back,
    forward: screens.forward,
    reload: screens.reload,
    recent: screens.recent,
    openRecent: (url) => openAt(url),
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
                  menu={shown}
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
                menu={shown}
                subLinks={subLinksOf(shown, activeId)}
                saveStatus={saveStatus}
                onRetrySave={retrySave}
                onOpenMenu={() => setMenuOpen(true)}
                editing={editing}
                onEditingChange={setEditing}
                panel={panel}
                onSignOut={onSignOut}
              />
              <main id="main-content" className="shell-canvas flex min-h-0 flex-1 flex-col">
                <PanelFrames
                  frames={frames.kept}
                  openId={frames.openId}
                  view={{ zoom: view.zoom, phone: view.phone }}
                  onReport={report}
                >
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <p className="max-w-sm text-center text-sm text-muted-foreground">
                      Pick a screen from the left menu. To add one, open the cog at the
                      top right and turn on Edit the menu.
                    </p>
                  </div>
                </PanelFrames>
              </main>
            </div>
          </div>
        )}
      </MenuDrag>
    </MenuActionsContext.Provider>
  )
}
