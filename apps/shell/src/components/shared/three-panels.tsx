import * as React from "react"
import { PanelLeftCloseIcon, PanelRightCloseIcon } from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDashboardPlace } from "@/lib/layout/dashboard-place"
import {
  useBlankSpaceDoubleClick,
  usePanelCollapsed,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"

type Side = { label: string; content: React.ReactNode; showLabel: string }

/** What a side panel's header can reach: the press that shuts each side, on a wide screen only. */
const SideToggles = React.createContext<{ left: () => void; right: () => void } | null>(null)

/**
 * The collapse button at a side panel header's outer edge (the Admin 3 panel
 * design, Tyler, 7 Nov 2026: "add a collasible icon here to collapse the left
 * panel", then the same for the right). It shuts the panel as a double-click
 * on its blank space does. The left one goes first in its header with
 * `-ml-1`, the right one last with `-mr-1`, so the drawn icon sits 16px from
 * the panel's edge. A narrow screen shows one panel at a time and draws none.
 */
export function SidePanelCollapseButton({ side, label }: { side: "left" | "right"; label: string }) {
  const toggles = React.useContext(SideToggles)
  if (!toggles) return null
  const Icon = side === "left" ? PanelLeftCloseIcon : PanelRightCloseIcon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={side === "left" ? "-ml-1 shrink-0 rounded-lg" : "-mr-1 shrink-0 rounded-lg"}
          onClick={toggles[side]}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The three-column dashboard every app shares (UI standard, "Three-column
 * dashboards"): each side opens at its narrowest, 16%, and the middle takes
 * the other 68% (Tyler, 31 Oct 2026: "The default width needs to be the
 * narrowest width the panel have"). It started as Project's
 * project page and moved here for Contacts on 19 Oct 2026. The side panels
 * collapse by being dragged shut or by a double-click on blank space, come
 * back from a tab on the middle panel's edge, and their widths are remembered
 * in this browser under `layoutKey`, one of `panelLayoutKey`. The page fills
 * the screen and each panel scrolls on its own. Below 1280px one panel shows
 * at a time, with a pill for each. All three stay mounted and the hidden two
 * are `inert`, so switching keeps each panel's own tab, scroll and loaded
 * lists instead of starting it over.
 *
 * `place` is not optional: every three-column dashboard goes back to where it
 * was and opens its first row on arrival (`useDashboardPlace`).
 */
export function ThreePanels({
  layoutKey,
  place,
  left,
  middle,
  right,
  showMiddleFor,
  showRightFor,
  children,
}: {
  layoutKey: string
  /**
   * Where the dashboard was, kept under `key`, one of `panelLayoutKey`'s
   * `…Place` keys: the route's own search, and the ids of the list's rows as
   * shown, first row first. The open record must be `?open=` and
   * `showRightFor` its id. `ready` is false while the rows shown are still
   * the ones from before the address changed, for a list the screen loads
   * itself rather than through the route's loader.
   */
  place: {
    key: string
    search: Record<string, unknown>
    ids: string[]
    ready?: boolean
  }
  left: Side
  middle: { label: string; content: React.ReactNode }
  right: Side
  /**
   * On a narrow screen, each new value here switches to the middle panel's
   * pill: a list picked in the left panel shows at once.
   */
  showMiddleFor?: string
  /**
   * The same for the right panel: each new value switches to its pill, and
   * going back to nothing returns to the middle one, as closing the open
   * record does.
   */
  showRightFor?: string
  /** Windows that open over the screen. */
  children?: React.ReactNode
}) {
  const wide = useWideScreen()
  const [narrowView, setNarrowView] = React.useState<"left" | "middle" | "right">("middle")
  const [shownFor, setShownFor] = React.useState(showMiddleFor)
  if (showMiddleFor !== shownFor) {
    setShownFor(showMiddleFor)
    if (showMiddleFor) setNarrowView("middle")
  }
  const [rightFor, setRightFor] = React.useState(showRightFor)
  // A record the dashboard opened by itself on arrival. Nobody pressed it, so
  // a narrow screen stays on the list rather than jumping to it.
  const [quietRight, setQuietRight] = React.useState<string>()
  if (showRightFor !== rightFor) {
    setRightFor(showRightFor)
    if (showRightFor && showRightFor === quietRight) setQuietRight(undefined)
    else if (showRightFor) setNarrowView("right")
    else if (narrowView === "right") setNarrowView("middle")
  }
  useDashboardPlace({
    placeKey: place.key,
    search: place.search,
    ids: place.ids,
    ready: place.ready,
    onQuietOpen: setQuietRight,
  })
  const leftRef = React.useRef<PanelImperativeHandle | null>(null)
  const rightRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(layoutKey)
  const leftState = usePanelCollapsed(leftRef)
  const rightState = usePanelCollapsed(rightRef)
  const toggleLeft = usePanelToggle(leftRef)
  const toggleRight = usePanelToggle(rightRef)
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)
  const toggles = React.useMemo(() => ({ left: toggleLeft, right: toggleRight }), [toggleLeft, toggleRight])

  if (!wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Tabs value={narrowView} onValueChange={(value) => setNarrowView(value as typeof narrowView)}>
          <TabsList>
            <TabsTrigger value="middle">{middle.label}</TabsTrigger>
            <TabsTrigger value="left">{left.label}</TabsTrigger>
            <TabsTrigger value="right">{right.label}</TabsTrigger>
          </TabsList>
        </Tabs>
        {(["middle", "left", "right"] as const).map((side) => (
          <WorkspacePanel
            key={side}
            className={narrowView === side ? "flex min-w-0 flex-1 flex-col" : "hidden"}
            inert={narrowView !== side}
          >
            {side === "middle" ? middle.content : side === "left" ? left.content : right.content}
          </WorkspacePanel>
        ))}
        {children}
      </div>
    )
  }

  return (
    <SideToggles.Provider value={toggles}>
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={layout.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="left"
          panelRef={leftRef}
          collapsible
          collapsedSize="0%"
          defaultSize="16%"
          minSize="16%"
          maxSize="36%"
          onResize={leftState.onResize}
        >
          <WorkspacePanel
            collapsed={leftState.collapsed}
            onDoubleClick={leftDoubleClick}
            className="flex flex-col"
          >
            {left.content}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={leftState.collapsed} />
        <ResizablePanel id="middle" defaultSize="68%" minSize="32%">
          <WorkspacePanel className="relative flex flex-col">
            {middle.content}
            {leftState.collapsed ? (
              <PanelReopenTab side="left" label={left.showLabel} onClick={toggleLeft} />
            ) : null}
            {rightState.collapsed ? (
              <PanelReopenTab side="right" label={right.showLabel} onClick={toggleRight} />
            ) : null}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={rightState.collapsed} />
        <ResizablePanel
          id="right"
          panelRef={rightRef}
          collapsible
          collapsedSize="0%"
          defaultSize="16%"
          minSize="16%"
          maxSize="36%"
          onResize={rightState.onResize}
        >
          <WorkspacePanel
            collapsed={rightState.collapsed}
            onDoubleClick={rightDoubleClick}
            className="flex flex-col"
          >
            {right.content}
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
      {children}
    </div>
    </SideToggles.Provider>
  )
}
