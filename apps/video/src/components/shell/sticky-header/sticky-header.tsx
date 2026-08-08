"use client"

import * as React from "react"
import {
  CheckIcon,
  EyeIcon,
  Loader2Icon,
  PanelLeftIcon,
  PauseIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { announcementLevelBannerClassNames } from "@/lib/announcement"
import { formatDateTime } from "@/lib/format/format-time"
import { useStopViewingAs } from "@/lib/hooks/use-stop-viewing-as"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { StickyHeaderRightNav } from "@/components/shell/sticky-header/sticky-header-right-nav"
import {
  StickyHeaderLeftNav,
  type StickyHeaderLeftNavLink,
} from "@/components/shell/sticky-header/sticky-header-left-nav"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { ShellTopRightNavigationItem } from "@/lib/custom-shell"

export type SaveStatus = "idle" | "saving" | "saved" | "blocked"

/** Who an admin is viewing the app as, and who they really are. */
export type ViewingAsSummary = {
  memberName: string
  memberEmail: string
  adminName: string
}

type StickyHeaderProps = {
  className?: string
  navLinks?: StickyHeaderLeftNavLink[]
  /** Most links to draw before the rest fold into a "more" menu. 0 = all. */
  navLinkLimit?: number
  navContent?: React.ReactNode
  rightNavItems?: ShellTopRightNavigationItem[]
  /** Who is looking, for the top-right row's admin-link guard. */
  role?: string
  unreadNotifications?: number
  /** The app-wide switch for the bell's live connection. */
  liveNotifications?: boolean
  saveStatus?: SaveStatus
  /** Admins only: the app is closed to members and this is the reminder. */
  maintenanceOn?: boolean
  maintenanceBusy?: boolean
  /**
   * Admins only, and set only while everything is stopped: the reminder, and
   * who stopped it. Absent means automations are running.
   */
  automationPause?: { changedBy: string; changedAt: string } | null
  automationPauseBusy?: boolean
  /** Set while an admin is looking at the app as somebody else. */
  viewingAs?: ViewingAsSummary | null
  onTurnOffMaintenance?: () => void
  onResumeAutomations?: () => void
  onOpenFeedback?: () => void
  onOpenFeedbackThread?: (feedbackId: string) => void
}

export function StickyHeader({
  className,
  navLinks,
  navLinkLimit,
  navContent,
  rightNavItems,
  role,
  unreadNotifications,
  liveNotifications,
  saveStatus,
  maintenanceOn,
  maintenanceBusy,
  automationPause,
  automationPauseBusy,
  viewingAs,
  onTurnOffMaintenance,
  onResumeAutomations,
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
            <StickyHeaderLeftNav navLinks={navLinks} limit={navLinkLimit} />
          )}
        </div>
        <div className="flex items-center gap-3">
          {viewingAs ? <ViewAsBadge viewingAs={viewingAs} /> : null}
          {maintenanceOn && onTurnOffMaintenance ? (
            <MaintenanceBadge
              busy={Boolean(maintenanceBusy)}
              onTurnOff={onTurnOffMaintenance}
            />
          ) : null}
          {automationPause && onResumeAutomations ? (
            <AutomationsPausedBadge
              pause={automationPause}
              busy={Boolean(automationPauseBusy)}
              onResume={onResumeAutomations}
            />
          ) : null}
          <SaveStatusIndicator status={saveStatus} />
          <StickyHeaderRightNav
            items={rightNavItems}
            role={role}
            unreadNotifications={unreadNotifications}
            liveNotifications={liveNotifications}
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
      <DisabledReason
        disabled={busy}
        reason="Maintenance mode is still turning off."
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="sm:hidden"
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
          </TooltipTrigger>
          <TooltipContent>Maintenance mode is on — turn it off</TooltipContent>
        </Tooltip>
      </DisabledReason>
    </div>
  )
}

/**
 * The reminder that every automation is stopped.
 *
 * Same shape and the same red as the maintenance reminder, and there for the
 * same reason: the switch gets hit at eleven at night in the middle of
 * something going wrong, and an admin who moves on to another screen must not
 * be able to leave it on by forgetting about it. It resumes from right here,
 * with no walk back to the automations page to find the switch.
 *
 * Who hit the switch and when is one hover away rather than gone. This app has
 * no activity log any more, so that sentence is the whole record of the flip —
 * it must be readable somewhere, and this badge is the one thing on screen
 * whenever the switch is on.
 *
 * How many runs are being held is deliberately not up here: the header does not
 * refetch on a timer, and a stale count reads worse than no count. The toast
 * fired when the switch was thrown says the number.
 *
 * A phone header has room for one control, not two, so below `sm` the words and
 * the button collapse into a single red button that does the same job.
 */
function AutomationsPausedBadge({
  pause,
  busy,
  onResume,
}: {
  pause: { changedBy: string; changedAt: string }
  busy: boolean
  onResume: () => void
}) {
  // Only when the row really recorded it — an install whose switch was flipped
  // by hand in the database has neither, and half a sentence is worse than none.
  const who =
    pause.changedBy && pause.changedAt
      ? ` Paused by ${pause.changedBy} on ${formatDateTime(pause.changedAt)}.`
      : ""
  const fullSentence = `Every automation is stopped. Runs already going are held where they stopped and carry on when you resume.${who}`

  return (
    <div className="flex items-center gap-2">
      {/* The announcement is the words, not the buttons beside them — a live
          region wrapped around a control re-reads the control every time. */}
      <span
        role="status"
        title={fullSentence}
        className="hidden items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-sm font-medium text-destructive sm:inline-flex"
      >
        <PauseIcon className="h-4 w-4 shrink-0" aria-hidden />
        Automations paused
      </span>
      <Button
        type="button"
        variant="outline"
        className="hidden sm:inline-flex"
        disabled={busy}
        onClick={onResume}
      >
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Resume
      </Button>
      <DisabledReason disabled={busy} reason="Wait for automations to resume.">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="sm:hidden"
              aria-label={`${fullSentence} Resume them.`}
              disabled={busy}
              onClick={onResume}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PauseIcon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{fullSentence}</TooltipContent>
        </Tooltip>
      </DisabledReason>
    </div>
  )
}

/**
 * The reminder that you are looking at somebody else's screen.
 *
 * It sits in the header, beside the maintenance reminder and for the same
 * reason: an admin must never be able to forget they are somebody else, because
 * from here on every click is that person's. As a card in the page it scrolled
 * out of sight partway down the first long table, and every click after that
 * was made silently as the member.
 *
 * It borrows the announcement banner's "heads-up" colours rather than keeping
 * its own copy of them, so retuning the warning look moves both at once.
 *
 * A phone header has room for one control, not two, so below `sm` the words and
 * the button collapse into a single button that does the same job and carries
 * the member's name in its label — the name is what would have wrapped.
 *
 * The two reminders never appear together: while the view is on, the app treats
 * you as the member, and the maintenance reminder is admins-only.
 */
function ViewAsBadge({ viewingAs }: { viewingAs: ViewingAsSummary }) {
  const { leaving, stopViewing } = useStopViewingAs()
  const { memberName, memberEmail, adminName } = viewingAs
  // The email and your own name will not fit up here, so they are one hover
  // away instead of gone.
  const fullSentence = `Viewing as ${memberName} (${memberEmail}). Everything you do here is done as them. You are signed in as ${adminName}.`

  return (
    <div className="flex items-center gap-2">
      {/* The announcement is the words, not the button beside them — a live
          region wrapped around a control re-reads the control every time. */}
      <span
        role="status"
        title={fullSentence}
        className={cn(
          "hidden max-w-56 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium sm:inline-flex",
          announcementLevelBannerClassNames.warning
        )}
      >
        <EyeIcon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Viewing as {memberName}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        className="hidden sm:inline-flex"
        disabled={leaving}
        onClick={() => void stopViewing()}
      >
        {leaving ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Stop viewing
      </Button>
      <DisabledReason disabled={leaving} reason="Finish leaving this view first.">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn("sm:hidden", announcementLevelBannerClassNames.warning)}
              aria-label={`${fullSentence} Stop viewing.`}
              disabled={leaving}
              onClick={() => void stopViewing()}
            >
              {leaving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{fullSentence}</TooltipContent>
        </Tooltip>
      </DisabledReason>
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
