import * as React from "react"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
  Loader2Icon,
  LogOutIcon,
  PaletteIcon,
  PinIcon,
  RotateCwIcon,
  SettingsIcon,
} from "lucide-react"

import type { PlaceChoice } from "@/components/link-editor"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { KEPT_FRAME_CHOICES } from "@/lib/frames"
import {
  MAX_SIDEBAR_SHADE,
  MIN_SIDEBAR_SHADE,
  parseAppUrl,
  personalPath,
  placeKey,
  sidebarShadeLabel,
  type Place,
} from "@/lib/menu"
import { recentScreenLabel, type RecentScreen } from "@/lib/recent-screens"
import type { SaveStatus } from "@/lib/use-menu"
import { PANEL_ZOOMS, zoomLabel, type PanelZoom } from "@/lib/use-panel-view"

/** What the controls at the bottom of the menu can do to the screen in the middle panel. */
export type PanelControls = {
  /** The open screen, or null on the start page. */
  screen: { url: string; title: string } | null
  canGoBack: boolean
  canGoForward: boolean
  back: () => void
  forward: () => void
  reload: () => void
  recent: RecentScreen[]
  openRecent: (url: string, title: string) => void
  /** Whether the open screen has no menu link of its own yet. */
  canPin: boolean
  places: PlaceChoice[]
  pin: (place: Place) => void
  zoom: PanelZoom
  setZoom: (zoom: PanelZoom) => void
  phone: boolean
  setPhone: (phone: boolean) => void
  /** How many screens stay loaded, kept by this browser. */
  kept: number
  setKept: (kept: number) => void
  /** The left menu's shade, saved to the menu file. */
  shade: number
  setShade: (shade: number) => void
}

/** A plain click opens the screen in the panel; a modified click is left to the browser. */
function openOnClick(open: () => void) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    open()
  }
}

/** An icon button with its name in a tooltip. */
function FooterButton({
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

/** The last ten screens, newest first, each opening like a menu link. */
function RecentItems({ panel }: { panel: PanelControls }) {
  if (panel.recent.length === 0) {
    return <p className="px-2 py-1.5 text-sm text-muted-foreground">No screens opened yet.</p>
  }
  return panel.recent.map((screen) => (
    <DropdownMenuItem key={screen.url} asChild>
      <a
        href={personalPath(screen.url)}
        onClick={openOnClick(() => panel.openRecent(screen.url, screen.title))}
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

/** Where the open screen can be pinned: the bottom list, each section, and under each section link. */
function PinItems({ panel }: { panel: PanelControls }) {
  return panel.places.map((choice) => (
    <DropdownMenuItem key={placeKey(choice.place)} onSelect={() => panel.pin(choice.place)}>
      <span className="truncate">{choice.label}</span>
    </DropdownMenuItem>
  ))
}

/**
 * A save under way or one that failed, as one icon for the folded menu: the
 * spinner, or a red mark whose tooltip gives the reason and whose click
 * tries again.
 */
function FoldedSaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle" || status === "saved") return null
  if (status === "saving") {
    return (
      <span role="status" className="flex size-7 items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        <span className="sr-only">Saving</span>
      </span>
    )
  }
  return (
    <FooterButton
      label={`Not saved: ${status.failed}. Click to try again.`}
      className="text-destructive hover:text-destructive"
      onClick={onRetry}
    >
      <AlertCircleIcon />
    </FooterButton>
  )
}

/** Only a save under way or one that failed shows; a finished save says nothing. */
function SaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle" || status === "saved") return null
  if (status === "saving") {
    return (
      <span role="status" className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Saving
      </span>
    )
  }
  return (
    <span role="alert" className="flex min-w-0 items-center gap-2 px-2 text-xs text-destructive">
      <span className="min-w-0 truncate">Not saved: {status.failed}</span>
      <Button variant="outline" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </span>
  )
}

type CogView = "main" | "recent" | "pin" | "zoom" | "kept" | "shade"

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
 * The slider that makes the left menu lighter or darker, changing it as it
 * moves. Tyler asked for it on 18 Oct 2026.
 */
function ShadeControl({ panel }: { panel: PanelControls }) {
  return (
    <>
      <div className="flex flex-col gap-2 px-2 py-2">
        <Slider
          aria-label="Menu shade"
          aria-valuetext={sidebarShadeLabel(panel.shade)}
          min={MIN_SIDEBAR_SHADE}
          max={MAX_SIDEBAR_SHADE}
          step={1}
          value={[panel.shade]}
          onValueChange={([shade]) => panel.setShade(shade)}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Darker</span>
          <span>{sidebarShadeLabel(panel.shade)}</span>
          <span>Lighter</span>
        </div>
      </div>
      {panel.shade ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              panel.setShade(0)
            }}
          >
            Back to the default shade
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  )
}

/**
 * The cog: opening the screen in its own tab, recent screens, pinning, zoom,
 * phone view, how many screens stay loaded, the menu's shade, "Edit the menu"
 * and Sign out. The recent screens, the pin places, the zoom, the screens kept
 * loaded and the shade are lists the dropdown steps into, since the shell's
 * dropdown has no sub-menus.
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
      <DropdownMenuContent side="top" align="end" className={view === "main" ? "w-56" : "w-72"}>
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
        ) : view === "kept" ? (
          <>
            <StepOutItem label="Screens kept loaded" onStep={() => setView("main")} />
            {KEPT_FRAME_CHOICES.map((kept) => (
              <DropdownMenuCheckboxItem
                key={kept}
                checked={panel.kept === kept}
                onCheckedChange={() => panel.setKept(kept)}
              >
                {kept}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : view === "shade" ? (
          <>
            <StepOutItem label="Menu shade" onStep={() => setView("main")} />
            <ShadeControl panel={panel} />
          </>
        ) : (
          <>
            {screen ? (
              <DropdownMenuItem asChild>
                <a href={screen.url} target="_blank" rel="noopener">
                  <ExternalLinkIcon />
                  Open in its own tab
                </a>
              </DropdownMenuItem>
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
            <StepInItem
              label={
                <>
                  Screens kept loaded
                  <span className="text-muted-foreground">{panel.kept}</span>
                </>
              }
              onStep={() => setView("kept")}
            />
            <StepInItem
              label={
                <>
                  <PaletteIcon />
                  Menu shade
                  <span className="text-muted-foreground">{sidebarShadeLabel(panel.shade)}</span>
                </>
              }
              onStep={() => setView("shade")}
            />
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
 * The bottom of the left menu: whether the menu is saving, then Back,
 * Forward, Reload and the cog. Personal has no top bar, so each app's own top
 * navigation shows at the top of the middle panel instead. Tyler moved these
 * here on 18 Oct 2026. In the folded menu only the cog stays, under the save
 * state: Tyler's pick on 22 Oct 2026.
 */
export function SidebarFooter({
  panel,
  saveStatus,
  onRetrySave,
  editing,
  onEditingChange,
  onSignOut,
  folded,
}: {
  panel: PanelControls
  saveStatus: SaveStatus
  onRetrySave: () => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onSignOut: () => void
  folded: boolean
}) {
  const cog = (
    <CogMenu
      panel={panel}
      editing={editing}
      onEditingChange={onEditingChange}
      onSignOut={onSignOut}
    />
  )
  if (folded) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-sidebar-border/50 p-2">
        <FoldedSaveState status={saveStatus} onRetry={onRetrySave} />
        {cog}
      </div>
    )
  }

  return (
    <div className="flex shrink-0 flex-col gap-1 border-t border-sidebar-border/50 p-2">
      <SaveState status={saveStatus} onRetry={onRetrySave} />
      <div className="flex items-center">
        <FooterButton label="Back" disabled={!panel.canGoBack} onClick={panel.back}>
          <ArrowLeftIcon />
        </FooterButton>
        <FooterButton label="Forward" disabled={!panel.canGoForward} onClick={panel.forward}>
          <ArrowRightIcon />
        </FooterButton>
        {panel.screen ? (
          <FooterButton label="Reload" onClick={panel.reload}>
            <RotateCwIcon />
          </FooterButton>
        ) : null}
        <div className="ml-auto">{cog}</div>
      </div>
    </div>
  )
}
