import * as React from "react"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
  LayersIcon,
  Loader2Icon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  PencilIcon,
  PinIcon,
  RotateCwIcon,
  SettingsIcon,
  SmartphoneIcon,
  SunIcon,
  ZoomInIcon,
} from "lucide-react"

import type { PlaceChoice } from "@/components/link-editor"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ColourMode } from "@/lib/colour-mode"
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
import { cn } from "@/lib/utils"

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
  /** Light, dark or the Mac's setting, kept by this browser. */
  colourMode: ColourMode
  setColourMode: (mode: ColourMode) => void
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

/**
 * The cog's main list is drawn to Tyler's picture of 28 Oct 2026, measured
 * off it: 36px rows with 10px sides, a grey icon 10px from its name, and
 * lines held 10px in from the edges.
 */
const COG_ROW = "h-9 gap-2.5 px-2.5"
const COG_ICON = "text-muted-foreground"
const COG_LINE = "mx-1 my-1.5"

/** A row that steps into one of the cog's lists, its current value on the right. */
function StepInItem({
  icon,
  label,
  value,
  onStep,
}: {
  icon: React.ReactNode
  label: string
  value?: React.ReactNode
  onStep: () => void
}) {
  return (
    <DropdownMenuItem
      className={COG_ROW}
      onSelect={(event) => {
        // Keep the dropdown open; it shows the list instead.
        event.preventDefault()
        onStep()
      }}
    >
      {icon}
      {label}
      <span className="ml-auto text-muted-foreground">{value}</span>
      <ChevronRightIcon className="text-muted-foreground/70" />
    </DropdownMenuItem>
  )
}

/** The small capitals over a group of the cog's rows. */
function CogHeading({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuLabel className="flex h-7.5 items-center px-2.5 text-[11px] tracking-wider text-muted-foreground/75 uppercase">
      {children}
    </DropdownMenuLabel>
  )
}

/**
 * The look of an on/off switch at the end of a row. The row itself is the
 * tick box people press and read, so this only draws its state.
 */
function RowSwitch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "ml-auto flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors",
        on ? "bg-foreground" : "bg-input"
      )}
    >
      <span
        className={cn(
          "size-3 rounded-full transition-transform",
          on ? "translate-x-3 bg-background" : "bg-muted-foreground"
        )}
      />
    </span>
  )
}

/**
 * A circle with its left half filled, as in Tyler's picture. Lucide's nearest,
 * Contrast, fills a smaller half on the right, so it is drawn here in Lucide's
 * own grid and stroke.
 */
function HalfCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor" />
    </svg>
  )
}

const COLOUR_CHOICES = [
  { mode: "system", icon: MonitorIcon, label: "Follow the Mac" },
  { mode: "light", icon: SunIcon, label: "Light" },
  { mode: "dark", icon: MoonIcon, label: "Dark" },
] satisfies { mode: ColourMode; icon: typeof MonitorIcon; label: string }[]

/** Follow the Mac, light or dark: three small square buttons in one box. */
function ColourModeButtons({
  value,
  onChange,
}: {
  value: ColourMode
  onChange: (mode: ColourMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Colour mode"
      className="ml-auto flex h-7.5 shrink-0 items-center gap-0.5 rounded-lg border bg-muted p-0.5 dark:bg-background/60"
    >
      {COLOUR_CHOICES.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          type="button"
          aria-label={label}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            "flex h-6 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            value === mode && "bg-background text-foreground shadow-sm dark:bg-input"
          )}
        >
          <Icon aria-hidden className="size-3.5" />
        </button>
      ))}
    </div>
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
 * phone view, how many screens stay loaded, colour mode, the menu's shade,
 * "Edit the menu"
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
      <DropdownMenuContent side="top" align="end" className="w-75 rounded-xl p-1.5">
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
              <DropdownMenuItem asChild className={COG_ROW}>
                <a href={screen.url} target="_blank" rel="noopener">
                  <ExternalLinkIcon className={COG_ICON} />
                  Open in its own tab
                </a>
              </DropdownMenuItem>
            ) : null}
            <StepInItem
              icon={<HistoryIcon className={COG_ICON} />}
              label="Recent screens"
              onStep={() => setView("recent")}
            />
            {panel.canPin ? (
              <StepInItem
                icon={<PinIcon className={COG_ICON} />}
                label="Pin to the menu"
                onStep={() => setView("pin")}
              />
            ) : null}
            <DropdownMenuSeparator className={COG_LINE} />
            <CogHeading>View</CogHeading>
            <StepInItem
              icon={<ZoomInIcon className={COG_ICON} />}
              label="Zoom"
              value={panel.phone ? "Off in phone view" : zoomLabel(panel.zoom)}
              onStep={() => setView("zoom")}
            />
            {/* The cog stays open, so the change shows behind it. The item's
                own tick is hidden: the switch shows the state instead. */}
            <DropdownMenuCheckboxItem
              checked={panel.phone}
              onCheckedChange={panel.setPhone}
              onSelect={(event) => event.preventDefault()}
              className={cn(COG_ROW, "[&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden")}
            >
              <SmartphoneIcon className={COG_ICON} />
              Phone view
              <RowSwitch on={panel.phone} />
            </DropdownMenuCheckboxItem>
            <StepInItem
              icon={<LayersIcon className={COG_ICON} />}
              label="Screens kept loaded"
              value={panel.kept}
              onStep={() => setView("kept")}
            />
            <DropdownMenuSeparator className={COG_LINE} />
            <CogHeading>Appearance</CogHeading>
            <div className="flex h-9 items-center gap-2.5 px-2.5 text-sm">
              <HalfCircleIcon className={cn("size-4 shrink-0", COG_ICON)} />
              Colour mode
              <ColourModeButtons value={panel.colourMode} onChange={panel.setColourMode} />
            </div>
            <StepInItem
              icon={<PaletteIcon className={COG_ICON} />}
              label="Menu shade"
              value={sidebarShadeLabel(panel.shade)}
              onStep={() => setView("shade")}
            />
            <DropdownMenuCheckboxItem
              checked={editing}
              onCheckedChange={onEditingChange}
              className={cn(COG_ROW, "pr-8")}
            >
              <PencilIcon className={COG_ICON} />
              Edit the menu
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator className={COG_LINE} />
            <DropdownMenuItem variant="destructive" onSelect={onSignOut} className={COG_ROW}>
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
