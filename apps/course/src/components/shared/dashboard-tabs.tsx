import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { useOptionalShellRuntime } from "@/components/shell/shell-layout"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  slidingPillMotionClassName,
  useSlidingPill,
} from "@/lib/hooks/use-sliding-pill"
import {
  DEFAULT_DASHBOARD_TABS,
  type DashboardTabStyle,
} from "@/lib/layout/styling-values"
import { cn } from "@/lib/utils"

export type DashboardTab = {
  value: string
  label: React.ReactNode
  /** How many rows are behind the tab, drawn after the word as `TabsCount`. */
  count?: number
  /** The tab's full name for a screen reader when the count matters, "Unread conversations, 3". */
  ariaLabel?: string
}

/** Which style the tabs around a `DashboardTabButton` are drawn in. */
const TabStyle = React.createContext<DashboardTabStyle>(DEFAULT_DASHBOARD_TABS)

/** The style this site picked in Settings → Styling, pills when it never chose. */
function useDashboardTabStyle(): DashboardTabStyle {
  const runtime = useOptionalShellRuntime()
  return runtime?.config.styling.dashboardTabs ?? DEFAULT_DASHBOARD_TABS
}

/**
 * The tabs in a three-column dashboard's panel header: List, Board, Calendar;
 * Videos, Downloaded, Broken down. Drawn the way Settings → Styling says, as
 * the shell's grey pills or as words with a line under the one showing (Tyler,
 * 20 Oct 2026: "Line tab or pill tabs should be a choice all apps can make").
 * Either way the marker slides to the tab picked, and a row too long for the
 * header scrolls sideways rather than sliding under the buttons beside it.
 *
 * `after` is a tab-shaped control at the end of the row, such as a More
 * dropdown, drawn with `DashboardTabButton`. `style` overrides the setting,
 * for the setting's own preview.
 */
export function DashboardTabs({
  value,
  onValueChange,
  tabs,
  after,
  style,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: DashboardTab[]
  after?: React.ReactNode
  style?: DashboardTabStyle
  className?: string
}) {
  const picked = useDashboardTabStyle()
  const shown = style ?? picked
  return (
    <TabStyle.Provider value={shown}>
      {shown === "underline" ? (
        <UnderlineTabs value={value} onValueChange={onValueChange} tabs={tabs} after={after} className={className} />
      ) : (
        <ScrollArea className={cn("min-w-0 flex-1", className)}>
          <Tabs value={value} onValueChange={onValueChange} className="w-max">
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} aria-label={tab.ariaLabel}>
                  {tab.label}
                  {tab.count !== undefined ? <TabsCount>{tab.count}</TabsCount> : null}
                </TabsTrigger>
              ))}
              {after}
            </TabsList>
          </Tabs>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </TabStyle.Provider>
  )
}

/**
 * Words with a line under the one showing, sitting on the header's bottom
 * edge. It started as Project's project page header (Tyler's drawing of
 * 14 Oct 2026) and moved here on 20 Oct 2026. The line is one piece that
 * slides, like the pill.
 */
function UnderlineTabs({
  value,
  onValueChange,
  tabs,
  after,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: DashboardTab[]
  after?: React.ReactNode
  className?: string
}) {
  const { trackRef, trackProps, pillProps } = useSlidingPill<HTMLDivElement>({
    selected: '[data-slot="dashboard-tab"][data-state="active"]',
    observe: '[data-slot="dashboard-tab"]',
    attributes: ["data-state"],
    variant: "underline",
  })
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      // Out to the header's top and bottom edges, so the line sits on its divider.
      className={cn("-my-3 flex min-w-0 flex-1 self-stretch", className)}
    >
      <ScrollArea className="h-full min-w-0" viewportClassName="[&>div]:h-full">
        <div ref={trackRef} {...trackProps} className="relative flex h-full w-max items-stretch gap-5 px-1">
          <span data-slot="dashboard-tab-line" {...pillProps} />
          <TabsPrimitive.List className="flex items-stretch gap-5">
            {tabs.map((tab) => (
              <TabsPrimitive.Trigger
                key={tab.value}
                value={tab.value}
                aria-label={tab.ariaLabel}
                data-slot="dashboard-tab"
                className={underlineTabClassName}
              >
                {tab.label}
                {tab.count !== undefined ? <TabsCount>{tab.count}</TabsCount> : null}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
          {after}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TabsPrimitive.Root>
  )
}

const underlineTabClassName = cn(
  "relative z-10 inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors",
  slidingPillMotionClassName,
  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
  "data-[state=active]:text-foreground",
  // Before the line is measured, the chosen tab draws its own. See `use-sliding-pill.ts`.
  "border-b-2 border-transparent in-data-[pill=pending]:data-[state=active]:border-foreground"
)

/**
 * A control drawn as one more tab at the end of the row, such as a More
 * dropdown that shows which of its views is open. Pass `active` while it is
 * the one showing, so the pill or the line moves under it. It passes its ref
 * and props on, so it can be a dropdown's trigger.
 */
export function DashboardTabButton({
  active = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  const style = React.useContext(TabStyle)
  return (
    <button
      type="button"
      data-slot={style === "underline" ? "dashboard-tab" : "tabs-trigger"}
      data-state={active ? "active" : "inactive"}
      aria-current={active ? "page" : undefined}
      className={cn(
        style === "underline"
          ? underlineTabClassName
          : cn(
              "relative z-10 inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
              slidingPillMotionClassName,
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              "data-[state=active]:text-foreground",
              "in-data-[pill=pending]:data-[state=active]:bg-background in-data-[pill=pending]:data-[state=active]:shadow-sm"
            ),
        className
      )}
      {...props}
    />
  )
}
