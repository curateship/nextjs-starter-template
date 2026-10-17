import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DASHBOARD_CARD_HEADER_HEIGHT_PX } from "@/lib/layout/dashboard-card-header"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

export const dashboardCardHeadingClassName =
  "font-heading text-[0.891rem] leading-snug font-medium"

export const dashboardCardTabClassName =
  "font-heading text-[0.792rem] font-medium"

const backTargetClassName =
  "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"

/**
 * The one frame every dashboard card header uses.
 *
 * Its 32px content row sits inside 12px on every side. The height comes from
 * one CSS variable because collapsed panels and flat-mode divider lines need
 * the same number without rebuilding this class elsewhere.
 */
export function DashboardCardHeader({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-card-header"
      className={cn(
        "flex min-h-[var(--dashboard-card-header-height)] shrink-0 items-center gap-2 border-b p-3",
        className
      )}
      style={{
        ...style,
        "--dashboard-card-header-height": `${DASHBOARD_CARD_HEADER_HEIGHT_PX}px`,
      } as React.CSSProperties}
      {...props}
    />
  )
}

export function DashboardCardHeaderIcon({
  className,
  interactive,
  children,
}: {
  className?: string
  /**
   * The slot holds a real control — the way back — rather than decoration.
   *
   * Decoration is hidden from screen readers, because an icon beside a title
   * only says the title again. A button in that same square is the opposite:
   * hiding it leaves something a keyboard can land on and a screen reader
   * cannot name.
   */
  interactive?: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-muted-foreground",
        className
      )}
      aria-hidden={interactive ? undefined : true}
    >
      {children}
    </span>
  )
}

/**
 * The dashboard card header pattern, sized for resizable workspace panels.
 *
 * The line under it is a plain `border-b`, with no colour of its own, so it
 * takes `--border` — which is what the Divider lines setting writes. Every
 * header line in the app is drawn this way, `ChartCard` included, so a card
 * with tabs and a card with a chart never disagree about the shade. Naming a
 * colour here is what made them disagree: it stayed a fixed grey while the
 * setting moved everything else.
 */
export function DashboardCardTitleHeader({
  icon,
  back,
  title,
  meta,
  action,
  className,
}: {
  icon: React.ReactNode
  /**
   * Turns the icon into the way out. A header opened from a list — one email,
   * one automation, one backtest — has an icon that only repeats what the
   * title already says, so the same square carries an arrow back instead.
   *
   * Either a place to go or something to do, because not every one of these
   * navigates: the backtest header's arrow swaps the picture where it stands.
   * Both are drawn here so the two can never end up different sizes.
   */
  back?: { label: string } & (
    | { to: string; onClick?: never }
    | { onClick: () => void; to?: never }
  )
  title: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <DashboardCardHeader className={cn("gap-2.5", className)}>
      <DashboardCardHeaderIcon
        interactive={back !== undefined}
        className={back ? "size-8" : undefined}
      >
        {back ? (
          back.to !== undefined ? (
            <Link
              to={back.to}
              aria-label={back.label}
              className={cn(backTargetClassName, focusRing)}
            >
              <ArrowLeftIcon className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={back.label}
              className={cn(backTargetClassName, focusRing)}
            >
              <ArrowLeftIcon className="size-4" />
            </button>
          )
        ) : (
          icon
        )}
      </DashboardCardHeaderIcon>
      <h2 className={cn("min-w-0 truncate", dashboardCardHeadingClassName)}>
        {title}
      </h2>
      {meta ? (
        <div className="min-w-0 truncate text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </DashboardCardHeader>
  )
}

export function DashboardCardTabsHeader({
  children,
  action,
}: {
  children: React.ReactNode
  /**
   * Controls pinned at the row's right-hand end — the account panel's add
   * button, the bottom panel's Close all. A separate slot rather than an
   * `ml-auto` child inside the tab list, because the list's own gap would
   * then sit between the last tab and the control and push it past the
   * row's edge on a narrow panel.
   */
  action?: React.ReactNode
}) {
  return (
    <DashboardCardHeader>
      <TabsList className="min-w-0 justify-start">
        {children}
      </TabsList>
      {action ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </DashboardCardHeader>
  )
}

export function DashboardCardTab({
  icon,
  label,
  count,
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger> & {
  icon: React.ReactNode
  label: React.ReactNode
  count?: number
}) {
  return (
    <TabsTrigger
      className={cn(
        "group/panel-tab flex-none",
        dashboardCardTabClassName,
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-1.5">
        <DashboardCardHeaderIcon className="group-data-[state=active]/panel-tab:text-foreground">
          {icon}
        </DashboardCardHeaderIcon>
        {label}
        {count !== undefined ? (
          <span className="ml-[3px] inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-xs leading-none font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </span>
    </TabsTrigger>
  )
}
