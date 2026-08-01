"use client"

import * as React from "react"
import {
  CheckIcon,
  Loader2Icon,
  PanelLeftIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { StickyHeaderRightNav } from "@/pages/dashboard/sticky-header/sticky-header-right-nav"
import {
  StickyHeaderLeftNav,
  type StickyHeaderLeftNavLink,
} from "@/pages/dashboard/sticky-header/sticky-header-left-nav"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { ShellTopRightNavigationItem } from "@/lib/custom-shell"

export type SaveStatus = "idle" | "saving" | "saved" | "blocked"

type StickyHeaderProps = {
  className?: string
  navLinks?: StickyHeaderLeftNavLink[]
  navContent?: React.ReactNode
  rightNavItems?: ShellTopRightNavigationItem[]
  unreadNotifications?: number
  saveStatus?: SaveStatus
  /** Admins only: the app is closed to members and this is the reminder. */
  maintenanceOn?: boolean
  maintenanceBusy?: boolean
  onTurnOffMaintenance?: () => void
  onOpenFeedback?: () => void
  onOpenFeedbackThread?: (feedbackId: string) => void
}

export function StickyHeader({
  className,
  navLinks,
  navContent,
  rightNavItems,
  unreadNotifications,
  saveStatus,
  maintenanceOn,
  maintenanceBusy,
  onTurnOffMaintenance,
  onOpenFeedback,
  onOpenFeedbackThread,
}: StickyHeaderProps) {
  const { toggleSidebar } = useSidebar()
  const isMobile = useIsMobile()

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar",
        className
      )}
    >
      <div className="flex h-full flex-1 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {isMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Toggle sidebar"
              onClick={toggleSidebar}
            >
              <PanelLeftIcon className="h-3.5 w-3.5" />
            </Button>
          ) : null}

          {navContent}

          {!navContent && navLinks && navLinks.length > 0 && (
            <StickyHeaderLeftNav navLinks={navLinks} />
          )}
        </div>
        <div className="flex items-center gap-3">
          {maintenanceOn && onTurnOffMaintenance ? (
            <MaintenanceBadge
              busy={Boolean(maintenanceBusy)}
              onTurnOff={onTurnOffMaintenance}
            />
          ) : null}
          <SaveStatusIndicator status={saveStatus} />
          <StickyHeaderRightNav
            items={rightNavItems}
            unreadNotifications={unreadNotifications}
            onOpenFeedback={onOpenFeedback}
            onOpenFeedbackThread={onOpenFeedbackThread}
          />
        </div>
      </div>
    </header>
  )
}

/**
 * The reminder that the app is shut to everyone but admins. It sits in the
 * header on every page rather than on the settings page, because the whole
 * point is that an admin who has moved on still cannot miss it — and it turns
 * itself off from right here, with no hunting for the switch.
 *
 * A phone header has room for one control, not two, so below `sm` the words and
 * the button collapse into a single red warning button that does the same job.
 */
function MaintenanceBadge({
  busy,
  onTurnOff,
}: {
  busy: boolean
  onTurnOff: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {/* The announcement is the words, not the buttons beside them — a live
          region wrapped around a control re-reads the control every time. */}
      <span
        role="status"
        className="hidden items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-sm font-medium text-destructive sm:inline-flex"
      >
        <TriangleAlertIcon className="h-4 w-4 shrink-0" aria-hidden />
        Maintenance mode is on
      </span>
      <Button
        type="button"
        variant="outline"
        className="hidden sm:inline-flex"
        disabled={busy}
        onClick={onTurnOff}
      >
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Turn off
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="icon"
        className="sm:hidden"
        title="Maintenance mode is on — turn it off"
        aria-label="Maintenance mode is on — turn it off"
        disabled={busy}
        onClick={onTurnOff}
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <TriangleAlertIcon className="size-4" />
        )}
      </Button>
    </div>
  )
}

// Auto-save status for the settings page, surfaced in the shared header so the
// settings page itself needs no save button or header. Renders nothing unless a
// save is in flight, just finished, or was refused. "blocked" is visible from
// every settings tab, which is the only warning you get when the edit that
// broke the save happened on a different tab.
function SaveStatusIndicator({ status }: { status?: SaveStatus }) {
  if (status === "saving") {
    return <span className="text-sm text-muted-foreground">Saving…</span>
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckIcon className="h-4 w-4" />
        Saved
      </span>
    )
  }
  if (status === "blocked") {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-sm text-destructive"
      >
        <TriangleAlertIcon className="h-4 w-4" />
        Not saved — add a workspace name
      </span>
    )
  }
  return null
}
