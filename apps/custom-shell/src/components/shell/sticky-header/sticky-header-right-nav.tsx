"use client"

import * as React from "react"
import { EllipsisVerticalIcon, MessageSquarePlusIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { NotificationCenter } from "@/components/shell/sticky-header/notification-center"
import { QuickSettingsMenu } from "@/components/shell/sticky-header/quick-settings-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { isExternalHref, toLinkProps } from "@/lib/nav/nav-href"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  appHeaderRightActionsForRole,
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

/** One app-owned control in the signed-in header. */
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
  unseenNotifications?: number
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

/**
 * The folded controls split into the lines they are drawn on.
 *
 * The buttons share the first line, in the order the app wrote them. Anything
 * that asked for `ownSection` goes under them, a line and a divider each. The
 * buttons are what somebody opens the dropdown to press, so they are the part
 * nearest the thumb and nearest the button that opened it.
 */
function sectionsOf(actions: readonly AppHeaderAction[]) {
  const shared = actions.filter((action) => !action.ownSection)
  const own = actions.filter((action) => action.ownSection)
  return [...(shared.length ? [shared] : []), ...own.map((action) => [action])]
}

/**
 * The app's own header controls, folded into one three-dot button at the end
 * of the row.
 *
 * A phone header fits about four controls. An app that puts three of its own
 * beside the bell and the cog leaves no room for the sidebar toggle and the
 * page's own title, and Trade's three are figures wide enough to push the bell
 * off the screen. They keep every pixel of their own design in here — the
 * dropdown holds the real controls, not copies of them, so each one still
 * opens its own panel.
 */
function AppActionsOverflow({
  actions,
  role,
}: {
  actions: readonly AppHeaderAction[]
  role: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-nav-shape="icon"
          aria-label="More"
        >
          <EllipsisVerticalIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-auto max-w-[calc(100vw-1rem)] gap-2 p-2"
      >
        {sectionsOf(actions).map((section, index) => (
          <div key={section[0].id} className={cn(index > 0 && "pt-1")}>
            {/* The control's own name, in place of a line. A divider says two
                things are different; the name says what the second one is,
                which is the question somebody opening a dropdown of unlabelled
                chips actually has. Only a section that asked for its own line
                gets one — the row of buttons at the top needs no heading. */}
            {section[0].ownSection ? (
              <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                {section[0].label}
              </p>
            ) : null}
            <div className="flex flex-row flex-wrap items-center justify-start gap-2">
              {section.map((action) => (
                <AppHeaderRightAction
                  key={action.id}
                  action={action}
                  role={role}
                />
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function StickyHeaderRightNav({
  items,
  role = "member",
  unseenNotifications,
  liveNotifications = true,
  onOpenFeedback,
  onOpenFeedbackThread,
}: StickyHeaderRightNavProps) {
  const appActions = appHeaderRightActionsForRole(role)
  const navItems = normalizeTopRightNavigation(
    items,
    appActions.map((action) => action.id)
  )
  // On a phone the controls the app marked `foldsOnPhone` leave the row and
  // fold into the three-dot button drawn after the cog, below. The rest keep
  // their place at every width.
  const isMobile = useIsMobile()
  const foldedActions = isMobile
    ? navItems.flatMap((item) => {
        if (item.type !== "app" || !item.visible) return []
        const action = appActions.find((one) => one.id === item.id)
        return action?.foldsOnPhone ? action : []
      })
    : []

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
          const action = appActions.find((one) => one.id === item.id)
          if (!action) return null
          // Drawn inside the three-dot button after the cog instead.
          if (isMobile && action.foldsOnPhone) return null
          return (
            <AppHeaderRightAction key={item.id} action={action} role={role} />
          )
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

        if (item.id === "settings") {
          return <QuickSettingsMenu key={item.id} role={role} />
        }

        // Explicit, not a catch-all `else`: when links joined this list the
        // fallthrough branch would have drawn every one of them as a bell.
        if (item.id === "notifications") {
          return (
            <NotificationCenter
              key={item.id}
              initialUnseenCount={unseenNotifications ?? 0}
              live={liveNotifications}
              canOpenSettings={role === "admin"}
              onOpenFeedback={onOpenFeedbackThread}
            />
          )
        }

        return null
      })}
      {foldedActions.length ? (
        <AppActionsOverflow actions={foldedActions} role={role} />
      ) : null}
    </div>
  )
}
