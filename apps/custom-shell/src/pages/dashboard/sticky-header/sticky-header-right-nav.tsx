"use client"

import { MessageSquarePlusIcon, Moon, Sun } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { useTheme } from "@/pages/dashboard/sticky-header/light-dark-switcher"
import { NotificationCenter } from "@/pages/dashboard/sticky-header/notification-center"
import { isExternalHref, toLinkProps } from "@/lib/nav-href"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  canSeeShellEntry,
  isShellEntryNamed,
  normalizeTopRightNavigation,
  renderShellIcon,
  type ShellTopRightLink,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"

function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type StickyHeaderRightNavProps = {
  items?: ShellTopRightNavigationItem[]
  /** Who is looking. A member never gets a link to an admin page drawn. */
  role?: string
  unreadNotifications?: number
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
      <Button asChild variant="outline" data-icon="inline-start">
        <a href={link.href} target="_blank" rel="noreferrer">
          {body}
        </a>
      </Button>
    )
  }

  return (
    <Button asChild variant="outline" data-icon="inline-start">
      <Link {...toLinkProps(link.href)}>{body}</Link>
    </Button>
  )
}

export function StickyHeaderRightNav({
  items,
  role = "member",
  unreadNotifications,
  onOpenFeedback,
  onOpenFeedbackThread,
}: StickyHeaderRightNavProps) {
  const navItems = normalizeTopRightNavigation(items)

  return (
    <div className="flex items-center gap-2 pr-1">
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

        if (item.id === "feedback") {
          return onOpenFeedback ? (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              data-icon="inline-start"
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
              onOpenFeedback={onOpenFeedbackThread}
            />
          )
        }

        return null
      })}
    </div>
  )
}
