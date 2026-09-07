"use client"

import * as React from "react"
import { MessageSquarePlusIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { NotificationCenter } from "@/components/shell/sticky-header/notification-center"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import { isExternalHref, toLinkProps } from "@/lib/nav/nav-href"
import { Button } from "@/components/ui/button"
import {
  appHeaderRightActionForRole,
  type AppHeaderAction,
  type AppHeaderActionProps,
} from "@/lib/app-options"
import {
  canSeeShellEntry,
  isShellEntryNamed,
  normalizeTopRightNavigation,
  renderShellIcon,
  type ShellTopRightLink,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"

const lazyHeaderActions = new Map<
  AppHeaderAction["component"],
  React.LazyExoticComponent<React.ComponentType<AppHeaderActionProps>>
>()

/** The app's one place in the signed-in header. */
function AppHeaderRightAction({
  action,
  role,
}: AppHeaderActionProps & { action: AppHeaderAction }) {
  const asked = action.component

  let Action = lazyHeaderActions.get(asked)
  if (!Action) {
    Action = React.lazy(asked)
    lazyHeaderActions.set(asked, Action)
  }

  return (
    <React.Suspense fallback={null}>
      {React.createElement(Action, { role })}
    </React.Suspense>
  )
}

type StickyHeaderRightNavProps = {
  items?: ShellTopRightNavigationItem[]
  /** Who is looking. A member never gets a link to an admin page drawn. */
  role?: string
  unreadNotifications?: number
  /** The app-wide switch for the bell's live connection. */
  liveNotifications?: boolean
  onOpenFeedback?: () => void
  onOpenFeedbackThread?: (feedbackId: string) => void
}

/**
 * A link an admin put on the header row, dressed like the Feedback button so
 * the row reads as one set of controls. Unnamed, address-less and — for
 * members — admin-page links have already been filtered out by the caller.
 */
function TopRightLinkButton({ link }: { link: ShellTopRightLink }) {
  const body = (
    <>
      {renderShellIcon(link.icon, "h-3.5 w-3.5")}
      <span className="hidden sm:inline">{link.label}</span>
    </>
  )

  if (isExternalHref(link.href)) {
    return (
      <Button
        asChild
        variant="outline"
        data-icon="inline-start"
        data-nav-shape="text"
      >
        <a href={link.href} target="_blank" rel="noreferrer">
          {body}
        </a>
      </Button>
    )
  }

  return (
    <Button
      asChild
      variant="outline"
      data-icon="inline-start"
      data-nav-shape="text"
    >
      <Link {...toLinkProps(link.href)}>{body}</Link>
    </Button>
  )
}

export function StickyHeaderRightNav({
  items,
  role = "member",
  unreadNotifications,
  liveNotifications = true,
  onOpenFeedback,
  onOpenFeedbackThread,
}: StickyHeaderRightNavProps) {
  const appAction = appHeaderRightActionForRole(role)
  const navItems = normalizeTopRightNavigation(
    items,
    appAction ? [appAction.id] : []
  )

  return (
    <div className="flex items-center gap-1 pr-1 [&>[data-nav-shape=icon]+[data-nav-shape=text]]:ml-2 [&>[data-nav-shape=text]+[data-nav-shape=icon]]:ml-2">
      {navItems.map((item) => {
        if (item.type === "link") {
          // The same rules the sidebar renders by: an unnamed or address-less
          // link stays editable in Settings but never reaches the header, and
          // a member is never shown a link to an admin page whatever the row
          // says — the /admin route guard refuses them a second time anyway.
          if (!isShellEntryNamed(item)) return null
          if (!item.href.trim()) return null
          if (!canSeeShellEntry(item, role)) return null
          return <TopRightLinkButton key={item.id} link={item} />
        }

        if (!item.visible) return null

        if (item.type === "app") {
          return appAction && item.id === appAction.id ? (
            <AppHeaderRightAction
              key={item.id}
              action={appAction}
              role={role}
            />
          ) : null
        }

        if (item.id === "feedback") {
          return onOpenFeedback ? (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              data-icon="inline-start"
              data-nav-shape="text"
              aria-label="Send feedback"
              onClick={onOpenFeedback}
            >
              <MessageSquarePlusIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Feedback</span>
            </Button>
          ) : null
        }

        if (item.id === "theme") {
          return <ThemeToggle key={item.id} />
        }

        // Explicit, not a catch-all `else`: when links joined this list the
        // fallthrough branch would have drawn every one of them as a bell.
        if (item.id === "notifications") {
          return (
            <NotificationCenter
              key={item.id}
              initialUnreadCount={unreadNotifications ?? 0}
              live={liveNotifications}
              onOpenFeedback={onOpenFeedbackThread}
            />
          )
        }

        return null
      })}
    </div>
  )
}
