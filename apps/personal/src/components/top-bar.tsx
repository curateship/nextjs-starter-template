import * as React from "react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
  Loader2Icon,
  LogOutIcon,
  MenuIcon,
  PinIcon,
  RotateCwIcon,
  SettingsIcon,
} from "lucide-react"

import type { PlaceChoice } from "@/components/link-editor"
import { LinkIconPicture } from "@/components/link-icon"
import {
  AddLinkButton,
  linkAnchorProps,
  OwnTabMark,
  SortableLinks,
  useMenuActions,
} from "@/components/menu-links"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  parseAppUrl,
  personalPath,
  placeKey,
  type Menu,
  type MenuLink,
  type Place,
} from "@/lib/menu"
import { recentScreenLabel, type RecentScreen } from "@/lib/recent-screens"
import type { SaveStatus } from "@/lib/use-menu"
import { PANEL_ZOOMS, zoomLabel, type PanelZoom } from "@/lib/use-panel-view"
import { cn } from "@/lib/utils"

/** What the top bar can do to the screen in the middle panel. */
export type PanelControls = {
  /** The open screen, or null on the start page. */
  screen: { url: string; title: string } | null
  /** The open screen's name, shown when no sub-link row names it. */
  name: string | null
  canGoBack: boolean
  canGoForward: boolean
  back: () => void
  forward: () => void
  reload: () => void
  recent: RecentScreen[]
  openRecent: (url: string) => void
  /** Whether the open screen has no menu link of its own yet. */
  canPin: boolean
  places: PlaceChoice[]
  pin: (place: Place) => void
  zoom: PanelZoom
  setZoom: (zoom: PanelZoom) => void
  phone: boolean
  setPhone: (phone: boolean) => void
}

/** A plain click opens the screen in the panel; a modified click is left to the browser. */
function openOnClick(open: (url: string) => void, url: string) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    open(url)
  }
}

/** An icon button in the bar with its name in a tooltip. */
function BarButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** A bar button that opens a dropdown, with its name in a tooltip. */
function BarMenu({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={label}>
              {icon}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The last ten screens, newest first, each opening like a menu link. */
function RecentItems({ panel }: { panel: PanelControls }) {
  if (panel.recent.length === 0) {
    return <p className="px-2 py-1.5 text-sm text-muted-foreground">No screens opened yet.</p>
  }
  return panel.recent.map((screen) => (
    <DropdownMenuItem key={screen.url} asChild>
      <a
        href={personalPath(screen.url)}
        onClick={openOnClick(panel.openRecent, screen.url)}
        className="flex-col items-start gap-0"
      >
        <span className="max-w-full truncate">{recentScreenLabel(screen)}</span>
        <span className="max-w-full truncate text-xs text-muted-foreground">
          {parseAppUrl(screen.url)?.host}
        </span>
      </a>
    </DropdownMenuItem>
  ))
}

/** Where the open screen can be pinned: the top bar, each section, and under each left-menu link. */
function PinItems({ panel }: { panel: PanelControls }) {
  return panel.places.map((choice) => (
    <DropdownMenuItem key={placeKey(choice.place)} onSelect={() => panel.pin(choice.place)}>
      <span className="truncate">{choice.label}</span>
    </DropdownMenuItem>
  ))
}

/**
 * The open link and its sub-links, at the top bar's left end, the way Custom
 * Shell's top left mirrors its menu. A row of links from 768px; on a phone,
 * one button naming the open one, with the rest in its dropdown.
 */
function SubLinks({ links }: { links: MenuLink[] }) {
  const { activeId, open } = useMenuActions()
  const current = links.find((link) => link.id === activeId) ?? links[0]

  return (
    <>
      <ul aria-label="Sub-links" className="hidden min-w-0 shrink items-center gap-1 md:flex">
        {links.map((link) => {
          const active = link.id === activeId
          return (
            <li key={link.id} className="min-w-0">
              <a
                {...linkAnchorProps(link, open)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap outline-hidden transition-all focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-3.5 [&_svg]:shrink-0",
                  active ? "bg-muted text-foreground" : "hover:bg-muted"
                )}
              >
                <LinkIconPicture name={link.icon} />
                <span className="truncate">{link.label}</span>
                <OwnTabMark link={link} />
              </a>
            </li>
          )
        })}
      </ul>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="min-w-0 shrink gap-1.5 md:hidden">
            <LinkIconPicture name={current.icon} />
            <span className="min-w-0 truncate">{current.label}</span>
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-40">
          {links.map((link) => (
            <DropdownMenuItem
              key={link.id}
              asChild
              className={cn(link.id === activeId && "bg-accent text-accent-foreground")}
            >
              <a
                {...linkAnchorProps(link, open)}
                aria-current={link.id === activeId ? "page" : undefined}
              >
                <LinkIconPicture name={link.icon} />
                {link.label}
                <OwnTabMark link={link} />
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function SaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null
  if (status === "saving") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Saving
      </span>
    )
  }
  if (status === "saved") {
    return (
      <span role="status" className="text-xs text-muted-foreground">
        Saved
      </span>
    )
  }
  return (
    <span role="alert" className="flex min-w-0 items-center gap-2 text-xs text-destructive">
      <span className="truncate">Not saved: {status.failed}</span>
      <Button variant="outline" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </span>
  )
}

type CogView = "main" | "recent" | "pin" | "zoom"

/** A row that steps into one of the cog's lists. */
function StepInItem({ label, onStep }: { label: React.ReactNode; onStep: () => void }) {
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        // Keep the dropdown open; it shows the list instead.
        event.preventDefault()
        onStep()
      }}
    >
      {label}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuItem>
  )
}

/** The row at the top of one of the cog's lists, which steps back out of it. */
function StepOutItem({ label, onStep }: { label: string; onStep: () => void }) {
  return (
    <>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault()
          onStep()
        }}
      >
        <ChevronLeftIcon />
        <span className="font-medium">{label}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}

/**
 * The cog: the zoom, phone view, "Edit the menu" and Sign out at every
 * width. On a phone, where the bar has no room for them, the panel's buttons
 * are here too. The recent screens, the pin places and the zoom are lists the dropdown
 * steps into, since the shell's dropdown has no sub-menus.
 */
function CogMenu({
  panel,
  editing,
  onEditingChange,
  onSignOut,
}: {
  panel: PanelControls
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onSignOut: () => void
}) {
  const [view, setView] = React.useState<CogView>("main")
  const { screen } = panel

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setView("main")
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Settings">
              <SettingsIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className={view === "main" ? "w-56" : "w-72"}>
        {view === "recent" ? (
          <>
            <StepOutItem label="Recent screens" onStep={() => setView("main")} />
            <RecentItems panel={panel} />
          </>
        ) : view === "pin" ? (
          <>
            <StepOutItem label="Pin to the menu" onStep={() => setView("main")} />
            <PinItems panel={panel} />
          </>
        ) : view === "zoom" ? (
          <>
            <StepOutItem label="Zoom" onStep={() => setView("main")} />
            {PANEL_ZOOMS.map((zoom) => (
              <DropdownMenuCheckboxItem
                key={zoom}
                checked={panel.zoom === zoom}
                onCheckedChange={() => panel.setZoom(zoom)}
              >
                {zoomLabel(zoom)}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : (
          <>
            <DropdownMenuGroup className="md:hidden">
              <DropdownMenuItem disabled={!panel.canGoBack} onSelect={panel.back}>
                <ArrowLeftIcon />
                Back
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!panel.canGoForward} onSelect={panel.forward}>
                <ArrowRightIcon />
                Forward
              </DropdownMenuItem>
              {screen ? (
                <>
                  <DropdownMenuItem onSelect={panel.reload}>
                    <RotateCwIcon />
                    Reload
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={screen.url} target="_blank" rel="noopener">
                      <ExternalLinkIcon />
                      Open in its own tab
                    </a>
                  </DropdownMenuItem>
                </>
              ) : null}
              <StepInItem
                label={
                  <>
                    <HistoryIcon />
                    Recent screens
                  </>
                }
                onStep={() => setView("recent")}
              />
              {panel.canPin ? (
                <StepInItem
                  label={
                    <>
                      <PinIcon />
                      Pin to the menu
                    </>
                  }
                  onStep={() => setView("pin")}
                />
              ) : null}
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
            <StepInItem
              label={
                <>
                  Zoom
                  <span className="text-muted-foreground">
                    {panel.phone ? "Off in phone view" : zoomLabel(panel.zoom)}
                  </span>
                </>
              }
              onStep={() => setView("zoom")}
            />
            <DropdownMenuCheckboxItem checked={panel.phone} onCheckedChange={panel.setPhone}>
              Phone view
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={editing} onCheckedChange={onEditingChange}>
              Edit the menu
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The top bar. At the left: Back and Forward, then the open link's sub-links
 * when it has any, or else the open screen's name. At the right: the bar's
 * own links with a + to add one while editing, the panel's reload, pop-out,
 * recent screens and pin, whether the menu is saved, and the cog. On a phone
 * the panel's buttons move into the cog.
 */
export function TopBar({
  menu,
  subLinks,
  saveStatus,
  onRetrySave,
  onOpenMenu,
  editing,
  onEditingChange,
  panel,
  onSignOut,
}: {
  menu: Menu
  /** The open link and its sub-links, or null. */
  subLinks: MenuLink[] | null
  saveStatus: SaveStatus
  onRetrySave: () => void
  onOpenMenu: () => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
  panel: PanelControls
  onSignOut: () => void
}) {
  const { screen } = panel

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/50 bg-sidebar px-4 text-sidebar-foreground">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open the menu"
        onClick={onOpenMenu}
      >
        <MenuIcon />
      </Button>
      <div className="hidden shrink-0 items-center md:flex">
        <BarButton label="Back" disabled={!panel.canGoBack} onClick={panel.back}>
          <ArrowLeftIcon />
        </BarButton>
        <BarButton label="Forward" disabled={!panel.canGoForward} onClick={panel.forward}>
          <ArrowRightIcon />
        </BarButton>
      </div>
      {/* The open link's sub-links at the left end, which also takes up the
          spare room, so the bar's own links sit at the right, next to the
          cog. Tyler asked for them on the right on 16 Oct 2026. It starts
          from its own width (flex-auto, not flex-1), so on a narrow bar both
          halves give up room together and the open screen's name isn't the
          first thing cut. With no sub-link row, the open screen's name
          stands there instead. */}
      <div className="flex min-w-0 flex-auto items-center">
        {subLinks ? (
          <SubLinks links={subLinks} />
        ) : panel.name ? (
          <span className="truncate px-1 text-sm font-medium">{panel.name}</span>
        ) : null}
      </div>
      <nav aria-label="Top links" className="flex min-w-0 shrink items-center justify-end">
        <SortableLinks
          links={menu.top}
          place={{ kind: "top" }}
          orientation="horizontal"
          className="min-w-0"
          dropClassName="flex min-w-0 items-center gap-1"
        >
          <AddLinkButton place={{ kind: "top" }} label="Add a link to the top bar" look="icon" />
        </SortableLinks>
      </nav>
      {screen ? (
        <div className="hidden shrink-0 items-center md:flex">
          <BarButton label="Reload" onClick={panel.reload}>
            <RotateCwIcon />
          </BarButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={screen.url} target="_blank" rel="noopener" aria-label="Open in its own tab">
                  <ExternalLinkIcon />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in its own tab</TooltipContent>
          </Tooltip>
          {panel.canPin ? (
            <BarMenu label="Pin to the menu" icon={<PinIcon />}>
              <DropdownMenuLabel>Pin to</DropdownMenuLabel>
              <PinItems panel={panel} />
            </BarMenu>
          ) : null}
        </div>
      ) : null}
      <div className="hidden shrink-0 md:flex">
        <BarMenu label="Recent screens" icon={<HistoryIcon />}>
          <DropdownMenuLabel>Recent screens</DropdownMenuLabel>
          <RecentItems panel={panel} />
        </BarMenu>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 sm:max-w-80">
        <SaveState status={saveStatus} onRetry={onRetrySave} />
        <CogMenu
          panel={panel}
          editing={editing}
          onEditingChange={onEditingChange}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  )
}
